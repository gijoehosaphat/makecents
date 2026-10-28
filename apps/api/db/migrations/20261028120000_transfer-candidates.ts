import { Knex } from 'knex'

// Ranked counterparts for linking a transaction as a transfer between bank accounts.
//
// - transaction_transfer_candidates() lists transactions of the opposite amount in the account's other
//   bank accounts that could themselves be linked (uncategorized, unsplit, not already a transfer),
//   nearest in date first. Wording that points at a transfer counts as being 3 days closer per signal:
//   either side saying "transfer"/"tfr"/"payment thank you", and either side naming the other's bank
//   account (by name, or the last 4 digits of its number). `within_days` limits how far apart they may
//   be; NULL means any distance. Exposed as `transferCandidates` on Transaction.
// - transaction_suggested_transfer() is the best candidate within 4 days for a transaction that can be
//   linked, shown as a hint on transaction rows. Exposed as `suggestedTransfer`.
//
// Both are SECURITY DEFINER for the same reason as transaction_suggested_categories: under row-level
// security every candidate row would re-check the policy. The account lookup applies the select policy's
// account check instead, and candidates come only from that account's bank accounts.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE FUNCTION app_private.transfer_text(name text, memo text)
    RETURNS text
    AS $$
      SELECT ' ' || btrim(regexp_replace(lower(concat_ws(' ', name, memo)), '[^a-z0-9]+', ' ', 'g')) || ' ';
    $$
    LANGUAGE sql
    IMMUTABLE;
  `)
  await knex.raw(`COMMENT ON FUNCTION app_private.transfer_text(text, text) IS '@omit'`)

  // Whether transfer_text() names a bank account: its name, or the last 4 digits of its number.
  await knex.raw(`
    CREATE FUNCTION app_private.transfer_text_mentions(text text, account_name text, account_number text)
    RETURNS boolean
    AS $$
      SELECT (length(btrim(account_name)) >= 3
          AND position(app_private.transfer_text(account_name, NULL) IN text) > 0)
        OR (length(regexp_replace(coalesce(account_number, ''), '[^0-9]', '', 'g')) >= 4
          AND position(' ' || right(regexp_replace(account_number, '[^0-9]', '', 'g'), 4) IN text) > 0);
    $$
    LANGUAGE sql
    IMMUTABLE;
  `)
  await knex.raw(`COMMENT ON FUNCTION app_private.transfer_text_mentions(text, text, text) IS '@omit'`)

  await knex.raw(`
    CREATE FUNCTION app_private.transaction_transfer_candidates(transaction app_private.transaction, within_days int DEFAULT NULL)
    RETURNS SETOF app_private.transaction
    AS $$
      WITH me AS (
        SELECT b.account_id, b.name AS account_name, b.bank_account_id AS account_number,
          app_private.transfer_text(coalesce(transaction.custom_name, transaction.name),
            coalesce(transaction.custom_memo, transaction.memo)) AS text
        FROM app_private.bank_account b
        WHERE b.id = transaction.bank_account_id
          AND b.account_id IN (SELECT app_private.current_user_account_ids())
      ),
      candidates AS (
        SELECT c, abs(extract(epoch FROM c.posted - transaction.posted)) / 86400 AS days_apart,
          (me.text ~ ' (transfer|tfr|trf|xfer|trsf|etfr|payment thank you) '
            OR cb.text ~ ' (transfer|tfr|trf|xfer|trsf|etfr|payment thank you) ')::int
          + (app_private.transfer_text_mentions(cb.text, me.account_name, me.account_number)
            OR app_private.transfer_text_mentions(me.text, b.name, b.bank_account_id))::int AS signals
        FROM me
        JOIN app_private.bank_account b ON b.account_id = me.account_id AND b.id <> transaction.bank_account_id
        JOIN app_private.transaction c ON c.bank_account_id = b.id
        CROSS JOIN LATERAL (
          SELECT app_private.transfer_text(coalesce(c.custom_name, c.name), coalesce(c.custom_memo, c.memo)) AS text
        ) cb
        WHERE c.amount = -transaction.amount
          AND c.category_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM app_private.transaction s WHERE s.split_source_id = c.id)
          AND NOT EXISTS (
            SELECT 1 FROM app_private.transfer t WHERE t.transaction_source_id = c.id OR t.transaction_target_id = c.id
          )
          AND (within_days IS NULL
            OR c.posted BETWEEN transaction.posted - make_interval(days => within_days)
              AND transaction.posted + make_interval(days => within_days))
      )
      SELECT (c).*
      FROM candidates
      ORDER BY days_apart - 3 * signals, days_apart, (c).posted DESC, (c).id;
    $$
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)

  await knex.raw(`
    CREATE FUNCTION app_private.transaction_suggested_transfer(transaction app_private.transaction)
    RETURNS app_private.transaction
    AS $$
      SELECT candidate.*
      FROM app_private.transaction_transfer_candidates(transaction, 4) candidate
      WHERE transaction.category_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM app_private.transaction s WHERE s.split_source_id = transaction.id)
        AND NOT EXISTS (
          SELECT 1 FROM app_private.transfer t
          WHERE t.transaction_source_id = transaction.id OR t.transaction_target_id = transaction.id
        )
      LIMIT 1;
    $$
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_suggested_transfer(app_private.transaction)')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_transfer_candidates(app_private.transaction, int)')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transfer_text_mentions(text, text, text)')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transfer_text(text, text)')
}
