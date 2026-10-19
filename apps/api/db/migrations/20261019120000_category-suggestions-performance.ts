import { Knex } from 'knex'

// transaction_suggested_categories runs once per row of every transaction list. Under row-level security
// Postgres won't evaluate the non-leakproof payee_key() ahead of the policy, so transaction_payee_key_idx
// couldn't be used and every call scanned the whole history, running payee_key's regexes on each row
// (~80ms a call, ~4s for a page of 50). SECURITY DEFINER skips RLS inside the function, the same as
// transaction_search; the account lookup in `me` applies the select policy's account check instead, and
// every lookup below is already scoped to that account, so a transaction from another account gets no
// suggestions.

function suggestedCategoriesFunction(accountIdLookup: string, options: string) {
  return `
    CREATE OR REPLACE FUNCTION app_private.transaction_suggested_categories(transaction app_private.transaction, max_results int DEFAULT 3)
    RETURNS SETOF app_private.category_suggestion
    AS $$
      WITH me AS (
        SELECT app_private.payee_key(coalesce(transaction.custom_name, transaction.name)) AS key,
          abs(transaction.amount) AS amount,
          ${accountIdLookup} AS account_id
      ),
      -- Same payee, as categorized by a person (split parents hold no category of their own).
      payee_history AS (
        SELECT h.category_id, abs(h.amount) AS amount
        FROM app_private.transaction h
        JOIN app_private.bank_account b ON b.id = h.bank_account_id
        CROSS JOIN me
        WHERE me.key <> ''
          AND app_private.payee_key(coalesce(h.custom_name, h.name)) = me.key
          AND b.account_id = me.account_id
          AND h.category_id IS NOT NULL
          AND h.id <> transaction.id
          AND coalesce(h.category_source, 'manual') <> 'auto'
          AND NOT EXISTS (SELECT 1 FROM app_private.transaction c WHERE c.split_source_id = h.id)
      ),
      -- ...at about the same amount: within 2%, or 50 cents.
      similar_amount AS (
        SELECT payee_history.category_id
        FROM payee_history CROSS JOIN me
        WHERE abs(payee_history.amount - me.amount) <= greatest(me.amount * 0.02, 50)
      ),
      -- What the days around it were categorized as, across the account's bank accounts.
      neighbours AS (
        SELECT h.category_id
        FROM app_private.transaction h
        JOIN app_private.bank_account b ON b.id = h.bank_account_id
        CROSS JOIN me
        WHERE b.account_id = me.account_id
          AND h.posted BETWEEN transaction.posted - interval '2 days' AND transaction.posted + interval '2 days'
          AND h.category_id IS NOT NULL
          AND h.id <> transaction.id
          AND coalesce(h.category_source, 'manual') <> 'auto'
          AND NOT EXISTS (SELECT 1 FROM app_private.transaction c WHERE c.split_source_id = h.id)
      ),
      candidates AS (
        SELECT category_id, 'payee_amount' AS tier, 1 AS tier_rank, count(*)::int AS matches,
          (SELECT count(*) FROM similar_amount)::int AS total
        FROM similar_amount
        GROUP BY category_id
        HAVING (SELECT count(*) FROM similar_amount) >= 2
        UNION ALL
        SELECT category_id, 'payee', 2, count(*)::int, (SELECT count(*) FROM payee_history)::int
        FROM payee_history
        GROUP BY category_id
        UNION ALL
        SELECT category_id, 'nearby', 3, count(*)::int, (SELECT count(*) FROM neighbours)::int
        FROM neighbours
        GROUP BY category_id
        HAVING (SELECT count(*) FROM neighbours) >= 3
          AND count(*) >= 0.5 * (SELECT count(*) FROM neighbours)
      ),
      scored AS (
        SELECT *, matches::numeric / (total + 1) AS confidence,
          -- Strict enough to apply without asking: 8+ matches, every one the same category.
          (tier = 'payee_amount' AND matches >= 8 AND matches = total) AS auto_apply
        FROM candidates
      ),
      best AS (
        SELECT DISTINCT ON (category_id)
          category_id, confidence, tier, matches, total,
          bool_or(auto_apply) OVER (PARTITION BY category_id) AS auto_apply
        FROM scored
        ORDER BY category_id, confidence DESC, tier_rank
      )
      SELECT category_id, round(confidence, 4), tier, matches, total, auto_apply
      FROM best
      ORDER BY confidence DESC, matches DESC, category_id
      LIMIT max_results;
    $$
    ${options};
  `
}

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    suggestedCategoriesFunction(
      `(SELECT account_id FROM app_private.bank_account
          WHERE id = transaction.bank_account_id
            AND account_id IN (SELECT app_private.current_user_account_ids()))`,
      `LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp`,
    ),
  )
}

export async function down(knex: Knex): Promise<void> {
  // CREATE OR REPLACE resets every unstated property, so this is SECURITY INVOKER with no SET again.
  await knex.raw(
    suggestedCategoriesFunction(
      `(SELECT account_id FROM app_private.bank_account WHERE id = transaction.bank_account_id)`,
      `LANGUAGE sql
    STABLE`,
    ),
  )
}

export const configuration = { transaction: true }
