import { Knex } from 'knex'

const MEMBER_ROLE = 'makecents_member'

const writableBankAccountIds = (writable: boolean) =>
  `SELECT id FROM app_private.bank_account WHERE account_id IN (SELECT app_private.current_user_account_ids(${writable}))`

// Exported so later migrations can restore this version on rollback.
export const IMPORT_TRANSACTIONS_V1 = `
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

        INSERT INTO app_private.transaction
          (bank_account_id, import_batch_id, posted, original_posted, amount, original_amount, name, memo, type, bank_transaction_id)
        SELECT batch.bank_account_id, batch.id, x.posted, x.posted, x.amount, x.amount, x.name, x.memo, x.type, x."bankTransactionId"
        FROM jsonb_to_recordset(transactions)
          AS x(posted timestamptz, amount bigint, name text, memo text, type text, "bankTransactionId" text)
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
        RETURN batch;
      END;
    $$
    LANGUAGE plpgsql
    VOLATILE;
`

// Exported so later migrations can restore this version on rollback.
export const MOVE_IMPORT_BATCH_V1 = `
    CREATE OR REPLACE FUNCTION app_private.move_import_batch(batch_id int, target_bank_account_id int)
    RETURNS app_private.import_batch
    AS $$
      #variable_conflict use_column
      DECLARE
        batch app_private.import_batch;
        source record;
        existing_id int;
        merged int := 0;
        remaining int;
      BEGIN
        SELECT * FROM app_private.import_batch WHERE id = batch_id INTO batch;
        IF batch.id IS NULL THEN
          RAISE EXCEPTION 'Import % not found', batch_id USING ERRCODE = 'no_data_found';
        END IF;
        PERFORM app_private.require_writable_bank_account(batch.bank_account_id);
        PERFORM app_private.require_writable_bank_account(target_bank_account_id);
        IF target_bank_account_id = batch.bank_account_id THEN
          RETURN batch;
        END IF;

        FOR source IN
          SELECT t.*,
            CASE WHEN t.bank_transaction_id LIKE 'csv-%'
              THEN app_private.csv_transaction_id(
                target_bank_account_id, t.original_posted, t.original_amount, t.name,
                (row_number() OVER (PARTITION BY t.original_posted, t.original_amount, t.name ORDER BY t.id))::int)
              ELSE t.bank_transaction_id
            END AS target_transaction_id
          FROM app_private.transaction AS t
          WHERE t.import_batch_id = batch.id AND t.split_source_id IS NULL
          ORDER BY t.id
        LOOP
          SELECT id FROM app_private.transaction
          WHERE bank_account_id = target_bank_account_id AND bank_transaction_id = source.target_transaction_id
          INTO existing_id;

          IF existing_id IS NULL THEN
            UPDATE app_private.transaction
            SET bank_account_id = target_bank_account_id, bank_transaction_id = source.target_transaction_id
            WHERE id = source.id;
            CONTINUE;
          END IF;

          UPDATE app_private.transaction
          SET category_id = coalesce(category_id, source.category_id),
            custom_name = coalesce(custom_name, source.custom_name),
            custom_memo = coalesce(custom_memo, source.custom_memo)
          WHERE id = existing_id;
          IF NOT EXISTS (SELECT 1 FROM app_private.transaction WHERE split_source_id = existing_id) THEN
            UPDATE app_private.transaction SET split_source_id = existing_id WHERE split_source_id = source.id;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM app_private.transfer WHERE transaction_source_id = existing_id OR transaction_target_id = existing_id) THEN
            UPDATE app_private.transfer SET transaction_source_id = existing_id WHERE transaction_source_id = source.id;
            UPDATE app_private.transfer SET transaction_target_id = existing_id WHERE transaction_target_id = source.id;
          END IF;
          DELETE FROM app_private.transaction WHERE id = source.id;
          merged := merged + 1;
        END LOOP;

        SELECT count(*) FROM app_private.transaction WHERE import_batch_id = batch.id AND split_source_id IS NULL INTO remaining;
        batch.bank_account_id := target_bank_account_id;
        batch.created_count := remaining;
        batch.duplicate_count := batch.duplicate_count + merged;
        IF remaining = 0 THEN
          -- Everything was already in the target account; nothing is left to undo.
          DELETE FROM app_private.import_batch WHERE id = batch.id;
        ELSE
          UPDATE app_private.import_batch
          SET bank_account_id = batch.bank_account_id, created_count = batch.created_count, duplicate_count = batch.duplicate_count
          WHERE id = batch.id;
        END IF;
        RETURN batch;
      END;
    $$
    LANGUAGE plpgsql
    VOLATILE;
`

