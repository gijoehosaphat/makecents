import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('budget', (table) => {
    table.bigInteger('amount').unsigned().notNullable().alter()
  })

  await knex.schema.withSchema('app_private').createTable('budget_reconsiliation', function (table) {
    table.increments('id').primary().unique()
    table.timestamps(false, true)
    table
      .integer('budget_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.budget')
      .index()
      .onDelete('CASCADE')
    table.bigInteger('amount').notNullable()
    table.integer('year').unsigned().notNullable().index()
    table.integer('month').unsigned().notNullable().index()
    table.unique(['budget_id', 'year', 'month'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').dropTableIfExists('budget_reconsiliation')
  await knex.schema.withSchema('app_private').alterTable('budget', (table) => {
    table.integer('amount').unsigned().notNullable().alter()
  })
}
