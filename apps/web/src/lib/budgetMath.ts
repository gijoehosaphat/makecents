/** Envelope budgeting maths. Amounts are integer cents throughout; spending is negative. */

/** A month as the API returns it: the first of the month, `YYYY-MM-01`. */
export type MonthKey = string

/** The month containing a local date, as a MonthKey. */
export function toMonthKey(date: Date): MonthKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

/** The MonthKey `count` months after `month` (before, when negative). */
export function addMonths(month: MonthKey, count: number): MonthKey {
  const [year, monthNumber] = month.split('-').map(Number)
  const index = year * 12 + monthNumber - 1 + count
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
}

type Amount = number | string

export interface EnvelopeInput {
  /** The account's first envelope month; anything earlier is ignored. */
  startMonth: MonthKey
  /** Ready to Assign before any income in the start month (negative when overspending was carried in). */
  startingBalance: Amount
  /** Every budget, with the balance it opened with in the start month (not taken from Ready to Assign). */
  budgets: { id: number; openingBalance?: Amount | null }[]
  /** Assigned amounts, including months after the one being viewed. */
  assignments: { budgetId: number; month: MonthKey; amount: Amount }[]
  /** Net transactions per budget and month (spending is negative). */
  activity: { budgetId: number; month: MonthKey; activity: Amount }[]
  /** Money outside any budget per month: payroll, other deposits, and spending (negative). */
  unbudgeted: { month: MonthKey; payroll: Amount; unbudgetedInflow: Amount; unbudgetedOutflow: Amount }[]
}

export interface EnvelopeBudgetMonth {
  budgetId: number
  /** Unspent money brought forward: the opening balance in the start month, then last month's available if positive. */
  carryover: number
  assigned: number
  activity: number
  /** carryover + assigned + activity; negative when overspent. */
  available: number
}

export interface EnvelopeMonth {
  month: MonthKey
  /** Payroll and other deposits outside any budget this month. */
  income: number
  /** Spending outside any budget this month (positive = money out). */
  unbudgetedSpending: number
  /** Last month's overspending, taken from this month's Ready to Assign. */
  overspentLastMonth: number
  assigned: number
  /** Money not yet given a job: negative when more has been assigned than there is. */
  readyToAssign: number
  budgets: EnvelopeBudgetMonth[]
}

function sumBy<T>(rows: T[], key: (row: T) => string, value: (row: T) => Amount): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) totals.set(key(row), (totals.get(key(row)) ?? 0) + Number(value(row) ?? 0))
  return totals
}

/**
 * Envelope budgeting, month by month from the start month through `throughMonth`. Each budget's available money is
 * what it carried over, plus what was assigned, plus its activity. Unspent money carries into the next month; an
 * overspent budget starts the next month at zero and the overspend is taken from that month's Ready to Assign.
 *
 * Ready to Assign for a month is the starting balance, plus every deposit and minus every unbudgeted spend outside
 * the envelopes up to and including the month, less everything assigned in any month (assigning ahead uses money
 * now), less the overspending absorbed before the month.
 */
export function envelopeMonths(input: EnvelopeInput, throughMonth: MonthKey): EnvelopeMonth[] {
  const { startMonth } = input
  const inRange = (month: MonthKey) => month >= startMonth
  const budgetMonth = (budgetId: number, month: MonthKey) => `${budgetId}:${month}`

  const assignments = input.assignments.filter((row) => inRange(row.month))
  const assigned = sumBy(
    assignments,
    (row) => budgetMonth(row.budgetId, row.month),
    (row) => row.amount,
  )
  const activity = sumBy(
    input.activity.filter((row) => inRange(row.month)),
    (row) => budgetMonth(row.budgetId, row.month),
    (row) => row.activity,
  )
  const totalAssigned = assignments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const unbudgeted = new Map(input.unbudgeted.map((row) => [row.month, row]))

  const months: EnvelopeMonth[] = []
  const carryover = new Map(input.budgets.map((budget) => [budget.id, Number(budget.openingBalance ?? 0)]))
  let inflowsToDate = Number(input.startingBalance ?? 0)
  let overspentToDate = 0
  let overspentLastMonth = 0

  for (let month = startMonth; month <= throughMonth; month = addMonths(month, 1)) {
    const outside = unbudgeted.get(month)
    const income = outside ? Number(outside.payroll ?? 0) + Number(outside.unbudgetedInflow ?? 0) : 0
    const unbudgetedSpending = outside ? -Number(outside.unbudgetedOutflow ?? 0) : 0
    inflowsToDate += income - unbudgetedSpending
    overspentToDate += overspentLastMonth

    const budgets = input.budgets.map((budget) => {
      const row = {
        budgetId: budget.id,
        carryover: carryover.get(budget.id) ?? 0,
        assigned: assigned.get(budgetMonth(budget.id, month)) ?? 0,
        activity: activity.get(budgetMonth(budget.id, month)) ?? 0,
      }
      return { ...row, available: row.carryover + row.assigned + row.activity }
    })

    months.push({
      month,
      income,
      unbudgetedSpending,
      overspentLastMonth,
      assigned: budgets.reduce((sum, budget) => sum + budget.assigned, 0),
      readyToAssign: inflowsToDate - totalAssigned - overspentToDate,
      budgets,
    })

    overspentLastMonth = 0
    for (const budget of budgets) {
      carryover.set(budget.budgetId, Math.max(0, budget.available))
      overspentLastMonth -= Math.min(0, budget.available)
    }
  }
  return months
}

/**
 * Where to cover an overspent budget from, and how much: Ready to Assign when it holds the whole overspend, otherwise
 * the budget with the most available, but only as much as it has, so covering never overspends another budget. With
 * money nowhere, Ready to Assign covers it all (assigning more than there is, which the page then flags).
 */
export function coverSource(
  overspent: { budgetId: number; available: number },
  budgets: { budgetId: number; available: number }[],
  readyToAssign: number,
): { from: number | null; amount: number } {
  const amount = -overspent.available
  if (readyToAssign >= amount) return { from: null, amount }
  const richest = budgets
    .filter((other) => other.budgetId !== overspent.budgetId && other.available > 0)
    .sort((a, b) => b.available - a.available)[0]
  if (!richest) return { from: null, amount }
  return { from: richest.budgetId, amount: Math.min(amount, richest.available) }
}

/**
 * Ready to Assign before any income in the start month. Once cash on hand is entered it is the money there was, less
 * what budgets already held (their opening balances); before then it is the balance the account was converted with,
 * which stood in for not knowing the cash (overspending carried in from accruing budgets).
 */
export function startingReadyToAssign({
  cashOnHand,
  conversionBalance,
  openingBalances,
}: {
  cashOnHand: Amount | null | undefined
  conversionBalance: Amount | null | undefined
  openingBalances: (Amount | null | undefined)[]
}): number {
  if (cashOnHand === null || cashOnHand === undefined) return Number(conversionBalance ?? 0)
  return Number(cashOnHand) - openingBalances.reduce<number>((sum, balance) => sum + Number(balance ?? 0), 0)
}
