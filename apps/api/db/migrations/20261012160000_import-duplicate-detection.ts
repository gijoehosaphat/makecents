import { Knex } from 'knex'
import { IMPORT_TRANSACTIONS_V3 } from './20261012130000_import-auto-categorize'

// Imports skip rows the bank account already has by bank_transaction_id (the bank's FITID, or a
// hash of the row for CSV files), but that misses the same transaction arriving under a new id:
// the bank re-issues FITIDs or renames a payee in its export, which always re-covers the last
// few months. So rows whose id is new are also matched against the account's existing rows by
// posted date and amount, the way a person would spot them.
//
// Matching counts rather than collapses. Two $5.00 purchases on one day are normal, so a file
// holding two of them against one existing row only imports one; against two existing rows,
// none. Existing rows are only candidates when the file does not carry their id (otherwise
// they are already accounted for), and rows with the same name are paired off before rows
// with a different one.
// Exported so later migrations can extend it and restore it on rollback.
export const IMPORT_TRANSACTIONS_V4 = `
    CREATE OR REPLACE FUNCTION app_private.import_transactions(bank_account_id int, file_name text, transactions jsonb)
    RETURNS app_private.import_batch
    AS $$
      #variable_conflict use_column
      DECLARE
        batch app_private.import_batch;
        inserted int;
      BEGIN
        PERFORM app_private.require_writable_bank_account(import_transactions.bank_account_id);

        INSERT INTO app_private.import_batch (bank_account_id, file_name)
        VALUES (import_transactions.bank_account_id, import_transactions.file_name)
        RETURNING * INTO batch;

        WITH incoming AS (
          SELECT x.posted, x.amount, x.name, x.memo, x.type, x.ordinal,
            CASE WHEN x.type = 'CSV'
              THEN app_private.csv_transaction_id(batch.bank_account_id, x.posted, x.amount, x.name,
                (row_number() OVER (PARTITION BY x.posted, x.amount, x.name ORDER BY x.ordinal))::int)
              ELSE x.bank_transaction_id
            END AS bank_transaction_id
          FROM (
            SELECT (e.value->>'posted')::timestamptz AS posted, (e.value->>'amount')::bigint AS amount,
              e.value->>'name' AS name, e.value->>'memo' AS memo, e.value->>'type' AS type,
              e.value->>'bankTransactionId' AS bank_transaction_id, e.ordinal
            FROM jsonb_array_elements(transactions) WITH ORDINALITY AS e(value, ordinal)
          ) AS x
        ),
        fresh AS (
          SELECT i.* FROM incoming AS i
          WHERE NOT EXISTS (
            SELECT 1 FROM app_private.transaction AS t
            WHERE t.bank_account_id = batch.bank_account_id AND t.bank_transaction_id = i.bank_transaction_id)
        ),
        unmatched AS (
          SELECT coalesce(t.original_posted, t.posted) AS posted, coalesce(t.original_amount, t.amount) AS amount,
            coalesce(t.name, '') AS name
          FROM app_private.transaction AS t
          WHERE t.bank_account_id = batch.bank_account_id
            AND t.split_source_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM incoming AS i WHERE i.bank_transaction_id = t.bank_transaction_id)
            AND EXISTS (
              SELECT 1 FROM fresh AS f
              WHERE f.posted = coalesce(t.original_posted, t.posted) AND f.amount = coalesce(t.original_amount, t.amount))
        ),
        same_name AS (
          SELECT f.*,
            row_number() OVER (PARTITION BY f.posted, f.amount, coalesce(f.name, '') ORDER BY f.ordinal)
              <= (SELECT count(*) FROM unmatched AS u
                  WHERE u.posted = f.posted AND u.amount = f.amount AND u.name = coalesce(f.name, '')) AS is_duplicate
          FROM fresh AS f
        ),
        ranked AS (
          SELECT s.*,
            (SELECT count(*) FROM unmatched AS u WHERE u.posted = s.posted AND u.amount = s.amount)
              - count(*) FILTER (WHERE s.is_duplicate) OVER (PARTITION BY s.posted, s.amount) AS spare,
            row_number() OVER (PARTITION BY s.posted, s.amount ORDER BY s.is_duplicate DESC, s.ordinal)
              - count(*) FILTER (WHERE s.is_duplicate) OVER (PARTITION BY s.posted, s.amount) AS rank
          FROM same_name AS s
        )
        INSERT INTO app_private.transaction
          (bank_account_id, import_batch_id, posted, original_posted, amount, original_amount, name, memo, type, bank_transaction_id)
        SELECT batch.bank_account_id, batch.id, l.posted, l.posted, l.amount, l.amount, l.name, l.memo, l.type, l.bank_transaction_id
        FROM ranked AS l
        WHERE NOT l.is_duplicate AND l.rank > l.spare
        ON CONFLICT (bank_account_id, bank_transaction_id) DO NOTHING;
        GET DIAGNOSTICS inserted = ROW_COUNT;

        batch.created_count := inserted;
        batch.duplicate_count := jsonb_array_length(transactions) - inserted;
        IF inserted = 0 THEN
          -- Nothing new: there is nothing to undo, so don't list an empty import.
          DELETE FROM app_private.import_batch WHERE id = batch.id;
        ELSE
          UPDATE app_private.import_batch
          SET created_count = batch.created_count, duplicate_count = batch.duplicate_count
          WHERE id = batch.id;
        END IF;
        IF inserted > 0 THEN
          batch.auto_categorized_count := app_private.auto_categorize_import_batch(batch.id);
        END IF;
        RETURN batch;
      END;
    $$
    LANGUAGE plpgsql
    VOLATILE;
`

export async function up(knex: Knex): Promise<void> {
  await knex.raw(IMPORT_TRANSACTIONS_V4)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(IMPORT_TRANSACTIONS_V3)
}
