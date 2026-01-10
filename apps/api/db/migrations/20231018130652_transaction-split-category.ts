import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.integer('category_id').unsigned().nullable().references('id').inTable('app_private.category').index()
    table.integer('split_source_id').unsigned().nullable().references('id').inTable('app_private.transaction').index()
    table.bigInteger('original_amount')
  })
  await knex.raw(`
    UPDATE
      app_private.transaction
    SET
      original_amount = amount;
  `)
  await knex.raw(`
    UPDATE
      app_private.transaction t
    SET
      category_id = tc.category_id
    FROM
      app_private.transaction_category tc
    WHERE 
      t.id = tc.bank_transaction_id;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropColumn('original_amount')
    table.dropColumn('split_source_id')
    table.dropColumn('category_id')
  })
}
