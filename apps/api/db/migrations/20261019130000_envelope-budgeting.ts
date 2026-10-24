import { Knex } from 'knex'

const MEMBER_ROLE = 'makecents_member'

// The functions as first created, bucketing by UTC date; 20261020120000_envelope-local-months replaces them and
// restores these on rollback.
const postedDate = (alias: string) => `(${alias}.posted AT TIME ZONE 'UTC')::date`

// The web app worked out fund balances in the browser's time zone, and effective dates were saved at whatever time of
// day they were entered (an evening in Halifax is already the next day in UTC). The one-time conversion reads dates
// in the household's zone so the opening balances match what the app showed: the machine running the migration's
// (this is a self-hosted app), or TZ when it runs somewhere set to UTC, such as a container.
export const conversionTimeZone = () => process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

// Net activity per budget per month: every transaction in the budget's categories, leaving out transfers between
// the account's own bank accounts. Split children carry their own category and the parent keeps the remainder, so
// summing rows is correct. Runs as the caller, so row-level security limits it to what they can read.
export const BUDGET_MONTHLY_ACTIVITY_V1 = `
    CREATE FUNCTION app_private.budget_monthly_activity(account_id int, to_month date)
    RETURNS TABLE (budget_id int, month date, activity bigint)
    AS $$
      SELECT bc.budget_id, date_trunc('month', ${postedDate('t')})::date, sum(t.amount)::bigint
      FROM app_private.transaction AS t
      JOIN app_private.budget_category AS bc ON bc.category_id = t.category_id
      WHERE bc.account_id = budget_monthly_activity.account_id
        AND t.posted >= ((SELECT envelope_start_month FROM app_private.account AS a WHERE a.id = budget_monthly_activity.account_id) AT TIME ZONE 'UTC')
        AND t.posted < ((date_trunc('month', to_month) + interval '1 month') AT TIME ZONE 'UTC')
        AND app_private.transaction_transfer_count(t) = 0
      GROUP BY 1, 2;
    $$
    LANGUAGE sql
    STABLE
    STRICT;
  `

// Money that is not in any envelope, per month: payroll income, other deposits outside budgeted categories, and
// spending outside budgeted categories (uncategorized included). Ready to Assign is built from these. Payroll
// categories can never be in a budget (see 20261011120000_payroll-types), so the three never overlap.
export const ENVELOPE_UNBUDGETED_MONTHLY_V1 = `
    CREATE FUNCTION app_private.envelope_unbudgeted_monthly(account_id int, to_month date)
    RETURNS TABLE (month date, payroll bigint, unbudgeted_inflow bigint, unbudgeted_outflow bigint)
    AS $$
      WITH rows AS (
        SELECT
          date_trunc('month', ${postedDate('t')})::date AS month,
          t.amount,
          coalesce(app_private.category_is_payroll(c), false) AS payroll
        FROM app_private.transaction AS t
        JOIN app_private.bank_account AS ba ON ba.id = t.bank_account_id
        LEFT JOIN app_private.category AS c ON c.id = t.category_id
        WHERE ba.account_id = envelope_unbudgeted_monthly.account_id
          AND t.posted >= ((SELECT envelope_start_month FROM app_private.account AS a WHERE a.id = envelope_unbudgeted_monthly.account_id) AT TIME ZONE 'UTC')
          AND t.posted < ((date_trunc('month', to_month) + interval '1 month') AT TIME ZONE 'UTC')
          AND app_private.transaction_transfer_count(t) = 0
          AND NOT EXISTS (SELECT 1 FROM app_private.budget_category AS bc WHERE bc.category_id = t.category_id)
      )
      SELECT
        month,
        coalesce(sum(amount) FILTER (WHERE payroll), 0)::bigint,
        coalesce(sum(amount) FILTER (WHERE NOT payroll AND amount > 0), 0)::bigint,
        coalesce(sum(amount) FILTER (WHERE NOT payroll AND amount < 0), 0)::bigint
      FROM rows
      GROUP BY month;
    $$
    LANGUAGE sql
    STABLE
    STRICT;
  `

/**
 * What an accruing budget had earned from its effective date through the end of `as_of`, the same calculation as
 * `accruedAmount` in the web app's budgetMath.ts: the effective month is prorated by day (counting the effective
 * day) and every later calendar month through `as_of`'s month adds the full monthly amount. Created in pg_temp by the
 * migration, which is the only thing that needs it; exported so the tests can check it against the same cases.
 */
