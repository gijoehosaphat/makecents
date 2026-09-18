import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('bank_csv_definition', (table) => {
    table
      .integer('bank_account_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('app_private.bank_account')
      .index()
      .onDelete('SET NULL')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('bank_csv_definition', (table) => {
    table.dropColumn('bank_account_id')
  })
}
