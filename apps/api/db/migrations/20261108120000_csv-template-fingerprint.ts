import type { Knex } from 'knex'

// A CSV template describes a file *format* and is identified by it: the fingerprint of the file's
// columns (its sorted header names, or its column count when it has no header row). A template
// only applies to a file with the same fingerprint, so a loose match can no longer hand one
// bank's settings to another's file. Accounts are worked out from the file itself (its account
// column, file name or overlap), so a template is shared by every account exporting that format
// and only remembers which accounts it has imported into, as a hint when the file has no better
// clue. Existing templates never recorded their files' columns, so they can't be fingerprinted;
// they're cleared and recreated, from detection, on each format's next import.
const CHECK_ACCOUNT = (column: 'bank_account_id' | 'bank_account_ids') =>
  column === 'bank_account_ids'
    ? `
      IF EXISTS (
        SELECT 1 FROM unnest(NEW.bank_account_ids) AS ids(bank_account_id)
        WHERE (SELECT b.account_id FROM app_private.bank_account AS b WHERE b.id = ids.bank_account_id)
          IS DISTINCT FROM NEW.account_id
      ) THEN
        RAISE EXCEPTION 'A bank account belongs to another account' USING ERRCODE = 'foreign_key_violation';
      END IF;`
    : `
      IF NEW.bank_account_id IS NOT NULL
        AND (SELECT account_id FROM app_private.bank_account WHERE id = NEW.bank_account_id) IS DISTINCT FROM NEW.account_id THEN
        RAISE EXCEPTION 'Bank account % belongs to another account', NEW.bank_account_id USING ERRCODE = 'foreign_key_violation';
      END IF;`

async function replaceCheckAccount(knex: Knex, column: 'bank_account_id' | 'bank_account_ids') {
  await knex.raw(`DROP TRIGGER IF EXISTS check_account ON app_private.bank_csv_definition`)
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.bank_csv_definition_check_account()
    RETURNS TRIGGER
    AS $$
      DECLARE
        row_account_id int;
      BEGIN
        ${CHECK_ACCOUNT(column)}
        RETURN NEW;
      END;
    $$
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)
  await knex.raw(`
    CREATE TRIGGER check_account
    BEFORE INSERT OR UPDATE OF account_id, ${column}
    ON app_private.bank_csv_definition
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.bank_csv_definition_check_account();
  `)
}

export async function up(knex: Knex): Promise<void> {
  await knex('bank_csv_definition').withSchema('app_private').delete()
  await knex.raw(`DROP TRIGGER IF EXISTS check_account ON app_private.bank_csv_definition`)
  await knex.schema.withSchema('app_private').alterTable('bank_csv_definition', (table) => {
    table.dropColumn('bank_account_id')
    table.text('fingerprint').notNullable()
    table.specificType('bank_account_ids', 'integer[]').notNullable().defaultTo('{}')
    table.unique(['account_id', 'fingerprint'])
  })
  await knex.raw(
    `COMMENT ON COLUMN app_private.bank_csv_definition.fingerprint IS 'The file format this template reads: its sorted header names, or its column count when it has no header row.'`,
  )
  await knex.raw(
    `COMMENT ON COLUMN app_private.bank_csv_definition.bank_account_ids IS 'The bank accounts this template has imported into.'`,
  )
  await replaceCheckAccount(knex, 'bank_account_ids')
}

export async function down(knex: Knex): Promise<void> {
  await knex('bank_csv_definition').withSchema('app_private').delete()
  await knex.raw(`DROP TRIGGER IF EXISTS check_account ON app_private.bank_csv_definition`)
  await knex.schema.withSchema('app_private').alterTable('bank_csv_definition', (table) => {
    table.dropUnique(['account_id', 'fingerprint'])
    table.dropColumn('fingerprint')
    table.dropColumn('bank_account_ids')
    table
      .integer('bank_account_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('app_private.bank_account')
      .index()
      .onDelete('SET NULL')
  })
  await replaceCheckAccount(knex, 'bank_account_id')
}

export const configuration = { transaction: true }
