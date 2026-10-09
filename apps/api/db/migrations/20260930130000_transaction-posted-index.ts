import { Knex } from 'knex'

// PostGraphile only exposes filtering and ordering on indexed columns (ignoreIndexes: false), and only the
// first column of a multi-column index counts. Dropping the HASH idx_posted removed posted from
// TransactionFilter and TransactionsOrderBy, so it gets a btree index of its own.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE INDEX idx_posted ON app_private.transaction (posted DESC)`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS app_private.idx_posted`)
}

export const configuration = { transaction: true }