export const ACCRUED_AMOUNT_FUNCTION = `
  CREATE FUNCTION pg_temp.accrued_amount(monthly bigint, effective date, as_of date)
  RETURNS bigint
  AS $$
    WITH m AS (
      SELECT
        (extract(year FROM as_of) - extract(year FROM effective)) * 12
          + extract(month FROM as_of) - extract(month FROM effective) AS months_after,
        extract(day FROM date_trunc('month', effective) + interval '1 month' - interval '1 day') AS days_in_month
    )
    SELECT CASE
      WHEN months_after < 0 THEN 0
      WHEN months_after = 0 THEN
        floor(monthly * least(days_in_month, greatest(0, as_of - effective + 1)) / days_in_month)::bigint
      ELSE
        floor(monthly * (days_in_month - extract(day FROM effective) + 1) / days_in_month)::bigint
          + (months_after * monthly)::bigint
    END
    FROM m;
  $$
  LANGUAGE sql
  IMMUTABLE
`

/**
 * Converts budgets to envelopes in each account's start month. An accruing budget (fund, one with an
 * `effective_date`) opens with the balance it had at the end of the month before, computed as the web app did
 * (starting amount + accrued + every transaction in its categories from the effective day on). An overspent fund
 * opens at zero and its overspend is taken from the account's opening Ready to Assign, as an overspend at the end of
 * a month would be. Fixed budgets open empty. In the start month every budget is assigned its planned amount.
 *
 * Needs `budget.effective_date`, which the migration drops afterwards. `accountIds` limits it to some accounts (for
 * the tests).
 */
export async function convertAccruingBudgets(
  knex: Knex,
  { timeZone, accountIds }: { timeZone: string; accountIds?: number[] },
) {
  // Dates are read in the household's zone: a timestamptz cast to date uses the session time zone, set here for the
  // conversion and restored afterwards.
  const {
    rows: [{ previous }],
  } = await knex.raw(`SELECT current_setting('TimeZone') AS previous`)
  await knex.raw(`SELECT set_config('TimeZone', ?, true)`, [timeZone])
  const scope = accountIds ? 'AND b.account_id = ANY(?)' : ''
  const scopeBindings = accountIds ? [accountIds] : []

  await knex.raw(ACCRUED_AMOUNT_FUNCTION)
  await knex.raw(
    `
    CREATE TEMPORARY TABLE fund_balance ON COMMIT DROP AS
    SELECT
      b.id AS budget_id,
      b.account_id,
      coalesce(b.starting_amount, 0)
        + pg_temp.accrued_amount(b.amount, b.effective_date::date, a.envelope_start_month - 1)
        + coalesce((
          SELECT sum(t.amount)
          FROM app_private.transaction AS t
          JOIN app_private.budget_category AS bc ON bc.category_id = t.category_id
          WHERE bc.budget_id = b.id
            AND t.posted::date >= b.effective_date::date
            AND t.posted::date < a.envelope_start_month
        ), 0) AS balance
    FROM app_private.budget AS b
    JOIN app_private.account AS a ON a.id = b.account_id
    WHERE b.effective_date IS NOT NULL ${scope}
  `,
    scopeBindings,
  )
  await knex.raw(
    `
    UPDATE app_private.budget AS b
    SET starting_amount = coalesce((SELECT greatest(0, f.balance) FROM fund_balance AS f WHERE f.budget_id = b.id), 0)
    WHERE TRUE ${scope}
  `,
    scopeBindings,
  )
  await knex.raw(
    `
    UPDATE app_private.account AS a
    SET envelope_starting_balance = (
      SELECT coalesce(sum(least(0, f.balance)), 0) FROM fund_balance AS f WHERE f.account_id = a.id
    )
    ${accountIds ? 'WHERE a.id = ANY(?)' : ''}
  `,
    scopeBindings,
  )
  await knex.raw(`DROP TABLE fund_balance`)
  await knex.raw(`DROP FUNCTION pg_temp.accrued_amount(bigint, date, date)`)
  await knex.raw(
    `
    INSERT INTO app_private.budget_assignment (account_id, budget_id, month, amount)
    SELECT b.account_id, b.id, a.envelope_start_month, b.amount
    FROM app_private.budget AS b
    JOIN app_private.account AS a ON a.id = b.account_id
    WHERE b.amount <> 0 ${scope}
  `,
    scopeBindings,
  )
  await knex.raw(`SELECT set_config('TimeZone', ?, true)`, [previous])
}

