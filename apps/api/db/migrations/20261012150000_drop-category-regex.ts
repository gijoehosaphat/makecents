import { Knex } from 'knex'

// Categories no longer carry a hand-written match pattern: suggestions are learned from how transactions
// were already categorized (see category-suggestions). The old values were free-text search terms that
// nothing applied automatically, so `down` restores an empty column, not the values.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('category', (table) => {
    table.dropColumn('regex')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('category', (table) => {
    table.string('regex')
  })
}
