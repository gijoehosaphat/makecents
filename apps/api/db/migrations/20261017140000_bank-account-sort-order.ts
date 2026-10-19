import { Knex } from 'knex'

// Bank accounts are listed by sort_order, then id. It stays null until accounts are reordered, so
// existing and newly created accounts keep their creation order and new ones land at the end.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('bank_account', (table) => {
    table.integer('sort_order').nullable()
    // Postgraphile only exposes orderBy for indexed columns.
    table.index(['sort_order'])
  })

  // Sets the order of an account's bank accounts in one call. Runs as the caller, so row level
  // security limits it to bank accounts they can change.
  await knex.raw(`
    CREATE FUNCTION app_private.reorder_bank_accounts(account_id int, bank_account_ids int[])
    RETURNS SETOF app_private.bank_account
    AS $$
      UPDATE app_private.bank_account AS b
      SET sort_order = ids.position
      FROM unnest(reorder_bank_accounts.bank_account_ids) WITH ORDINALITY AS ids(id, position)
      WHERE b.id = ids.id
        AND b.account_id = reorder_bank_accounts.account_id
      RETURNING b.*;
    $$
    LANGUAGE sql
    VOLATILE
    STRICT;
  `)

  await knex.raw(`REVOKE EXECUTE ON FUNCTION app_private.reorder_bank_accounts(int, int[]) FROM PUBLIC`)
  await knex.raw(`GRANT EXECUTE ON FUNCTION app_private.reorder_bank_accounts(int, int[]) TO makecents_member`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS app_private.reorder_bank_accounts(int, int[])`)
  await knex.schema.withSchema('app_private').alterTable('bank_account', (table) => {
    table.dropIndex(['sort_order'])
    table.dropColumn('sort_order')
  })
}

export const configuration = { transaction: true }
