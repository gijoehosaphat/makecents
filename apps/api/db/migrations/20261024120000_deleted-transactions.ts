import { Knex } from 'knex'
import { IMPORT_TRANSACTIONS_V4 } from './20261012160000_import-duplicate-detection'

const MEMBER_ROLE = 'makecents_member'

const bankAccountIds = (writable: boolean) =>
  `SELECT id FROM app_private.bank_account WHERE account_id IN (SELECT app_private.current_user_account_ids(${writable}))`

function replaceOnce(sql: string, search: string, replacement: string): string {
  if (sql.split(search).length !== 2) {
    throw new Error(`Expected exactly one occurrence of: ${search}`)
  }
  return sql.replace(search, replacement)
}

// Rows whose id was deleted from the bank account are skipped, so re-importing a file (or a later
// export that still carries the row) doesn't bring it back. They count as duplicates.
const IMPORT_TRANSACTIONS_V5 = replaceOnce(
  IMPORT_TRANSACTIONS_V4,
  `WHERE t.bank_account_id = batch.bank_account_id AND t.bank_transaction_id = i.bank_transaction_id)
        ),`,
  `WHERE t.bank_account_id = batch.bank_account_id AND t.bank_transaction_id = i.bank_transaction_id)
          AND NOT EXISTS (
            SELECT 1 FROM app_private.deleted_transaction AS d
            WHERE d.bank_account_id = batch.bank_account_id AND d.bank_transaction_id = i.bank_transaction_id)
        ),`,
)

