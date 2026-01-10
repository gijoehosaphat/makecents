import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').createTable('budget', function (table) {
    table.increments('id').primary().unique()
    table.timestamps(false, true)
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.user')
      .index()
      .onDelete('CASCADE')
    table.string('name')
    table.integer('amount').unsigned().notNullable()
  })

  await knex.schema.withSchema('app_private').createTable('budget_category', function (table) {
    table.increments('id').primary().unique()
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.user')
      .index()
      .onDelete('CASCADE')
    table
      .integer('budget_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.budget')
      .index()
      .onDelete('CASCADE')
    table
      .integer('category_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.category')
      .index()
      .onDelete('CASCADE')
    table.unique(['budget_id', 'category_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').dropTableIfExists('budget_category')
  await knex.schema.withSchema('app_private').dropTableIfExists('budget')
}
