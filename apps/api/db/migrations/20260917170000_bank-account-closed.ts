import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('bank_account', (table) => {
    table.boolean('closed').notNullable().defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('bank_account', (table) => {
    table.dropColumn('closed')
  })
}
