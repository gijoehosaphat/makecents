import { describe, expect, it } from 'vitest'
import { addMonths, coverSource, envelopeMonths, EnvelopeInput, startingReadyToAssign, toMonthKey } from './budgetMath'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)

describe('month keys', () => {
  it('names the month of a local date', () => {
    expect(toMonthKey(at(2026, 10, 31, 23, 59))).toBe('2026-10-01')
    expect(toMonthKey(at(2027, 1, 1))).toBe('2027-01-01')
  })

  it('steps across year boundaries in both directions', () => {
    expect(addMonths('2026-11-01', 2)).toBe('2027-01-01')
    expect(addMonths('2027-01-01', -1)).toBe('2026-12-01')
    expect(addMonths('2026-10-01', -22)).toBe('2024-12-01')
  })
})

describe('envelopeMonths', () => {
  const GROCERIES = 1
  const FUND = 2

  const base: EnvelopeInput = {
    startMonth: '2026-10-01',
    startingBalance: 0,
    budgets: [{ id: GROCERIES }, { id: FUND }],
    assignments: [],
    activity: [],
    unbudgeted: [],
  }

  const last = (input: Partial<EnvelopeInput>, through: string) =>
    envelopeMonths({ ...base, ...input }, through).at(-1)!
  const budget = (month: ReturnType<typeof last>, id: number) => month.budgets.find((row) => row.budgetId === id)!

  it('gives assigned income a job and leaves the rest ready to assign', () => {
    const month = last(
      {
        assignments: [{ budgetId: GROCERIES, month: '2026-10-01', amount: 50000 }],
        activity: [{ budgetId: GROCERIES, month: '2026-10-01', activity: -20000 }],
        unbudgeted: [{ month: '2026-10-01', payroll: 300000, unbudgetedInflow: 2500, unbudgetedOutflow: -1000 }],
      },
      '2026-10-01',
    )
    expect(month).toMatchObject({ income: 302500, unbudgetedSpending: 1000, assigned: 50000, readyToAssign: 251500 })
    expect(budget(month, GROCERIES)).toEqual({
      budgetId: GROCERIES,
      carryover: 0,
      assigned: 50000,
      activity: -20000,
      available: 30000,
    })
  })

  it('carries unspent money into the next month', () => {
    const month = last(
      {
        assignments: [
          { budgetId: GROCERIES, month: '2026-10-01', amount: 50000 },
          { budgetId: GROCERIES, month: '2026-11-01', amount: 50000 },
        ],
        activity: [
          { budgetId: GROCERIES, month: '2026-10-01', activity: -20000 },
          { budgetId: GROCERIES, month: '2026-11-01', activity: -60000 },
        ],
      },
      '2026-11-01',
    )
    expect(budget(month, GROCERIES)).toMatchObject({ carryover: 30000, available: 20000 })
  })

  it('resets an overspent budget and takes the overspend from next month only', () => {
    const input = {
      assignments: [{ budgetId: GROCERIES, month: '2026-10-01', amount: 10000 }],
      activity: [{ budgetId: GROCERIES, month: '2026-10-01', activity: -15000 }],
      unbudgeted: [{ month: '2026-10-01', payroll: 100000, unbudgetedInflow: 0, unbudgetedOutflow: 0 }],
    }
    const [october, november, december] = envelopeMonths({ ...base, ...input }, '2026-12-01')
    expect(budget(october, GROCERIES).available).toBe(-5000)
    expect(october.readyToAssign).toBe(90000)
    expect(budget(november, GROCERIES)).toMatchObject({ carryover: 0, available: 0 })
    expect(november).toMatchObject({ overspentLastMonth: 5000, readyToAssign: 85000 })
    expect(december).toMatchObject({ overspentLastMonth: 0, readyToAssign: 85000 })
  })

  it('takes money assigned to a later month from earlier months too', () => {
    const [october, november] = envelopeMonths(
      {
        ...base,
        assignments: [{ budgetId: FUND, month: '2026-11-01', amount: 40000 }],
        unbudgeted: [{ month: '2026-10-01', payroll: 100000, unbudgetedInflow: 0, unbudgetedOutflow: 0 }],
      },
      '2026-11-01',
    )
    expect(october.readyToAssign).toBe(60000)
    expect(budget(october, FUND).available).toBe(0)
    expect(november.readyToAssign).toBe(60000)
    expect(budget(november, FUND).available).toBe(40000)
  })

  it('opens with balances that do not come from Ready to Assign, and a negative starting balance', () => {
    const month = last(
      {
        startingBalance: -323049,
        budgets: [{ id: GROCERIES }, { id: FUND, openingBalance: '52054' }],
        unbudgeted: [{ month: '2026-10-01', payroll: '400000', unbudgetedInflow: '0', unbudgetedOutflow: '0' }],
      },
      '2026-10-01',
    )
    expect(budget(month, FUND)).toMatchObject({ carryover: 52054, available: 52054 })
    expect(month.readyToAssign).toBe(400000 - 323049)
  })

  it('lets money be taken back out of a budget with a negative assignment', () => {
    const month = last(
      {
        assignments: [
          { budgetId: FUND, month: '2026-10-01', amount: 30000 },
          { budgetId: FUND, month: '2026-10-01', amount: -10000 },
        ],
        unbudgeted: [{ month: '2026-10-01', payroll: 50000, unbudgetedInflow: 0, unbudgetedOutflow: 0 }],
      },
      '2026-10-01',
    )
    expect(budget(month, FUND).available).toBe(20000)
    expect(month.readyToAssign).toBe(30000)
  })

  it('ignores anything before the start month', () => {
    const months = envelopeMonths(
      {
        ...base,
        assignments: [{ budgetId: GROCERIES, month: '2026-09-01', amount: 99999 }],
        activity: [{ budgetId: GROCERIES, month: '2026-09-01', activity: -99999 }],
        unbudgeted: [{ month: '2026-09-01', payroll: 99999, unbudgetedInflow: 0, unbudgetedOutflow: 0 }],
      },
      '2026-10-01',
    )
    expect(months.map((month) => month.month)).toEqual(['2026-10-01'])
    expect(months[0]).toMatchObject({ readyToAssign: 0, assigned: 0 })
    expect(budget(months[0], GROCERIES).available).toBe(0)
  })

  it('returns nothing for a month before the start', () => {
    expect(envelopeMonths(base, '2026-09-01')).toEqual([])
  })
})

