import { describe, expect, it } from 'vitest'
import {
  accruedAmount,
  availableBalance,
  expectedMonthlyIncome,
  medianMonthlyTotal,
  isWithin,
  spendProgress,
  spentInPeriod,
} from './budgetMath'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)
const endOfDayAt = (y: number, m: number, d: number) => new Date(y, m - 1, d, 23, 59, 59, 999)

describe('isWithin', () => {
  it('includes both boundaries', () => {
    const from = at(2026, 10, 1)
    const to = endOfDayAt(2026, 10, 31)
    expect(isWithin(at(2026, 10, 1), from, to)).toBe(true)
    expect(isWithin(to, from, to)).toBe(true)
    expect(isWithin(at(2026, 9, 30, 23, 59), from, to)).toBe(false)
    expect(isWithin(at(2026, 11, 1), from, to)).toBe(false)
  })
})

describe('spentInPeriod', () => {
  it('counts a transaction posted at midnight on the first of the month', () => {
    const txs = [{ posted: at(2026, 10, 1), amount: -2500 }]
    expect(spentInPeriod(txs, at(2026, 10, 1), endOfDayAt(2026, 10, 31))).toBe(2500)
  })

  it('treats refunds as negative spend and ignores other months', () => {
    const txs = [
      { posted: at(2026, 10, 5), amount: -1000 },
      { posted: at(2026, 10, 6), amount: 300 },
      { posted: at(2026, 9, 30), amount: -9999 },
    ]
    expect(spentInPeriod(txs, at(2026, 10, 1), endOfDayAt(2026, 10, 31))).toBe(700)
  })

  it('accepts string amounts and ISO strings from GraphQL', () => {
    const txs = [{ posted: at(2026, 10, 5).toISOString(), amount: '-1000' }]
    expect(spentInPeriod(txs, at(2026, 10, 1), endOfDayAt(2026, 10, 31))).toBe(1000)
  })
})

describe('spendProgress', () => {
  it('is a percentage of the budget', () => {
    expect(spendProgress(2500, 10000)).toBe(25)
    expect(spendProgress(15000, 10000)).toBe(150)
  })

  it('handles zero budgets without dividing by zero', () => {
    expect(spendProgress(0, 0)).toBe(0)
    expect(spendProgress(100, 0)).toBe(Infinity)
  })
})

describe('accruedAmount', () => {
  it('is zero before the effective month', () => {
    expect(accruedAmount(31000, at(2026, 10, 15), endOfDayAt(2026, 9, 30))).toBe(0)
  })

  it('prorates by day inside the effective month, counting the effective day', () => {
    // October has 31 days: 1st through 31st
    expect(accruedAmount(31000, at(2026, 10, 1), endOfDayAt(2026, 10, 31))).toBe(31000)
    // 15th through 31st is 17 days
    expect(accruedAmount(31000, at(2026, 10, 15), endOfDayAt(2026, 10, 31))).toBe(17000)
    // 15th through the 15th is 1 day
    expect(accruedAmount(31000, at(2026, 10, 15), endOfDayAt(2026, 10, 15))).toBe(1000)
  })

  it('uses the same day count in the effective month whether or not later months follow', () => {
    const inMonth = accruedAmount(31000, at(2026, 10, 15), endOfDayAt(2026, 10, 31))
    const withNextMonth = accruedAmount(31000, at(2026, 10, 15), endOfDayAt(2026, 11, 30))
    expect(withNextMonth - inMonth).toBe(31000)
  })

  it('adds a full amount per later calendar month', () => {
    expect(accruedAmount(10000, at(2026, 1, 1), endOfDayAt(2026, 3, 31))).toBe(30000)
  })

  it('handles an effective date on the 31st', () => {
    // Jan 31 accrues 1/31 of January, then a full February
    expect(accruedAmount(31000, at(2026, 1, 31), endOfDayAt(2026, 2, 28))).toBe(1000 + 31000)
  })

  it('ignores the time of day on the effective date', () => {
    expect(accruedAmount(31000, at(2026, 10, 15, 14, 32), endOfDayAt(2026, 10, 31))).toBe(17000)
  })

  it('crosses year boundaries', () => {
    expect(accruedAmount(10000, at(2025, 12, 1), endOfDayAt(2026, 2, 28))).toBe(30000)
  })
})