// Deleting a transaction really deletes it, so no query that sums or lists transactions needs to
// know about deletions. What was deleted, why, and by whom is kept here instead, with a copy of the
// row (and its splits) to restore it from. The row's bank_transaction_id also stops imports from
// adding it again: banks re-export a pending charge under its posted date and name, which slips
// past duplicate detection, and deleting the stale copy has to stick.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').createTable('deleted_transaction', (table) => {
    table.increments('id').primary()
    table.timestamps(false, true)
    table
      .integer('bank_account_id')
      .notNullable()
      .references('id')
      .inTable('app_private.bank_account')
      .index()
      .onDelete('CASCADE')
    // The deleted row's id, which a restore reuses.
    table.integer('transaction_id').notNullable()
    table.string('bank_transaction_id').nullable()
    // As the row was shown when it was deleted, for listing deletions without unpacking the copy.
    table.timestamp('posted', { useTz: true }).nullable()
    table.bigInteger('amount').nullable()
    table.string('name').nullable()
    table.string('memo').nullable()
    table.text('reason').notNullable()
    table.text('note').nullable()
    table
      .integer('duplicate_of_id')
      .nullable()
      .references('id')
      .inTable('app_private.transaction')
      .index()
      .onDelete('SET NULL')
    // to_jsonb of the transaction, plus its splits under "splits".
    table.jsonb('snapshot').notNullable()
    table
      .integer('user_id')
      .nullable()
      .references('id')
      .inTable('app_private.user')
      .index()
      .onDelete('SET NULL')
      .defaultTo(knex.raw('app_private.current_user_id()'))
    table.unique(['bank_account_id', 'bank_transaction_id'])
  })
  await knex.raw(`
    ALTER TABLE app_private.deleted_transaction
    ADD CONSTRAINT deleted_transaction_reason_check CHECK (reason IN ('duplicate', 'cancelled', 'other'))
  `)
  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON app_private.deleted_transaction
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.update_timestamp();
  `)
  // Deletions are only made and undone through the functions below.
  await knex.raw(`COMMENT ON TABLE app_private.deleted_transaction IS E'@omit create,update,delete'`)
  await knex.raw(`COMMENT ON COLUMN app_private.deleted_transaction.snapshot IS E'@omit filter,order'`)

  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON app_private.deleted_transaction TO ${MEMBER_ROLE}`)
  await knex.raw(`GRANT USAGE, SELECT ON SEQUENCE app_private.deleted_transaction_id_seq TO ${MEMBER_ROLE}`)
  await knex.raw(`ALTER TABLE app_private.deleted_transaction ENABLE ROW LEVEL SECURITY`)
  await knex.raw(`
    CREATE POLICY deleted_transaction_select ON app_private.deleted_transaction FOR SELECT
    USING (bank_account_id IN (${bankAccountIds(false)}))
  `)
  await knex.raw(`
    CREATE POLICY deleted_transaction_write ON app_private.deleted_transaction FOR ALL
    USING (bank_account_id IN (${bankAccountIds(true)}))
    WITH CHECK (bank_account_id IN (${bankAccountIds(true)}))
  `)

  // Deletes a transaction (with its splits and transfer links) and records why. Given the
  // transaction it duplicates, that one first takes over what the user set on this one and it
  // lacks: category, custom name and memo, splits (when the amounts match) and transfer links.
  await knex.raw(`
    CREATE FUNCTION app_private.remove_transaction(transaction_id int, reason text, note text DEFAULT NULL, duplicate_of_id int DEFAULT NULL)
    RETURNS app_private.deleted_transaction
    AS $$
      #variable_conflict use_column
      DECLARE
        removed app_private.transaction;
        keeper app_private.transaction;
        deleted app_private.deleted_transaction;
      BEGIN
        SELECT * FROM app_private.transaction WHERE id = remove_transaction.transaction_id INTO removed;
        IF removed.id IS NULL THEN
          RAISE EXCEPTION 'Transaction % not found', remove_transaction.transaction_id USING ERRCODE = 'no_data_found';
        END IF;
        PERFORM app_private.require_writable_bank_account(removed.bank_account_id);
        IF removed.split_source_id IS NOT NULL THEN
          RAISE EXCEPTION 'Delete the transaction this split belongs to instead' USING ERRCODE = 'check_violation';
        END IF;

        IF remove_transaction.duplicate_of_id IS NOT NULL THEN
          SELECT * FROM app_private.transaction WHERE id = remove_transaction.duplicate_of_id INTO keeper;
          IF keeper.id IS NULL OR keeper.id = removed.id OR keeper.split_source_id IS NOT NULL
            OR keeper.bank_account_id <> removed.bank_account_id THEN
            RAISE EXCEPTION 'Transaction % cannot be the duplicate of %', remove_transaction.duplicate_of_id, removed.id
              USING ERRCODE = 'check_violation';
          END IF;

          UPDATE app_private.transaction
          SET category_id = coalesce(category_id, removed.category_id),
            category_source = CASE WHEN category_id IS NULL THEN removed.category_source ELSE category_source END,
            custom_name = coalesce(custom_name, removed.custom_name),
            custom_memo = coalesce(custom_memo, removed.custom_memo)
          WHERE id = keeper.id;
          IF coalesce(keeper.original_amount, keeper.amount) = coalesce(removed.original_amount, removed.amount)
            AND NOT EXISTS (SELECT 1 FROM app_private.transaction WHERE split_source_id = keeper.id) THEN
            UPDATE app_private.transaction SET split_source_id = keeper.id WHERE split_source_id = removed.id;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM app_private.transfer WHERE transaction_source_id = keeper.id OR transaction_target_id = keeper.id) THEN
            UPDATE app_private.transfer SET transaction_source_id = keeper.id
            WHERE transaction_source_id = removed.id AND transaction_target_id <> keeper.id;
            UPDATE app_private.transfer SET transaction_target_id = keeper.id
            WHERE transaction_target_id = removed.id AND transaction_source_id <> keeper.id;
          END IF;
        END IF;

        INSERT INTO app_private.deleted_transaction
          (bank_account_id, transaction_id, bank_transaction_id, posted, amount, name, memo, reason, note, duplicate_of_id, snapshot)
        SELECT removed.bank_account_id, removed.id, removed.bank_transaction_id, removed.posted,
          coalesce(removed.original_amount, removed.amount),
          coalesce(removed.custom_name, removed.name), coalesce(removed.custom_memo, removed.memo),
          remove_transaction.reason, nullif(btrim(remove_transaction.note), ''), keeper.id,
          (to_jsonb(t) - 'weighted_tsv') || jsonb_build_object('splits', coalesce(
            (SELECT jsonb_agg(to_jsonb(s) - 'weighted_tsv' ORDER BY s.id)
             FROM app_private.transaction AS s WHERE s.split_source_id = t.id),
            '[]'::jsonb))
        FROM app_private.transaction AS t
        WHERE t.id = removed.id
        RETURNING * INTO deleted;

        -- Splits and transfers go with it (ON DELETE CASCADE).
        DELETE FROM app_private.transaction WHERE id = removed.id;
        RETURN deleted;
      END;
    $$
    LANGUAGE plpgsql
    VOLATILE;
  `)

  // Puts a deleted transaction back as it was, under its old id, and lets imports add its id again.
  // Transfer links are not restored, and a category or import that has since been deleted is dropped.
  await knex.raw(`
    CREATE FUNCTION app_private.restore_transaction(deleted_transaction_id int)
    RETURNS app_private.deleted_transaction
    AS $$
      DECLARE
        deleted app_private.deleted_transaction;
        restored app_private.transaction;
        split jsonb;
      BEGIN
        SELECT * FROM app_private.deleted_transaction WHERE id = deleted_transaction_id INTO deleted;
        IF deleted.id IS NULL THEN
          RAISE EXCEPTION 'Deleted transaction % not found', deleted_transaction_id USING ERRCODE = 'no_data_found';
        END IF;
        PERFORM app_private.require_writable_bank_account(deleted.bank_account_id);
        IF EXISTS (SELECT 1 FROM app_private.transaction AS t
          WHERE t.bank_account_id = deleted.bank_account_id AND t.bank_transaction_id = deleted.bank_transaction_id) THEN
          RAISE EXCEPTION 'This transaction has been imported again since it was deleted' USING ERRCODE = 'unique_violation';
        END IF;

        DELETE FROM app_private.deleted_transaction WHERE id = deleted.id;

        restored := jsonb_populate_record(NULL::app_private.transaction, deleted.snapshot - 'splits');
        restored.bank_account_id := deleted.bank_account_id;
        restored.split_source_id := NULL;
        INSERT INTO app_private.transaction SELECT * FROM app_private.restorable_transaction(restored);

        FOR split IN SELECT * FROM jsonb_array_elements(deleted.snapshot->'splits') LOOP
          restored := jsonb_populate_record(NULL::app_private.transaction, split);
          restored.split_source_id := deleted.transaction_id;
          INSERT INTO app_private.transaction SELECT * FROM app_private.restorable_transaction(restored);
        END LOOP;

        RETURN deleted;
      END;
    $$
    LANGUAGE plpgsql
    VOLATILE;
  `)

  // A restored row can't point at a category or import batch that no longer exists.
  await knex.raw(`
    CREATE FUNCTION app_private.restorable_transaction(candidate app_private.transaction)
    RETURNS app_private.transaction
    AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM app_private.category WHERE id = candidate.category_id) THEN
          candidate.category_id := NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM app_private.import_batch WHERE id = candidate.import_batch_id) THEN
          candidate.import_batch_id := NULL;
        END IF;
        candidate.weighted_tsv := NULL;
        RETURN candidate;
      END;
    $$
    LANGUAGE plpgsql
    STABLE;
  `)
  await knex.raw(`COMMENT ON FUNCTION app_private.restorable_transaction(app_private.transaction) IS '@omit'`)

  await knex.raw(IMPORT_TRANSACTIONS_V5)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(IMPORT_TRANSACTIONS_V4)
  await knex.raw('DROP FUNCTION IF EXISTS app_private.restore_transaction(int)')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.restorable_transaction(app_private.transaction)')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.remove_transaction(int, text, text, int)')
  await knex.schema.withSchema('app_private').dropTableIfExists('deleted_transaction')
}
