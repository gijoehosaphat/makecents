import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('budget', (table) => {
    table.timestamp('effective_date')
    table.bigInteger('starting_amount')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('budget', (table) => {
    table.dropColumn('effective_date')
    table.dropColumn('starting_amount')
  })
}
