import { Knex } from 'knex'

// PostGraphile only offers filters on indexed columns. This lets the transactions list show just
// the rows an import categorized automatically, so they can be reviewed.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.index('category_source')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropIndex('category_source')
  })
}
