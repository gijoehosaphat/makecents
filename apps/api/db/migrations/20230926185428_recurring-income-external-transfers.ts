import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').createTable('custom_category_group', function (table) {
    table.increments('id').primary().unique()
    table
      .integer('account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.account')
      .index()
      .onDelete('CASCADE')
    table.text('name')
    table.unique(['account_id', 'name'])
  })

  await knex.schema.withSchema('app_private').createTable('category_group', function (table) {
    table.increments('id').primary().unique()
    table
      .integer('account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.account')
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
    table
      .integer('custom_category_group_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('app_private.custom_category_group')
      .index()
      .onDelete('CASCADE')
    table.unique(['account_id', 'category_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').dropTableIfExists('category_group')
  await knex.schema.withSchema('app_private').dropTableIfExists('custom_category_group')
}
