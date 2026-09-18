import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').createTable('bank_account_reconciliation', function (table) {
    table.increments('id').primary().unique()
    table.timestamps(false, true)
    table
      .integer('bank_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.bank_account')
      .onDelete('CASCADE')
    table.bigInteger('balance').notNullable()
    table.timestamp('as_of').notNullable()
    table.unique(['bank_account_id', 'as_of'])
  })

  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON app_private.bank_account_reconciliation
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.update_timestamp();
  `)

  // Preserve every account's current balance as its initial reconciliation point, anchored
  // to "now" so nothing changes for existing accounts until a new transaction posts.
  await knex.raw(`
    INSERT INTO app_private.bank_account_reconciliation (bank_account_id, balance, as_of, created_at, updated_at)
    SELECT id, COALESCE(balance, 0), NOW(), NOW(), NOW()
    FROM app_private.bank_account
  `)

  await knex.schema.withSchema('app_private').alterTable('bank_account', (table) => {
    table.dropColumn('balance')
  })

  // Supports the bank_account_balance computed column below, which sums transactions per
  // account after a given date.
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.index(['bank_account_id', 'posted'])
  })

  await knex.raw(`
    CREATE FUNCTION app_private.bank_account_balance(bank_account app_private.bank_account)
    RETURNS BIGINT AS
    $function$
      WITH latest_reconciliation AS (
        SELECT balance, as_of
        FROM app_private.bank_account_reconciliation
        WHERE bank_account_id = bank_account.id
        ORDER BY as_of DESC, id DESC
        LIMIT 1
      )
      SELECT
        COALESCE((SELECT balance FROM latest_reconciliation), 0) +
        COALESCE((
          SELECT SUM(amount)
          FROM app_private.transaction
          WHERE bank_account_id = bank_account.id
            AND posted > COALESCE((SELECT as_of FROM latest_reconciliation), '-infinity'::timestamp)
        ), 0)
    $function$
    LANGUAGE sql STABLE;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP FUNCTION IF EXISTS app_private.bank_account_balance(bank_account app_private.bank_account)')

  await knex.schema.withSchema('app_private').alterTable('bank_account', (table) => {
    table.bigInteger('balance')
  })

  await knex.raw(`
    UPDATE app_private.bank_account SET balance = (
      COALESCE((
        SELECT balance FROM app_private.bank_account_reconciliation r
        WHERE r.bank_account_id = bank_account.id
        ORDER BY r.as_of DESC, r.id DESC
        LIMIT 1
      ), 0) +
      COALESCE((
        SELECT SUM(t.amount) FROM app_private.transaction t
        WHERE t.bank_account_id = bank_account.id
          AND t.posted > COALESCE((
            SELECT r.as_of FROM app_private.bank_account_reconciliation r
            WHERE r.bank_account_id = bank_account.id
            ORDER BY r.as_of DESC, r.id DESC
            LIMIT 1
          ), '-infinity'::timestamp)
      ), 0)
    )
  `)

  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropIndex(['bank_account_id', 'posted'])
  })

  await knex.schema.withSchema('app_private').dropTableIfExists('bank_account_reconciliation')
}
