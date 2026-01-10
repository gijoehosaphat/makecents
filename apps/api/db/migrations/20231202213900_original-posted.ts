import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.timestamp('original_posted')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropColumn('original_posted')
  })
}