describe('coverSource', () => {
  const overspent = { budgetId: 1, available: -9718 }

  it('covers from Ready to Assign when it holds the whole overspend', () => {
    expect(coverSource(overspent, [overspent, { budgetId: 2, available: 50000 }], 9718)).toEqual({
      from: null,
      amount: 9718,
    })
  })

  it('otherwise takes from the budget with the most available, but no more than it has', () => {
    const budgets = [overspent, { budgetId: 2, available: 2000 }, { budgetId: 3, available: 5000 }]
    expect(coverSource(overspent, budgets, -100)).toEqual({ from: 3, amount: 5000 })
    expect(coverSource(overspent, [overspent, { budgetId: 2, available: 20000 }], 0)).toEqual({ from: 2, amount: 9718 })
  })

  it('falls back to Ready to Assign when no budget has money to spare', () => {
    const budgets = [overspent, { budgetId: 2, available: 0 }, { budgetId: 3, available: -500 }]
    expect(coverSource(overspent, budgets, -100)).toEqual({ from: null, amount: 9718 })
  })
})

describe('startingReadyToAssign', () => {
  it('uses the conversion balance until cash on hand is entered', () => {
    expect(startingReadyToAssign({ cashOnHand: null, conversionBalance: '-323049', openingBalances: ['9441'] })).toBe(
      -323049,
    )
  })

  it('starts from cash on hand less what budgets already held, replacing the conversion balance', () => {
    expect(
      startingReadyToAssign({
        cashOnHand: '1100000',
        conversionBalance: -323049,
        openingBalances: ['9441', 52054, null],
      }),
    ).toBe(1100000 - 9441 - 52054)
  })

  it('treats zero cash on hand as entered', () => {
    expect(startingReadyToAssign({ cashOnHand: 0, conversionBalance: -323049, openingBalances: [9441] })).toBe(-9441)
  })
})
