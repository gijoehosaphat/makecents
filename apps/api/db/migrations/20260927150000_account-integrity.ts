import { Knex } from 'knex'

// Tables whose account_id may not change once set; moving a row would strand whatever references it.
const ACCOUNT_TABLES = [
  'bank_account',
  'category',
  'budget',
  'budget_category',
  'bank_csv_definition',
  'category_group',
  'custom_category_group',
]

// Each trigger rejects a row that references data belonging to a different account. They are
// SECURITY DEFINER so the check compares real ownership rather than what the caller can see.
const CHECKS: { table: string; columns: string[]; body: string }[] = [
  {
    table: 'transaction',
    columns: ['bank_account_id', 'category_id', 'split_source_id'],
    body: `
      row_account_id := (SELECT account_id FROM app_private.bank_account WHERE id = NEW.bank_account_id);
      IF TG_OP = 'UPDATE' AND NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
        AND row_account_id IS DISTINCT FROM (SELECT account_id FROM app_private.bank_account WHERE id = OLD.bank_account_id) THEN
        RAISE EXCEPTION 'A transaction cannot be moved to a bank account in another account' USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF NEW.category_id IS NOT NULL
        AND (SELECT account_id FROM app_private.category WHERE id = NEW.category_id) IS DISTINCT FROM row_account_id THEN
        RAISE EXCEPTION 'Category % belongs to another account', NEW.category_id USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF NEW.split_source_id IS NOT NULL
        AND (SELECT b.account_id FROM app_private.transaction AS t JOIN app_private.bank_account AS b ON b.id = t.bank_account_id WHERE t.id = NEW.split_source_id) IS DISTINCT FROM row_account_id THEN
        RAISE EXCEPTION 'Split source transaction % belongs to another account', NEW.split_source_id USING ERRCODE = 'foreign_key_violation';
      END IF;`,
  },
  {
    table: 'transfer',
    columns: ['transaction_source_id', 'transaction_target_id'],
    body: `
      IF (SELECT b.account_id FROM app_private.transaction AS t JOIN app_private.bank_account AS b ON b.id = t.bank_account_id WHERE t.id = NEW.transaction_source_id)
        IS DISTINCT FROM
        (SELECT b.account_id FROM app_private.transaction AS t JOIN app_private.bank_account AS b ON b.id = t.bank_account_id WHERE t.id = NEW.transaction_target_id) THEN
        RAISE EXCEPTION 'A transfer cannot link transactions from different accounts' USING ERRCODE = 'foreign_key_violation';
      END IF;`,
  },
  {
    table: 'budget_category',
    columns: ['account_id', 'budget_id', 'category_id'],
    body: `
      IF (SELECT account_id FROM app_private.budget WHERE id = NEW.budget_id) IS DISTINCT FROM NEW.account_id THEN
        RAISE EXCEPTION 'Budget % belongs to another account', NEW.budget_id USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF (SELECT account_id FROM app_private.category WHERE id = NEW.category_id) IS DISTINCT FROM NEW.account_id THEN
        RAISE EXCEPTION 'Category % belongs to another account', NEW.category_id USING ERRCODE = 'foreign_key_violation';
      END IF;`,
  },
  {
    table: 'category_group',
    columns: ['account_id', 'category_id', 'custom_category_group_id'],
    body: `
      IF NEW.category_id IS NOT NULL
        AND (SELECT account_id FROM app_private.category WHERE id = NEW.category_id) IS DISTINCT FROM NEW.account_id THEN
        RAISE EXCEPTION 'Category % belongs to another account', NEW.category_id USING ERRCODE = 'foreign_key_violation';
      END IF;
      IF NEW.custom_category_group_id IS NOT NULL
        AND (SELECT account_id FROM app_private.custom_category_group WHERE id = NEW.custom_category_group_id) IS DISTINCT FROM NEW.account_id THEN
        RAISE EXCEPTION 'Category group % belongs to another account', NEW.custom_category_group_id USING ERRCODE = 'foreign_key_violation';
      END IF;`,
  },
  {
    table: 'bank_csv_definition',
    columns: ['account_id', 'bank_account_id'],
    body: `
      IF NEW.bank_account_id IS NOT NULL
        AND (SELECT account_id FROM app_private.bank_account WHERE id = NEW.bank_account_id) IS DISTINCT FROM NEW.account_id THEN
        RAISE EXCEPTION 'Bank account % belongs to another account', NEW.bank_account_id USING ERRCODE = 'foreign_key_violation';
      END IF;`,
  },
]

export async function up(knex: Knex): Promise<void> {
  // Two households can import the same card, and bank transaction ids only need to be unique
  // within the bank account they came from.
  await knex.schema.withSchema('app_private').alterTable('bank_account', (table) => {
    table.dropUnique(['bank_account_id'])
    table.unique(['account_id', 'bank_account_id'])
  })
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropUnique(['bank_transaction_id'])
    table.unique(['bank_account_id', 'bank_transaction_id'])
  })

  await knex.raw(`
    CREATE FUNCTION app_private.prevent_account_change()
    RETURNS TRIGGER
    AS $$
      BEGIN
        IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
          RAISE EXCEPTION 'account_id of % cannot be changed', TG_TABLE_NAME USING ERRCODE = 'foreign_key_violation';
        END IF;
        RETURN NEW;
      END;
    $$
    LANGUAGE plpgsql;
  `)
  for (const tableName of ACCOUNT_TABLES) {
    await knex.raw(`
      CREATE TRIGGER prevent_account_change
      BEFORE UPDATE OF account_id
      ON app_private.${tableName}
      FOR EACH ROW
      EXECUTE PROCEDURE app_private.prevent_account_change();
    `)
  }

  for (const { table, columns, body } of CHECKS) {
    await knex.raw(`
      CREATE FUNCTION app_private.${table}_check_account()
      RETURNS TRIGGER
      AS $$
        DECLARE
          row_account_id int;
        BEGIN
          ${body}
          RETURN NEW;
        END;
      $$
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = app_private, pg_temp;
    `)
    await knex.raw(`
      CREATE TRIGGER check_account
      BEFORE INSERT OR UPDATE OF ${columns.join(', ')}
      ON app_private.${table}
      FOR EACH ROW
      EXECUTE PROCEDURE app_private.${table}_check_account();
    `)
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const { table } of CHECKS) {
    await knex.raw(`DROP TRIGGER check_account ON app_private.${table}`)
    await knex.raw(`DROP FUNCTION app_private.${table}_check_account()`)
  }
  for (const tableName of ACCOUNT_TABLES) {
    await knex.raw(`DROP TRIGGER prevent_account_change ON app_private.${tableName}`)
  }
  await knex.raw(`DROP FUNCTION app_private.prevent_account_change()`)

  // Fails if two accounts now share a bank account id or a bank transaction id.
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropUnique(['bank_account_id', 'bank_transaction_id'])
    table.unique(['bank_transaction_id'])
  })
  await knex.schema.withSchema('app_private').alterTable('bank_account', (table) => {
    table.dropUnique(['account_id', 'bank_account_id'])
    table.unique(['bank_account_id'])
  })
}

export const configuration = { transaction: true }