// Every budget becomes an envelope: money is assigned to it month by month, unspent money carries over, and an
// overspend is taken from the next month's Ready to Assign. `budget.amount` is now the planned monthly assignment and
// `budget.starting_amount` the opening balance at the account's start month (only set here, for budgets that existed
// before envelopes). Accruing budgets are no longer a separate kind, so `effective_date` goes away.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('account', (table) => {
    table.date('envelope_start_month').notNullable().defaultTo(knex.raw(`date_trunc('month', now())::date`))
    // Ready to Assign before any income in the start month. Zero for new accounts; negative for an account converted
    // with overspent funds, whose overspend it absorbs.
    table.bigInteger('envelope_starting_balance').notNullable().defaultTo(0)
  })
  // Existing accounts start in the month the migration runs (the column default), converted from the month before.
  await knex.raw(`
    ALTER TABLE app_private.account
    ADD CONSTRAINT account_envelope_start_month_first CHECK (envelope_start_month = date_trunc('month', envelope_start_month))
  `)

  // Each transaction has to come out of exactly one envelope.
  await knex.schema.withSchema('app_private').alterTable('budget_category', (table) => {
    table.unique(['category_id'])
  })

  await knex.schema.withSchema('app_private').createTable('budget_assignment', (table) => {
    table.increments('id').primary()
    table.timestamps(false, true)
    table
      .integer('account_id')
      .notNullable()
      .references('id')
      .inTable('app_private.account')
      .index()
      .onDelete('CASCADE')
    table
      .integer('budget_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.budget')
      .index()
      .onDelete('CASCADE')
    // Always the first of the month.
    table.date('month').notNullable().index()
    // Signed: money can be taken back out of a budget.
    table.bigInteger('amount').notNullable()
    table.unique(['budget_id', 'month'])
  })
  await knex.raw(`
    ALTER TABLE app_private.budget_assignment
    ADD CONSTRAINT budget_assignment_month_first CHECK (month = date_trunc('month', month))
  `)

  // The same ownership rules as the other account tables (see 20260927140000_row-level-security and
  // 20260927150000_account-integrity).
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON app_private.budget_assignment TO ${MEMBER_ROLE}`)
  await knex.raw(`GRANT USAGE, SELECT ON SEQUENCE app_private.budget_assignment_id_seq TO ${MEMBER_ROLE}`)
  await knex.raw(`ALTER TABLE app_private.budget_assignment ENABLE ROW LEVEL SECURITY`)
  await knex.raw(`
    CREATE POLICY budget_assignment_select ON app_private.budget_assignment FOR SELECT
    USING (account_id IN (SELECT app_private.current_user_account_ids(false)))
  `)
  await knex.raw(`
    CREATE POLICY budget_assignment_write ON app_private.budget_assignment FOR ALL
    USING (account_id IN (SELECT app_private.current_user_account_ids(true)))
    WITH CHECK (account_id IN (SELECT app_private.current_user_account_ids(true)))
  `)
  await knex.raw(`
    CREATE TRIGGER prevent_account_change
    BEFORE UPDATE OF account_id ON app_private.budget_assignment
    FOR EACH ROW EXECUTE PROCEDURE app_private.prevent_account_change()
  `)
  await knex.raw(`
    CREATE FUNCTION app_private.budget_assignment_check_account()
    RETURNS TRIGGER
    AS $$
      BEGIN
        IF (SELECT account_id FROM app_private.budget WHERE id = NEW.budget_id) IS DISTINCT FROM NEW.account_id THEN
          RAISE EXCEPTION 'Budget % belongs to another account', NEW.budget_id USING ERRCODE = 'foreign_key_violation';
        END IF;
        RETURN NEW;
      END;
    $$
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)
  await knex.raw(`
    CREATE TRIGGER check_account
    BEFORE INSERT OR UPDATE OF account_id, budget_id ON app_private.budget_assignment
    FOR EACH ROW EXECUTE PROCEDURE app_private.budget_assignment_check_account()
  `)

  await convertAccruingBudgets(knex, { timeZone: conversionTimeZone() })
  await knex.raw(`ALTER TABLE app_private.budget ALTER COLUMN starting_amount SET DEFAULT 0`)
  await knex.raw(`UPDATE app_private.budget SET starting_amount = 0 WHERE starting_amount IS NULL`)
  await knex.raw(`ALTER TABLE app_private.budget ALTER COLUMN starting_amount SET NOT NULL`)
  await knex.schema.withSchema('app_private').alterTable('budget', (table) => {
    table.dropColumn('effective_date')
  })

  await knex.raw(BUDGET_MONTHLY_ACTIVITY_V1)
  await knex.raw(ENVELOPE_UNBUDGETED_MONTHLY_V1)

  // Moves money between two budgets' assignments for a month in one step, for moving money and covering an
  // overspend. A null budget stands for Ready to Assign, which is not stored: it is whatever has not been assigned,
  // so that side simply has no row to change. Runs as the caller, so viewers are stopped by row-level security.
  await knex.raw(`
    CREATE FUNCTION app_private.move_budget_money(
      account_id int,
      month date,
      from_budget_id int,
      to_budget_id int,
      amount bigint
    )
    RETURNS SETOF app_private.budget_assignment
    AS $$
      #variable_conflict use_column
      DECLARE
        target_month date := date_trunc('month', move_budget_money.month)::date;
      BEGIN
        IF move_budget_money.amount IS NULL OR move_budget_money.amount <= 0 THEN
          RAISE EXCEPTION 'The amount to move must be positive' USING ERRCODE = 'check_violation';
        END IF;
        IF from_budget_id IS NOT DISTINCT FROM to_budget_id THEN
          RAISE EXCEPTION 'Choose two different budgets' USING ERRCODE = 'check_violation';
        END IF;
        IF target_month < (SELECT envelope_start_month FROM app_private.account WHERE id = move_budget_money.account_id) THEN
          RAISE EXCEPTION 'Money cannot be moved before the budget start month' USING ERRCODE = 'check_violation';
        END IF;

        RETURN QUERY
        INSERT INTO app_private.budget_assignment AS ba (account_id, budget_id, month, amount)
        SELECT move_budget_money.account_id, change.budget_id, target_month, change.amount
        FROM (VALUES (from_budget_id, -move_budget_money.amount), (to_budget_id, move_budget_money.amount))
          AS change(budget_id, amount)
        WHERE change.budget_id IS NOT NULL
        ON CONFLICT (budget_id, month) DO UPDATE
        SET amount = ba.amount + excluded.amount, updated_at = now()
        RETURNING ba.*;
      END;
    $$
    LANGUAGE plpgsql
    VOLATILE;
  `)

  for (const signature of [
    'budget_monthly_activity(int, date)',
    'envelope_unbudgeted_monthly(int, date)',
    'move_budget_money(int, date, int, int, bigint)',
  ]) {
    await knex.raw(`REVOKE EXECUTE ON FUNCTION app_private.${signature} FROM PUBLIC`)
    await knex.raw(`GRANT EXECUTE ON FUNCTION app_private.${signature} TO ${MEMBER_ROLE}`)
  }
}

