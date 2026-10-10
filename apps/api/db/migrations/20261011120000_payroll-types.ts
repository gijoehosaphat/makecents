import { Knex } from 'knex'

// Payroll is a first-class type for both categories and category groups. A category counts as payroll when it is
// marked payroll itself or sits in a payroll group (category_is_payroll, exposed by PostGraphile as `isPayroll`).
// Payroll is income, not something to budget, so a payroll category can never be part of a budget.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('custom_category_group', (table) => {
    // Indexed so PostGraphile exposes it as a filter (ignoreIndexes is off).
    table.text('kind').notNullable().defaultTo('spending').index()
  })
  await knex.raw(`
    ALTER TABLE app_private.custom_category_group
    ADD CONSTRAINT custom_category_group_kind_check CHECK (kind IN ('spending', 'payroll'))
  `)

  // The earlier name-based guess is not a reliable basis for expected income; payroll is marked explicitly instead.
  await knex.raw(`UPDATE app_private.category SET kind = 'spending' WHERE kind <> 'spending'`)

  // The caller can only pass a category it can already read, so the lookup itself can skip row-level security
  // (as transaction_transfer_count does); SECURITY DEFINER keeps it a cheap indexed lookup.
  await knex.raw(`
    CREATE FUNCTION app_private.category_is_payroll(category app_private.category)
    RETURNS BOOLEAN
    AS $$
      SELECT category.kind = 'payroll'
        OR EXISTS (
          SELECT 1
          FROM app_private.category_group AS cg
          JOIN app_private.custom_category_group AS ccg ON ccg.id = cg.custom_category_group_id
          WHERE cg.category_id = category.id AND ccg.kind = 'payroll'
        );
    $$
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)

  // Rejected rather than silently repaired, so nobody loses a budget link without noticing.
  await knex.raw(`
    CREATE FUNCTION app_private.reject_payroll_in_budget()
    RETURNS TRIGGER
    AS $$
    DECLARE
      offending BOOLEAN := FALSE;
    BEGIN
      IF TG_TABLE_NAME = 'budget_category' THEN
        SELECT app_private.category_is_payroll(c) INTO offending FROM app_private.category AS c WHERE c.id = NEW.category_id;
      ELSIF TG_TABLE_NAME = 'category' THEN
        offending := NEW.kind = 'payroll' AND EXISTS (SELECT 1 FROM app_private.budget_category WHERE category_id = NEW.id);
      ELSIF TG_TABLE_NAME = 'category_group' THEN
        offending := NEW.category_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM app_private.custom_category_group WHERE id = NEW.custom_category_group_id AND kind = 'payroll')
          AND EXISTS (SELECT 1 FROM app_private.budget_category WHERE category_id = NEW.category_id);
      ELSIF TG_TABLE_NAME = 'custom_category_group' THEN
        offending := NEW.kind = 'payroll' AND EXISTS (
          SELECT 1
          FROM app_private.category_group AS cg
          JOIN app_private.budget_category AS bc ON bc.category_id = cg.category_id
          WHERE cg.custom_category_group_id = NEW.id
        );
      END IF;

      IF COALESCE(offending, FALSE) THEN
        RAISE EXCEPTION 'Payroll categories cannot be part of a budget. Remove them from their budgets first.'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $$
    LANGUAGE plpgsql;
  `)
  await knex.raw(`
    CREATE TRIGGER reject_payroll_in_budget BEFORE INSERT OR UPDATE OF category_id
    ON app_private.budget_category FOR EACH ROW EXECUTE PROCEDURE app_private.reject_payroll_in_budget()
  `)
  await knex.raw(`
    CREATE TRIGGER reject_payroll_in_budget BEFORE UPDATE OF kind
    ON app_private.category FOR EACH ROW EXECUTE PROCEDURE app_private.reject_payroll_in_budget()
  `)
  await knex.raw(`
    CREATE TRIGGER reject_payroll_in_budget BEFORE INSERT OR UPDATE OF category_id, custom_category_group_id
    ON app_private.category_group FOR EACH ROW EXECUTE PROCEDURE app_private.reject_payroll_in_budget()
  `)
  await knex.raw(`
    CREATE TRIGGER reject_payroll_in_budget BEFORE UPDATE OF kind
    ON app_private.custom_category_group FOR EACH ROW EXECUTE PROCEDURE app_private.reject_payroll_in_budget()
  `)
}

// Categories that were reset to spending are not restored.
export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER reject_payroll_in_budget ON app_private.custom_category_group')
  await knex.raw('DROP TRIGGER reject_payroll_in_budget ON app_private.category_group')
  await knex.raw('DROP TRIGGER reject_payroll_in_budget ON app_private.category')
  await knex.raw('DROP TRIGGER reject_payroll_in_budget ON app_private.budget_category')
  await knex.raw('DROP FUNCTION app_private.reject_payroll_in_budget()')
  await knex.raw('DROP FUNCTION app_private.category_is_payroll(app_private.category)')
  await knex.raw('ALTER TABLE app_private.custom_category_group DROP CONSTRAINT custom_category_group_kind_check')
  await knex.schema.withSchema('app_private').alterTable('custom_category_group', (table) => {
    table.dropColumn('kind')
  })
}

export const configuration = { transaction: true }