// Every import (a dropped CSV/OFX file, per bank account) is recorded as a batch, and each
// transaction it created points back to it, so a whole import can be undone or moved to the
// account it should have gone to. Imports themselves run in one statement with duplicates
// skipped by the (bank_account_id, bank_transaction_id) unique constraint.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').createTable('import_batch', (table) => {
    table.increments('id').primary()
    table.timestamps(false, true)
    table
      .integer('bank_account_id')
      .notNullable()
      .references('id')
      .inTable('app_private.bank_account')
      .index()
      .onDelete('CASCADE')
    table.string('file_name').nullable()
    table.integer('created_count').notNullable().defaultTo(0)
    table.integer('duplicate_count').notNullable().defaultTo(0)
    table
      .integer('user_id')
      .nullable()
      .references('id')
      .inTable('app_private.user')
      .onDelete('SET NULL')
      .defaultTo(knex.raw('app_private.current_user_id()'))
  })
  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON app_private.import_batch
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.update_timestamp();
  `)
  // Batches are only created, undone and moved through the functions below.
  await knex.raw(`COMMENT ON TABLE app_private.import_batch IS E'@omit create,update,delete'`)

  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table
      .integer('import_batch_id')
      .nullable()
      .references('id')
      .inTable('app_private.import_batch')
      .index()
      .onDelete('SET NULL')
  })

  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON app_private.import_batch TO ${MEMBER_ROLE}`)
  await knex.raw(`GRANT USAGE, SELECT ON SEQUENCE app_private.import_batch_id_seq TO ${MEMBER_ROLE}`)
  await knex.raw(`ALTER TABLE app_private.import_batch ENABLE ROW LEVEL SECURITY`)
  await knex.raw(`
    CREATE POLICY import_batch_select ON app_private.import_batch FOR SELECT
    USING (bank_account_id IN (${writableBankAccountIds(false)}))
  `)
  await knex.raw(`
    CREATE POLICY import_batch_write ON app_private.import_batch FOR ALL
    USING (bank_account_id IN (${writableBankAccountIds(true)}))
    WITH CHECK (bank_account_id IN (${writableBankAccountIds(true)}))
  `)

  // The SQL twin of hashTransactionId in apps/web/src/lib/parsers/Csv.ts: the id a CSV row gets
  // when imported into a bank account. Moving a batch recomputes it for the target account to
  // spot rows that account already has. Keep the two in sync.
  await knex.raw(`
    CREATE FUNCTION app_private.csv_transaction_id(bank_account_id int, posted timestamptz, amount bigint, name text, occurrence int)
    RETURNS text
    AS $$
      SELECT 'csv-' || encode(sha256(convert_to(
        bank_account_id::text
          || '|' || to_char(posted AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          || '|' || amount
          || '|' || coalesce(name, '')
          || CASE WHEN occurrence > 1 THEN '|' || occurrence ELSE '' END,
        'UTF8')), 'hex');
    $$
    LANGUAGE sql
    IMMUTABLE;
  `)
  await knex.raw(`COMMENT ON FUNCTION app_private.csv_transaction_id(int, timestamptz, bigint, text, int) IS '@omit'`)

  await knex.raw(`
    CREATE FUNCTION app_private.require_writable_bank_account(bank_account_id int)
    RETURNS void
    AS $$
      #variable_conflict use_column
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM app_private.bank_account WHERE id = require_writable_bank_account.bank_account_id
          AND account_id IN (SELECT app_private.current_user_account_ids(true))) THEN
          RAISE EXCEPTION 'Bank account % cannot be changed', require_writable_bank_account.bank_account_id
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END;
    $$
    LANGUAGE plpgsql
    STABLE;
  `)
  await knex.raw(`COMMENT ON FUNCTION app_private.require_writable_bank_account(int) IS '@omit'`)

  await knex.raw(IMPORT_TRANSACTIONS_V1)

  await knex.raw(`
    CREATE FUNCTION app_private.undo_import_batch(batch_id int)
    RETURNS app_private.import_batch
    AS $$
      DECLARE
        batch app_private.import_batch;
      BEGIN
        SELECT * FROM app_private.import_batch WHERE id = batch_id INTO batch;
        IF batch.id IS NULL THEN
          RAISE EXCEPTION 'Import % not found', batch_id USING ERRCODE = 'no_data_found';
        END IF;
        PERFORM app_private.require_writable_bank_account(batch.bank_account_id);

        -- Splits and transfers go with their transactions (ON DELETE CASCADE).
        DELETE FROM app_private.transaction WHERE import_batch_id = batch.id AND split_source_id IS NULL;
        DELETE FROM app_private.import_batch WHERE id = batch.id;
        RETURN batch;
      END;
    $$
    LANGUAGE plpgsql
    VOLATILE;
  `)

  // Moves a batch's transactions to another bank account. Rows the target already has (same id
  // as if they'd been imported there) are merged into the existing copy — which keeps its own
  // category, names, splits and transfers, taking the moved copy's only where it has none —
  // and the rest are moved over.
  await knex.raw(MOVE_IMPORT_BATCH_V1)

  // Group earlier CSV imports into batches: rows created for the same bank account within a
  // minute of each other came from the same file.
  await knex.raw(`
    DO $$
      DECLARE
        grp record;
        new_batch_id int;
      BEGIN
        FOR grp IN
          WITH ordered AS (
            SELECT id, bank_account_id, created_at,
              CASE WHEN created_at - lag(created_at) OVER w <= interval '60 seconds' THEN 0 ELSE 1 END AS starts_batch
            FROM app_private.transaction
            WHERE type = 'CSV' AND split_source_id IS NULL AND import_batch_id IS NULL
            WINDOW w AS (PARTITION BY bank_account_id ORDER BY created_at, id)
          ), numbered AS (
            SELECT *, sum(starts_batch) OVER (PARTITION BY bank_account_id ORDER BY created_at, id) AS batch_number
            FROM ordered
          )
          SELECT bank_account_id, min(created_at) AS created_at, count(*)::int AS created_count, array_agg(id) AS ids
          FROM numbered
          GROUP BY bank_account_id, batch_number
        LOOP
          INSERT INTO app_private.import_batch (bank_account_id, created_at, updated_at, created_count, user_id)
          VALUES (grp.bank_account_id, grp.created_at, grp.created_at, grp.created_count, NULL)
          RETURNING id INTO new_batch_id;
          UPDATE app_private.transaction SET import_batch_id = new_batch_id WHERE id = ANY(grp.ids);
        END LOOP;
      END
    $$;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP FUNCTION IF EXISTS app_private.move_import_batch(int, int)')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.undo_import_batch(int)')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.import_transactions(int, text, jsonb)')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.require_writable_bank_account(int)')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.csv_transaction_id(int, timestamptz, bigint, text, int)')
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropColumn('import_batch_id')
  })
  await knex.schema.withSchema('app_private').dropTableIfExists('import_batch')
}
