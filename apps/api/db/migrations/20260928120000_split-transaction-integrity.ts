import { Knex } from 'knex'

// Split transactions are child rows (split_source_id -> parent). The parent keeps the full value in
// original_amount and its own amount is the remainder, so reports can sum every row without double
// counting. These triggers keep that invariant, and the children's date/bank account, in the database
// rather than relying on the split dialog.
export async function up(knex: Knex): Promise<void> {
  // Deleting a parent removes its splits instead of failing on the foreign key.
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropForeign(['split_source_id'])
    table.foreign('split_source_id').references('id').inTable('app_private.transaction').onDelete('CASCADE')
  })

  // Children always share the parent's date and bank account, and splits cannot be nested.
  await knex.raw(`
    CREATE FUNCTION app_private.transaction_split_inherit_parent()
    RETURNS TRIGGER
    AS $$
      DECLARE
        parent app_private.transaction;
      BEGIN
        IF NEW.split_source_id IS NULL THEN
          RETURN NEW;
        END IF;
        SELECT * FROM app_private.transaction WHERE id = NEW.split_source_id INTO parent;
        IF parent.split_source_id IS NOT NULL THEN
          RAISE EXCEPTION 'Split transaction % cannot itself be split', parent.id USING ERRCODE = 'check_violation';
        END IF;
        NEW.posted := parent.posted;
        NEW.bank_account_id := parent.bank_account_id;
        RETURN NEW;
      END;
    $$
    LANGUAGE plpgsql;
  `)
  await knex.raw(`
    CREATE TRIGGER transaction_split_inherit_parent
    BEFORE INSERT OR UPDATE OF split_source_id, posted, bank_account_id
    ON app_private.transaction
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.transaction_split_inherit_parent();
  `)

  await knex.raw(`
    CREATE FUNCTION app_private.transaction_split_propagate_to_children()
    RETURNS TRIGGER
    AS $$
      BEGIN
        UPDATE app_private.transaction
        SET posted = NEW.posted, bank_account_id = NEW.bank_account_id
        WHERE split_source_id = NEW.id;
        RETURN NULL;
      END;
    $$
    LANGUAGE plpgsql;
  `)
  await knex.raw(`
    CREATE TRIGGER transaction_split_propagate_to_children
    AFTER UPDATE OF posted, bank_account_id
    ON app_private.transaction
    FOR EACH ROW
    WHEN (NEW.split_source_id IS NULL
      AND (NEW.posted IS DISTINCT FROM OLD.posted OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id))
    EXECUTE PROCEDURE app_private.transaction_split_propagate_to_children();
  `)

  // A parent with splits always holds original_amount minus its children, whatever amount is written to it.
  await knex.raw(`
    CREATE FUNCTION app_private.transaction_split_parent_remainder()
    RETURNS TRIGGER
    AS $$
      BEGIN
        IF NEW.split_source_id IS NULL
          AND EXISTS (SELECT 1 FROM app_private.transaction WHERE split_source_id = NEW.id) THEN
          NEW.amount := NEW.original_amount
            - (SELECT sum(amount) FROM app_private.transaction WHERE split_source_id = NEW.id);
        END IF;
        RETURN NEW;
      END;
    $$
    LANGUAGE plpgsql;
  `)
  await knex.raw(`
    CREATE TRIGGER transaction_split_parent_remainder
    BEFORE UPDATE OF amount, original_amount
    ON app_private.transaction
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.transaction_split_parent_remainder();
  `)

  // Any change to a child recomputes its parent (and its old parent, if it moved).
  await knex.raw(`
    CREATE FUNCTION app_private.transaction_split_recompute_parent()
    RETURNS TRIGGER
    AS $$
      BEGIN
        IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.split_source_id IS NOT NULL THEN
          UPDATE app_private.transaction AS p
          SET amount = p.original_amount
            - coalesce((SELECT sum(c.amount) FROM app_private.transaction AS c WHERE c.split_source_id = p.id), 0)
          WHERE p.id = OLD.split_source_id;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.split_source_id IS NOT NULL
          AND (TG_OP = 'INSERT' OR NEW.split_source_id IS DISTINCT FROM OLD.split_source_id OR NEW.amount IS DISTINCT FROM OLD.amount) THEN
          UPDATE app_private.transaction AS p
          SET amount = p.original_amount
            - coalesce((SELECT sum(c.amount) FROM app_private.transaction AS c WHERE c.split_source_id = p.id), 0)
          WHERE p.id = NEW.split_source_id;
        END IF;
        RETURN NULL;
      END;
    $$
    LANGUAGE plpgsql;
  `)
  await knex.raw(`
    CREATE TRIGGER transaction_split_recompute_parent
    AFTER INSERT OR DELETE OR UPDATE OF amount, split_source_id
    ON app_private.transaction
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.transaction_split_recompute_parent();
  `)

  // Bring existing splits in line with the rules above.
  const { rows: drift } = await knex.raw(`
    SELECT
      (SELECT count(*) FROM app_private.transaction AS c JOIN app_private.transaction AS p ON p.id = c.split_source_id
        WHERE c.posted IS DISTINCT FROM p.posted OR c.bank_account_id IS DISTINCT FROM p.bank_account_id) AS children,
      (SELECT count(*) FROM app_private.transaction AS p
        WHERE EXISTS (SELECT 1 FROM app_private.transaction WHERE split_source_id = p.id)
          AND p.amount IS DISTINCT FROM p.original_amount
            - (SELECT sum(amount) FROM app_private.transaction WHERE split_source_id = p.id)) AS parents
  `)
  console.log(
    `Split integrity: ${drift[0].children} child row(s) with a stale date/bank account, ${drift[0].parents} parent row(s) with a mismatched remainder.`
  )
  await knex.raw(`
    UPDATE app_private.transaction AS c
    SET posted = p.posted, bank_account_id = p.bank_account_id
    FROM app_private.transaction AS p
    WHERE p.id = c.split_source_id
      AND (c.posted IS DISTINCT FROM p.posted OR c.bank_account_id IS DISTINCT FROM p.bank_account_id);
  `)
  // Writing amount fires transaction_split_parent_remainder, which sets the correct value.
  await knex.raw(`
    UPDATE app_private.transaction AS p
    SET amount = p.amount
    WHERE EXISTS (SELECT 1 FROM app_private.transaction WHERE split_source_id = p.id);
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS transaction_split_recompute_parent ON app_private.transaction')
  await knex.raw('DROP TRIGGER IF EXISTS transaction_split_parent_remainder ON app_private.transaction')
  await knex.raw('DROP TRIGGER IF EXISTS transaction_split_propagate_to_children ON app_private.transaction')
  await knex.raw('DROP TRIGGER IF EXISTS transaction_split_inherit_parent ON app_private.transaction')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_split_recompute_parent()')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_split_parent_remainder()')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_split_propagate_to_children()')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_split_inherit_parent()')
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropForeign(['split_source_id'])
    table.foreign('split_source_id').references('id').inTable('app_private.transaction')
  })
}
