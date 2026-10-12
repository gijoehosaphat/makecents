import { Knex } from 'knex'

// Category hints learned from the categories people have already chosen.
//
// - payee_key() reduces a bank's payee text to a stable key ("SOBEYS #684" -> "sobeys").
// - transaction.category_source records how a category got there: 'manual' (the person picked it;
//   NULL on older rows means the same), 'suggested' (they accepted a hint) or 'auto' (applied on
//   import). Only manual/suggested rows teach the suggestions, so an automatic guess can't
//   reinforce itself.
// - transaction_suggested_categories() ranks likely categories for a transaction from three signals:
//   the same payee at a similar amount, the same payee alone, and what the neighbouring days were
//   categorized as (a vacation's spending belongs to Vacation). It is exposed by PostGraphile as the
//   `suggestedCategories` field on Transaction.
//
// Tuned by replaying the existing history in date order: payee + similar amount, 8+ matches all in
// one category, was 99.4% right; the payee alone only 63%. Only the former is flagged auto_apply.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE FUNCTION app_private.payee_key(name text)
    RETURNS text
    AS $$
      SELECT btrim(regexp_replace(regexp_replace(
        regexp_replace(
          lower(coalesce(name, '')),
          '\\y(debit card purchase|debit purchase|purchase authorized on|pos debit|pos|recurring payment|ach debit|ach credit|checkcard|check card|web pmts?|online payment)\\y',
          ' ', 'g'),
        '[^a-z& ]+', ' ', 'g'),
        '\\s+', ' ', 'g'));
    $$
    LANGUAGE sql
    IMMUTABLE;
  `)
  await knex.raw(`COMMENT ON FUNCTION app_private.payee_key(text) IS '@omit'`)

  await knex.raw(`
    CREATE INDEX transaction_payee_key_idx
    ON app_private.transaction (app_private.payee_key(coalesce(custom_name, name)))
    WHERE category_id IS NOT NULL
  `)

  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.text('category_source').nullable()
  })
  await knex.raw(`
    ALTER TABLE app_private.transaction
    ADD CONSTRAINT transaction_category_source_check CHECK (category_source IN ('manual', 'suggested', 'auto'))
  `)

  // Changing a category without saying where it came from is a manual choice.
  await knex.raw(`
    CREATE FUNCTION app_private.transaction_category_source()
    RETURNS trigger
    AS $$
      BEGIN
        IF NEW.category_id IS NULL THEN
          NEW.category_source := NULL;
        ELSIF TG_OP = 'INSERT' THEN
          NEW.category_source := coalesce(NEW.category_source, 'manual');
        ELSIF NEW.category_id IS DISTINCT FROM OLD.category_id
          AND NEW.category_source IS NOT DISTINCT FROM OLD.category_source THEN
          NEW.category_source := 'manual';
        END IF;
        RETURN NEW;
      END;
    $$
    LANGUAGE plpgsql;
  `)
  await knex.raw(`COMMENT ON FUNCTION app_private.transaction_category_source() IS '@omit'`)
  await knex.raw(`
    CREATE TRIGGER transaction_category_source
    BEFORE INSERT OR UPDATE OF category_id, category_source
    ON app_private.transaction
    FOR EACH ROW
    EXECUTE FUNCTION app_private.transaction_category_source();
  `)

  await knex.raw(`
    CREATE TYPE app_private.category_suggestion AS (
      category_id int,
      confidence numeric,
      tier text,
      matches int,
      total int,
      auto_apply boolean
    )
  `)

  await knex.raw(`
    CREATE FUNCTION app_private.transaction_suggested_categories(transaction app_private.transaction, max_results int DEFAULT 3)
    RETURNS SETOF app_private.category_suggestion
    AS $$
      WITH me AS (
        SELECT app_private.payee_key(coalesce(transaction.custom_name, transaction.name)) AS key,
          abs(transaction.amount) AS amount,
          (SELECT account_id FROM app_private.bank_account WHERE id = transaction.bank_account_id) AS account_id
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
    LANGUAGE sql
    STABLE;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_suggested_categories(app_private.transaction, int)')
  await knex.raw('DROP TYPE IF EXISTS app_private.category_suggestion')
  await knex.raw('DROP TRIGGER IF EXISTS transaction_category_source ON app_private.transaction')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_category_source()')
  await knex.raw('ALTER TABLE app_private.transaction DROP CONSTRAINT IF EXISTS transaction_category_source_check')
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropColumn('category_source')
  })
  await knex.raw('DROP INDEX IF EXISTS app_private.transaction_payee_key_idx')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.payee_key(text)')
}
