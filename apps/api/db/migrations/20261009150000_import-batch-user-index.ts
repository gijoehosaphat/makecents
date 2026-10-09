import { Knex } from 'knex'

// PostGraphile only exposes relations over indexed foreign keys (ignoreIndexes: false).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('import_batch', (table) => {
    table.index(['user_id'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('import_batch', (table) => {
    table.dropIndex(['user_id'])
  })
}
