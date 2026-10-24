import { Knex } from 'knex'
import { BUDGET_MONTHLY_ACTIVITY_V1, ENVELOPE_UNBUDGETED_MONTHLY_V1 } from './20261019130000_envelope-budgeting'

const MEMBER_ROLE = 'makecents_member'

// Months are the household's months, not UTC ones. Transactions are imported at local midnight in the browser's
// zone, so in a zone ahead of UTC the 1st of the month is still the previous day in UTC and its spending landed in
// the wrong month. The caller now passes its IANA time zone (the browser's, as the transaction lists use), and the
// account's months start and end at local midnight there.
//
// The functions also stop paying for row-level security and a function call on every transaction: they check the
// caller's membership of the account once (SECURITY DEFINER, like transaction_transfer_count) and leave out transfers
// with an anti-join on the transfer table's unique indexes.
//
// Both bounds and the membership check are computed once (InitPlans), so the scan uses the posted index for just the
// months asked for instead of reading every transaction in the account's categories.
const monthStart = (month: string) => `(${month}::timestamp AT TIME ZONE time_zone)`
const isMember = (fn: string) => `${fn}.account_id IN (SELECT app_private.current_user_account_ids())`
const fromStartMonth = (fn: string) =>
  `t.posted >= (SELECT ${monthStart('a.envelope_start_month')} FROM app_private.account AS a WHERE a.id = ${fn}.account_id)`
const beforeMonthAfter = `t.posted < ${monthStart(`(date_trunc('month', to_month::timestamp) + interval '1 month')`)}`
const notTransfer = `
  NOT EXISTS (SELECT 1 FROM app_private.transfer AS tr WHERE tr.transaction_source_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM app_private.transfer AS tr WHERE tr.transaction_target_id = t.id)`

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION app_private.budget_monthly_activity(int, date)`)
  await knex.raw(`DROP FUNCTION app_private.envelope_unbudgeted_monthly(int, date)`)

  // Net activity per budget per local month, from the account's start month through to_month: every transaction in
  // the budget's categories except transfers between the account's own bank accounts. Split children carry their own
  // category and the parent keeps the remainder, so summing rows is correct.
  await knex.raw(`
    CREATE FUNCTION app_private.budget_monthly_activity(account_id int, to_month date, time_zone text)
    RETURNS TABLE (budget_id int, month date, activity bigint)
    AS $$
      SELECT bc.budget_id, date_trunc('month', t.posted AT TIME ZONE time_zone)::date, sum(t.amount)::bigint
      FROM app_private.transaction AS t
      JOIN app_private.budget_category AS bc
        ON bc.category_id = t.category_id AND bc.account_id = budget_monthly_activity.account_id
      WHERE ${isMember('budget_monthly_activity')}
        AND ${fromStartMonth('budget_monthly_activity')}
        AND ${beforeMonthAfter}
        AND ${notTransfer}
      GROUP BY 1, 2;
    $$
    LANGUAGE sql
    STABLE
    STRICT
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)

  // Money outside every envelope per local month: payroll income, other deposits outside budgeted categories, and
  // spending outside budgeted categories (uncategorized included). Ready to Assign is built from these. Payroll
  // categories can never be in a budget (see 20261011120000_payroll-types), so the three never overlap.
  await knex.raw(`
    CREATE FUNCTION app_private.envelope_unbudgeted_monthly(account_id int, to_month date, time_zone text)
    RETURNS TABLE (month date, payroll bigint, unbudgeted_inflow bigint, unbudgeted_outflow bigint)
    AS $$
      WITH rows AS (
        SELECT
          date_trunc('month', t.posted AT TIME ZONE time_zone)::date AS month,
          t.amount,
          coalesce(app_private.category_is_payroll(c), false) AS payroll
        FROM app_private.transaction AS t
        JOIN app_private.bank_account AS ba
          ON ba.id = t.bank_account_id AND ba.account_id = envelope_unbudgeted_monthly.account_id
        LEFT JOIN app_private.category AS c ON c.id = t.category_id
        WHERE ${isMember('envelope_unbudgeted_monthly')}
          AND ${fromStartMonth('envelope_unbudgeted_monthly')}
          AND ${beforeMonthAfter}
          AND ${notTransfer}
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
    STRICT
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)

  for (const signature of [
    'budget_monthly_activity(int, date, text)',
    'envelope_unbudgeted_monthly(int, date, text)',
  ]) {
    await knex.raw(`REVOKE EXECUTE ON FUNCTION app_private.${signature} FROM PUBLIC`)
    await knex.raw(`GRANT EXECUTE ON FUNCTION app_private.${signature} TO ${MEMBER_ROLE}`)
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION app_private.budget_monthly_activity(int, date, text)`)
  await knex.raw(`DROP FUNCTION app_private.envelope_unbudgeted_monthly(int, date, text)`)
  await knex.raw(BUDGET_MONTHLY_ACTIVITY_V1)
  await knex.raw(ENVELOPE_UNBUDGETED_MONTHLY_V1)
  for (const signature of ['budget_monthly_activity(int, date)', 'envelope_unbudgeted_monthly(int, date)']) {
    await knex.raw(`REVOKE EXECUTE ON FUNCTION app_private.${signature} FROM PUBLIC`)
    await knex.raw(`GRANT EXECUTE ON FUNCTION app_private.${signature} TO ${MEMBER_ROLE}`)
  }
}

export const configuration = { transaction: true }
