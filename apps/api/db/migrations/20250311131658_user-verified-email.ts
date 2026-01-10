import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('user', (table) => {
    table.date('emailVerified').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('user', (table) => {
    table.dropColumn('emailVerified')
  })
}
