import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema('app_private')
    .alterTable('transaction', (table) => {
      table.string('custom_name').nullable()
      table.string('custom_memo').nullable()
    })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema
    .withSchema('app_private')
    .alterTable('transaction', (table) => {
      table.dropColumn('custom_name')
      table.dropColumn('custom_memo')
    })
}
