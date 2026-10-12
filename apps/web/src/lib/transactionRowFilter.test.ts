import { describe, expect, it } from 'vitest'
import { Transaction } from '@/graphql/types'
import { buildTransactionRowFilter, transactionMatchesRowFilter } from './transactionRowFilter'

const tx = (amount: number, extra: Partial<Transaction> = {}) => ({ amount, ...extra }) as unknown as Transaction

describe('buildTransactionRowFilter', () => {
  it('is undefined with no filters', () => {
    expect(buildTransactionRowFilter({})).toBeUndefined()
  })

  it('filters deposits and withdrawals by sign', () => {
    expect(buildTransactionRowFilter({ direction: 'deposits' })).toEqual({ amount: { greaterThan: '0' } })
    expect(buildTransactionRowFilter({ direction: 'withdrawals' })).toEqual({ amount: { lessThan: '0' } })
  })

  it('applies absolute bounds to withdrawals as negative amounts', () => {
    expect(buildTransactionRowFilter({ direction: 'withdrawals', amountMin: 1000, amountMax: 5000 })).toEqual({
      amount: { lessThanOrEqualTo: '-1000', greaterThanOrEqualTo: '-5000' },
    })
  })

  it('matches either sign when only bounds are set', () => {
    expect(buildTransactionRowFilter({ amountMin: 1000 })).toEqual({
      or: [{ amount: { greaterThanOrEqualTo: '1000' } }, { amount: { lessThanOrEqualTo: '-1000' } }],
    })
  })

  it('combines category and amount filters', () => {
    expect(buildTransactionRowFilter({ categorized: false, direction: 'deposits' })).toEqual({
      and: [{ categoryId: { isNull: true }, transferCount: { equalTo: 0 } }, { amount: { greaterThan: '0' } }],
    })
  })
})

describe('transactionMatchesRowFilter', () => {
  it('matches by absolute amount regardless of sign', () => {
    const options = { amountMin: 1000, amountMax: 5000 }
    expect(transactionMatchesRowFilter(tx(-2500), options)).toBe(true)
    expect(transactionMatchesRowFilter(tx(2500), options)).toBe(true)
    expect(transactionMatchesRowFilter(tx(-500), options)).toBe(false)
    expect(transactionMatchesRowFilter(tx(-6000), options)).toBe(false)
  })

  it('respects direction', () => {
    expect(transactionMatchesRowFilter(tx(-100), { direction: 'deposits' })).toBe(false)
    expect(transactionMatchesRowFilter(tx(100), { direction: 'deposits' })).toBe(true)
  })

  it('requires both category and amount to match', () => {
    expect(transactionMatchesRowFilter(tx(-100, { categoryId: 3 }), { categorized: false, direction: 'withdrawals' })).toBe(false)
    expect(transactionMatchesRowFilter(tx(-100), { categorized: false, direction: 'withdrawals' })).toBe(true)
  })
})

describe('autoCategorized', () => {
  it('filters on the category source, alongside other filters', () => {
    expect(buildTransactionRowFilter({ autoCategorized: true })).toEqual({ categorySource: { equalTo: 'auto' } })
    expect(buildTransactionRowFilter({ autoCategorized: true, categorized: true })).toEqual({
      and: [
        { categoryId: { isNull: false }, transferCount: { equalTo: 0 } },
        { categorySource: { equalTo: 'auto' } },
      ],
    })
    expect(buildTransactionRowFilter({ autoCategorized: false })).toBeUndefined()
  })

  it('matches only automatically categorized rows', () => {
    expect(transactionMatchesRowFilter(tx(-100, { categoryId: 3, categorySource: 'auto' }), { autoCategorized: true })).toBe(true)
    expect(transactionMatchesRowFilter(tx(-100, { categoryId: 3, categorySource: 'manual' }), { autoCategorized: true })).toBe(false)
    expect(transactionMatchesRowFilter(tx(-100, { categoryId: 3 }), {})).toBe(true)
  })
})
