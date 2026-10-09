import { Knex } from 'knex'

// Transaction lists, counts and totals all filter on bank_account_id plus a posted date range. The old
// idx_posted is a HASH index, which only supports equality, so date ranges couldn't use it. A btree on
// (bank_account_id, posted) serves the filter and the POSTED_DESC ordering.
//
// Full text search had two problems. Under row-level security Postgres won't evaluate a non-leakproof
// operator such as tsvector @@ tsquery ahead of the policy, so the search index couldn't be used and every
// visible row was matched by hand. transaction_search now runs as SECURITY DEFINER with the same account
// check the select policy applies, which lets the planner use the index. GIN also suits @@ lookups better
// than GIST.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS app_private.idx_posted`)
  await knex.raw(`
    CREATE INDEX transaction_bank_account_id_posted_idx
    ON app_private.transaction (bank_account_id, posted DESC)
  `)

  await knex.raw(`DROP INDEX IF EXISTS app_private.weighted_tsv_idx`)
  await knex.raw(`CREATE INDEX weighted_tsv_idx ON app_private.transaction USING GIN (weighted_tsv)`)

  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.transaction_search(match text)
    RETURNS SETOF app_private.transaction
    AS $$
      SELECT *
      FROM app_private.transaction
      WHERE weighted_tsv @@ to_tsquery(match)
        AND bank_account_id IN (
          SELECT id FROM app_private.bank_account
          WHERE account_id IN (SELECT app_private.current_user_account_ids())
        )
      ORDER BY posted DESC;
    $$
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)

  await knex.raw(`ANALYZE app_private.transaction`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.transaction_search(match text)
    RETURNS SETOF app_private.transaction
    AS $function$
      begin
        RETURN QUERY SELECT * FROM app_private.transaction WHERE weighted_tsv @@ to_tsquery($1) ORDER BY posted DESC;
      end
    $function$
    LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER;
  `)

  await knex.raw(`DROP INDEX IF EXISTS app_private.weighted_tsv_idx`)
  await knex.raw(`CREATE INDEX weighted_tsv_idx ON app_private.transaction USING GIST (weighted_tsv)`)

  await knex.raw(`DROP INDEX IF EXISTS app_private.transaction_bank_account_id_posted_idx`)
  await knex.raw(`CREATE INDEX idx_posted ON app_private.transaction USING HASH (posted)`)
}

export const configuration = { transaction: true }
