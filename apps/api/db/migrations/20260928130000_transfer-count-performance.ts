import { Knex } from 'knex'

// transaction_transfer_count runs once per row when filtering by (un)categorized. Under row-level
// security every call re-evaluated the transfer policy (transactions -> bank accounts -> memberships),
// which made those filters take tens of seconds. The caller can only pass a transaction it can already
// read, so the lookup itself can skip RLS; SECURITY DEFINER does that and keeps it an indexed lookup.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.transaction_transfer_count(transaction app_private.transaction)
    RETURNS NUMERIC
    AS $$
      SELECT count(*)
      FROM app_private.transfer
      WHERE transfer.transaction_source_id = transaction.id
        OR transfer.transaction_target_id = transaction.id;
    $$
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.transaction_transfer_count(transaction app_private.transaction)
    RETURNS NUMERIC AS
    $function$
      DECLARE count NUMERIC;
      BEGIN
        SELECT
          COUNT(id)
        FROM
          app_private.transfer
        WHERE
          transfer.transaction_source_id = transaction.id
        OR
          transfer.transaction_target_id = transaction.id
        INTO
          count;
        RETURN count;
      END
    $function$
    LANGUAGE plpgsql IMMUTABLE;
  `)
}
