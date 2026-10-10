import { differenceInCalendarDays, differenceInCalendarMonths, getDaysInMonth, startOfDay } from 'date-fns'

type DateInput = Date | string | number

export interface DatedAmount {
  posted?: DateInput | null
  amount?: number | string | null
}

export interface AccruingBudget {
  amount: number | string
  startingAmount?: number | string | null
  effectiveDate: DateInput
}

/** Amounts are integer cents throughout. Spending is stored as negative transaction amounts. */

/** True when `date` falls on or between `from` and `to`. */
export function isWithin(date: DateInput | null | undefined, from: Date, to: Date): boolean {
  if (date == null) return false
  const time = new Date(date).getTime()
  return time >= from.getTime() && time <= to.getTime()
}

/** Net spend (positive = money out) of the transactions that posted in the period. */
export function spentInPeriod(transactions: DatedAmount[], from: Date, to: Date): number {
  return transactions.reduce(
    (sum, transaction) => (isWithin(transaction.posted, from, to) ? sum - Number(transaction.amount ?? 0) : sum),
    0,
  )
}

/** Spent as a percentage of budgeted. A zero budget is infinitely over as soon as anything is spent. */
export function spendProgress(spent: number, budgeted: number): number {
  if (budgeted <= 0) return spent > 0 ? Infinity : 0
  return (spent / budgeted) * 100
}

function prorate(monthlyAmount: number, days: number, daysInMonth: number): number {
  return Math.floor((monthlyAmount * days) / daysInMonth)
}

/**
 * What an accruing budget has earned from its effective date through the end of `asOf`'s month.
 * The effective day counts as the first day of accrual; the effective month is prorated by day and
 * every later calendar month through `asOf`'s month contributes the full monthly amount.
 */
export function accruedAmount(monthlyAmount: number, effectiveDate: DateInput, asOf: Date): number {
  const start = startOfDay(new Date(effectiveDate))
  const monthsAfterStart = differenceInCalendarMonths(asOf, start)
  if (monthsAfterStart < 0) return 0

  const daysInStartMonth = getDaysInMonth(start)
  if (monthsAfterStart === 0) {
    const days = Math.min(daysInStartMonth, Math.max(0, differenceInCalendarDays(asOf, start) + 1))
    return prorate(monthlyAmount, days, daysInStartMonth)
  }

  const daysAccruedInStartMonth = daysInStartMonth - start.getDate() + 1
  return prorate(monthlyAmount, daysAccruedInStartMonth, daysInStartMonth) + monthsAfterStart * monthlyAmount
}

/**
 * Balance available in an accruing budget as of `asOf`: the starting amount, plus everything accrued
 * since the effective date, plus the (negative) transactions posted from the effective day through `asOf`.
 */
export function availableBalance(budget: AccruingBudget, transactions: DatedAmount[], asOf: Date): number {
  const start = startOfDay(new Date(budget.effectiveDate))
  const net = transactions.reduce(
    (sum, transaction) => (isWithin(transaction.posted, start, asOf) ? sum + Number(transaction.amount ?? 0) : sum),
    0,
  )
  return Number(budget.startingAmount ?? 0) + accruedAmount(Number(budget.amount), budget.effectiveDate, asOf) + net
}

export interface MonthlyMedian {
  /** Median of the monthly totals, in cents. */
  median: number
  /** How many months the median covers. */
  months: number
}

/** Median of numbers; the mean of the two middle values (rounded) when there is an even count. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

/**
 * Median monthly total of the transactions in the `windowMonths` calendar months starting at `windowStart`.
 * Months before the first transaction are left out, so a source with only three months of history is judged on
 * three months, but a later month with nothing counts as zero. A median shrugs off the odd bonus or refund month
 * that would skew an average. Null when there is nothing in the window.
 */
export function medianMonthlyTotal(
  transactions: DatedAmount[],
  windowStart: Date,
  windowMonths: number,
): MonthlyMedian | null {
  const totals = new Array<number>(windowMonths).fill(0)
  let firstMonth = Infinity
  for (const transaction of transactions) {
    if (transaction.posted == null) continue
    const month = differenceInCalendarMonths(new Date(transaction.posted), windowStart)
    if (month < 0 || month >= windowMonths) continue
    totals[month] += Number(transaction.amount ?? 0)
    firstMonth = Math.min(firstMonth, month)
  }
  if (firstMonth === Infinity) return null
  const counted = totals.slice(firstMonth)
  return { median: median(counted), months: counted.length }
}

export interface ExpectedIncome {
  /** Sum of each source's median monthly total, in cents. */
  expected: number
  /** The longest history any source contributed, in months. */
  months: number
  sources: { categoryId: number | null; median: number; months: number }[]
}

/**
 * Expected monthly income: the median monthly total of each payroll source (category) on its own, added together.
 * Taking the median per source keeps one person's bonus from raising the other's typical pay.
 */
export function expectedMonthlyIncome(
  transactions: (DatedAmount & { categoryId?: number | null })[],
  windowStart: Date,
  windowMonths: number,
): ExpectedIncome | null {
  const bySource = new Map<number | null, DatedAmount[]>()
  for (const transaction of transactions) {
    const key = transaction.categoryId ?? null
    bySource.set(key, [...(bySource.get(key) ?? []), transaction])
  }
  const sources: ExpectedIncome['sources'] = []
  for (const [categoryId, sourceTransactions] of bySource) {
    const result = medianMonthlyTotal(sourceTransactions, windowStart, windowMonths)
    if (result) sources.push({ categoryId, ...result })
  }
  if (sources.length === 0) return null
  return {
    expected: sources.reduce((sum, source) => sum + source.median, 0),
    months: Math.max(...sources.map((source) => source.months)),
    sources,
  }
}
