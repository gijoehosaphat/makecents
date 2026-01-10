import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.comment('@mncud\n This enables bulk create, delete and update mutations.')
    table.index('posted', 'idx_posted', 'HASH')
    table.index('type', 'idx_type', 'HASH')
  })
  await knex.schema.withSchema('app_private').alterTable('account', (table) => {
    table.comment('@mncud\n This enables bulk create, delete and update mutations.')
  })
  // await knex.schema.withSchema('app_private').alterTable('account', (table) => {
  //   table.index('provider', 'idx_provider', 'HASH')
  //   table.index('provider_account_id', 'idx_provider_account_id', 'HASH')
  // })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.comment('')
    table.dropIndex('posted', 'idx_posted')
    table.dropIndex('type', 'idx_type')
  })
  await knex.schema.withSchema('app_private').alterTable('account', (table) => {
    table.comment('')
  })
  // await knex.schema.withSchema('app_private').alterTable('account', (table) => {
  //   table.dropIndex('provider', 'idx_provider')
  //   table.dropIndex('provider_account_id', 'idx_provider_account_id')
  // })
}
