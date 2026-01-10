import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').createTable('transfer', function (table) {
    table.increments('id').primary().unique()
    table.timestamps(false, true)
    table
      .integer('transaction_source_id')
      .unsigned()
      .unique()
      .notNullable()
      .references('id')
      .inTable('app_private.transaction')
      .index()
      .onDelete('CASCADE')
    table
      .integer('transaction_target_id')
      .unsigned()
      .unique()
      .notNullable()
      .references('id')
      .inTable('app_private.transaction')
      .index()
      .onDelete('CASCADE')
    table.unique(['transaction_source_id', 'transaction_target_id'])
  })
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.index('amount', 'idx_amount', 'HASH')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').dropTableIfExists('transfer')
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropIndex('amount', 'idx_amount')
  })
}