// The opening balances, the start-month assignments and effective dates cannot be restored; restore a backup to get
// accruing budgets back exactly.
export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION app_private.move_budget_money(int, date, int, int, bigint)`)
  await knex.raw(`DROP FUNCTION app_private.envelope_unbudgeted_monthly(int, date)`)
  await knex.raw(`DROP FUNCTION app_private.budget_monthly_activity(int, date)`)

  await knex.schema.withSchema('app_private').alterTable('budget', (table) => {
    table.timestamp('effective_date')
  })
  await knex.raw(`ALTER TABLE app_private.budget ALTER COLUMN starting_amount DROP NOT NULL`)
  await knex.raw(`ALTER TABLE app_private.budget ALTER COLUMN starting_amount DROP DEFAULT`)

  await knex.schema.withSchema('app_private').dropTable('budget_assignment')
  await knex.raw(`DROP FUNCTION app_private.budget_assignment_check_account()`)

  await knex.schema.withSchema('app_private').alterTable('budget_category', (table) => {
    table.dropUnique(['category_id'])
  })
  await knex.raw(`ALTER TABLE app_private.account DROP CONSTRAINT account_envelope_start_month_first`)
  await knex.schema.withSchema('app_private').alterTable('account', (table) => {
    table.dropColumn('envelope_start_month')
    table.dropColumn('envelope_starting_balance')
  })
}

export const configuration = { transaction: true }
