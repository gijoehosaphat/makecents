import { Knex } from 'knex'
import { IMPORT_TRANSACTIONS_V1, MOVE_IMPORT_BATCH_V1 } from './20261009120000_import-batch'

function replaceOnce(sql: string, search: string, replacement: string): string {
  if (sql.split(search).length !== 2) {
    throw new Error(`Expected exactly one occurrence of: ${search}`)
  }
  return sql.replace(search, replacement)
}

// The database now assigns CSV rows their bank_transaction_id (app_private.csv_transaction_id),
// numbering identical rows across the whole file, so it is the single source of those ids. The
// browser's copy (hashTransactionId in apps/web/src/lib/parsers/Csv.ts) only previews duplicates.
const IMPORT_TRANSACTIONS_V2 = replaceOnce(
  IMPORT_TRANSACTIONS_V1,
  `SELECT batch.bank_account_id, batch.id, x.posted, x.posted, x.amount, x.amount, x.name, x.memo, x.type, x."bankTransactionId"
        FROM jsonb_to_recordset(transactions)
          AS x(posted timestamptz, amount bigint, name text, memo text, type text, "bankTransactionId" text)`,
  `SELECT batch.bank_account_id, batch.id, x.posted, x.posted, x.amount, x.amount, x.name, x.memo, x.type,
          CASE WHEN x.type = 'CSV'
            THEN app_private.csv_transaction_id(batch.bank_account_id, x.posted, x.amount, x.name,
              (row_number() OVER (PARTITION BY x.posted, x.amount, x.name ORDER BY x.ordinal))::int)
            ELSE x.bank_transaction_id
          END
        FROM (
          SELECT (e.value->>'posted')::timestamptz AS posted, (e.value->>'amount')::bigint AS amount,
            e.value->>'name' AS name, e.value->>'memo' AS memo, e.value->>'type' AS type,
            e.value->>'bankTransactionId' AS bank_transaction_id, e.ordinal
          FROM jsonb_array_elements(transactions) WITH ORDINALITY AS e(value, ordinal)
        ) AS x`
)

// A row's occurrence comes from the id it was stored with, not its position within the batch: the
// batch may hold only the second of two identical rows when the first was already imported.
const MOVE_IMPORT_BATCH_V2 = replaceOnce(
  MOVE_IMPORT_BATCH_V1,
  `(row_number() OVER (PARTITION BY t.original_posted, t.original_amount, t.name ORDER BY t.id))::int)`,
  `app_private.csv_transaction_occurrence(
                  t.bank_account_id, t.original_posted, t.original_amount, t.name, t.bank_transaction_id))`
)

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE FUNCTION app_private.csv_transaction_occurrence(
      bank_account_id int, posted timestamptz, amount bigint, name text, transaction_id text
    )
    RETURNS int
    AS $$
      SELECT coalesce(
        (SELECT n FROM generate_series(1, 1000) AS n
         WHERE app_private.csv_transaction_id(bank_account_id, posted, amount, name, n) = transaction_id
         LIMIT 1),
        1);
    $$
    LANGUAGE sql
    IMMUTABLE;
  `)
  await knex.raw(
    `COMMENT ON FUNCTION app_private.csv_transaction_occurrence(int, timestamptz, bigint, text, text) IS '@omit'`
  )
  await knex.raw(IMPORT_TRANSACTIONS_V2)
  await knex.raw(MOVE_IMPORT_BATCH_V2)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(MOVE_IMPORT_BATCH_V1)
  await knex.raw(IMPORT_TRANSACTIONS_V1)
  await knex.raw('DROP FUNCTION IF EXISTS app_private.csv_transaction_occurrence(int, timestamptz, bigint, text, text)')
}
