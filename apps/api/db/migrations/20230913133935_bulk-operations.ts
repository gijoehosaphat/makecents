import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('budget_category', (table) => {
    table.comment('@mncud\n This enables bulk create, delete and update mutations.')
  })
  await knex.schema.withSchema('app_private').alterTable('transaction_category', (table) => {
    table.comment('@mncud\n This enables bulk create, delete and update mutations.')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('budget_category', (table) => {
    table.comment('')
  })
  await knex.schema.withSchema('app_private').alterTable('transaction_category', (table) => {
    table.comment('')
  })
}
