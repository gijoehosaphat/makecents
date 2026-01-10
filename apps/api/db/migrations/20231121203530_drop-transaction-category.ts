import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').dropTableIfExists('transaction_category')
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').createTable('transaction_category', function (table) {
    table.increments('id').primary().unique()
    table
      .integer('bank_transaction_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.transaction')
      .index()
      .onDelete('CASCADE')
    table
      .integer('category_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('app_private.category')
      .index()
      .onDelete('CASCADE')
    table.integer('amount').unsigned().notNullable()
    table.unique(['bank_transaction_id', 'category_id'])
  })
}
