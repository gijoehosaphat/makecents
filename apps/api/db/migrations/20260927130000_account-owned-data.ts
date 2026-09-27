import { Knex } from 'knex'

// Tables whose rows move from being owned by a user to being owned by an account.
// Transactions, splits, transfers and reconciliations are reached through bank_account.
const TABLES = ['bank_account', 'category', 'budget', 'budget_category', 'bank_csv_definition']

export async function up(knex: Knex): Promise<void> {
  // Users without an account (e.g. seeded users) get one so their data has somewhere to go.
  await knex.raw(`
    WITH new_account AS (
      INSERT INTO app_private.account (user_id)
      SELECT u.id
      FROM app_private.user AS u
      WHERE NOT EXISTS (SELECT 1 FROM app_private.account AS a WHERE a.user_id = u.id)
      RETURNING id, user_id
    )
    INSERT INTO app_private.account_member (account_id, user_id, role)
    SELECT id, user_id, 'owner'
    FROM new_account
  `)

  for (const tableName of TABLES) {
    await knex.schema.withSchema('app_private').alterTable(tableName, (table) => {
      table
        .integer('account_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('app_private.account')
        .index()
        .onDelete('CASCADE')
    })

    // A user with several account rows (legacy OAuth providers) maps to their lowest one,
    // which is also the account the web app redirects to.
    await knex.raw(`
      UPDATE app_private.${tableName} AS t
      SET account_id = (SELECT min(a.id) FROM app_private.account AS a WHERE a.user_id = t.user_id)
    `)

    // user_id is kept as the creator of the row. It no longer determines ownership, so removing
    // a user must not delete data that belongs to a shared account.
    await knex.schema.withSchema('app_private').alterTable(tableName, (table) => {
      table.dropNullable('account_id')
      table.dropForeign('user_id')
      table.setNullable('user_id')
      table.foreign('user_id').references('id').inTable('app_private.user').onDelete('SET NULL')
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const tableName of TABLES) {
    // Rows created after the migration have no user_id; attribute them to the account's creator.
    await knex.raw(`
      UPDATE app_private.${tableName} AS t
      SET user_id = a.user_id
      FROM app_private.account AS a
      WHERE a.id = t.account_id
        AND t.user_id IS NULL
    `)

    await knex.schema.withSchema('app_private').alterTable(tableName, (table) => {
      table.dropForeign('user_id')
      table.dropNullable('user_id')
      table.foreign('user_id').references('id').inTable('app_private.user').onDelete('CASCADE')
      table.dropForeign('account_id')
      table.dropColumn('account_id')
    })
  }
  // Accounts created for users without one are left in place; they are harmless.
}

export const configuration = { transaction: true }