describe('availableBalance', () => {
  const budget = { amount: 10000, startingAmount: 5000, effectiveDate: at(2026, 1, 1) }

  it('is starting amount plus accrual minus spending', () => {
    const txs = [
      { posted: at(2026, 1, 10), amount: -3000 },
      { posted: at(2026, 2, 10), amount: -2000 },
    ]
    expect(availableBalance(budget, txs, endOfDayAt(2026, 2, 28))).toBe(5000 + 20000 - 5000)
  })

  it('includes a transaction posted on the effective date even if the stored time is later in the day', () => {
    const b = { ...budget, effectiveDate: at(2026, 1, 1, 14, 30) }
    const txs = [{ posted: at(2026, 1, 1), amount: -1000 }]
    expect(availableBalance(b, txs, endOfDayAt(2026, 1, 31))).toBe(5000 + 10000 - 1000)
  })

  it('ignores transactions before the effective date and after the as-of date', () => {
    const txs = [
      { posted: at(2025, 12, 31), amount: -9999 },
      { posted: at(2026, 3, 1), amount: -9999 },
    ]
    expect(availableBalance(budget, txs, endOfDayAt(2026, 2, 28))).toBe(5000 + 20000)
  })

  it('treats a missing starting amount as zero', () => {
    expect(availableBalance({ ...budget, startingAmount: null }, [], endOfDayAt(2026, 1, 31))).toBe(10000)
  })
})

describe('medianMonthlyTotal', () => {
  const windowStart = at(2026, 4, 1)

  it('takes the middle month, ignoring a one-off bonus', () => {
    const txs = [
      { posted: at(2026, 4, 15), amount: 600000 }, // bonus month
      { posted: at(2026, 5, 15), amount: 200000 },
      { posted: at(2026, 6, 15), amount: 210000 },
    ]
    expect(medianMonthlyTotal(txs, windowStart, 3)).toEqual({ median: 210000, months: 3 })
  })

  it('averages the two middle months when the count is even', () => {
    const txs = [
      { posted: at(2026, 4, 15), amount: 200000 },
      { posted: at(2026, 5, 15), amount: 300000 },
      { posted: at(2026, 6, 15), amount: 900000 },
      { posted: at(2026, 7, 15), amount: 100000 },
    ]
    expect(medianMonthlyTotal(txs, windowStart, 4)?.median).toBe(250000)
  })

  it('sums several payments in a month before taking the median, and nets reversals', () => {
    const txs = [
      { posted: at(2026, 4, 1), amount: 100000 },
      { posted: at(2026, 4, 15), amount: 100000 },
      { posted: at(2026, 4, 20), amount: -10000 },
      { posted: at(2026, 5, 1), amount: 100000 },
      { posted: at(2026, 5, 15), amount: 100000 },
      { posted: at(2026, 5, 29), amount: 100000 },
      { posted: at(2026, 6, 1), amount: 100000 },
      { posted: at(2026, 6, 15), amount: 100000 },
    ]
    // Months total 190k, 300k, 200k
    expect(medianMonthlyTotal(txs, windowStart, 3)?.median).toBe(200000)
  })

  it('does not count months before the first payment, but does count empty months after it', () => {
    const txs = [{ posted: at(2026, 6, 15), amount: 300000 }]
    // April, May are before the first payment; June..September is 4 months, 3 of them empty.
    expect(medianMonthlyTotal(txs, windowStart, 6)).toEqual({ median: 0, months: 4 })
  })

  it('ignores transactions outside the window', () => {
    const txs = [
      { posted: at(2026, 3, 31), amount: 999999 },
      { posted: at(2026, 7, 1), amount: 999999 },
      { posted: at(2026, 5, 1), amount: 100000 },
    ]
    expect(medianMonthlyTotal(txs, windowStart, 3)).toEqual({ median: 50000, months: 2 })
  })

  it('is null when there is nothing in the window', () => {
    expect(medianMonthlyTotal([], windowStart, 6)).toBeNull()
  })
})

describe('expectedMonthlyIncome', () => {
  const windowStart = at(2026, 4, 1)

  it('adds up the median of each payroll category on its own', () => {
    const txs = [
      // Joe: steady 100k, one 400k bonus month
      { categoryId: 1, posted: at(2026, 4, 15), amount: 400000 },
      { categoryId: 1, posted: at(2026, 5, 15), amount: 100000 },
      { categoryId: 1, posted: at(2026, 6, 15), amount: 100000 },
      // Annica: 60k, 70k, 80k
      { categoryId: 2, posted: at(2026, 4, 15), amount: 60000 },
      { categoryId: 2, posted: at(2026, 5, 15), amount: 70000 },
      { categoryId: 2, posted: at(2026, 6, 15), amount: 80000 },
    ]
    const result = expectedMonthlyIncome(txs, windowStart, 3)
    expect(result?.expected).toBe(100000 + 70000)
    expect(result?.sources).toHaveLength(2)
  })

  it('judges each category on its own history length', () => {
    const txs = [
      { categoryId: 1, posted: at(2026, 4, 15), amount: 100000 },
      { categoryId: 1, posted: at(2026, 5, 15), amount: 100000 },
      { categoryId: 1, posted: at(2026, 6, 15), amount: 100000 },
      { categoryId: 2, posted: at(2026, 6, 15), amount: 50000 },
    ]
    const result = expectedMonthlyIncome(txs, windowStart, 3)
    expect(result?.expected).toBe(150000)
    expect(result?.months).toBe(3)
  })

  it('is null without any payroll', () => {
    expect(expectedMonthlyIncome([], windowStart, 6)).toBeNull()
  })
})
