import { describe, expect, it } from 'vitest'
import { countDuplicateRows, type ImportRow } from './csvDuplicates'

const day = new Date('2026-09-21T03:00:00Z')
const row = (bankTransactionId: string, name = 'Spend', amount = -10924, posted = day): ImportRow => ({
  posted,
  amount,
  name,
  bankTransactionId,
})

describe('countDuplicateRows', () => {
  it('counts rows whose id is already stored', () => {
    expect(countDuplicateRows([row('a'), row('b')], [row('a')])).toBe(1)
  })

  it('counts a row the bank renamed and gave a new id', () => {
    expect(countDuplicateRows([row('new', 'Spend')], [row('old', 'Withdrawal (executed at 2026-09-21)')])).toBe(1)
  })

  it('counts rows whose id was deleted from the account', () => {
    expect(countDuplicateRows([row('a'), row('b', 'Other', -1)], [], new Set(['a']))).toBe(1)
  })

  it('keeps legitimate same-day pairs', () => {
    expect(countDuplicateRows([row('a'), row('b')], [])).toBe(0)
  })

  it('only counts as many renamed rows as the account has', () => {
    expect(countDuplicateRows([row('n1'), row('n2'), row('n3')], [row('o1'), row('o2')])).toBe(2)
  })

  it('ignores rows with a different date or amount', () => {
    expect(countDuplicateRows([row('n', 'Spend', -1)], [row('o')])).toBe(0)
    expect(countDuplicateRows([row('n', 'Spend', -10924, new Date('2026-09-22T03:00:00Z'))], [row('o')])).toBe(0)
  })

  it('pairs same names before different ones', () => {
    const existing = [row('o1', 'TEA'), row('o2', 'COFFEE')]
    expect(countDuplicateRows([row('n1', 'COFFEE'), row('n2', 'JUICE')], existing)).toBe(2)
    expect(countDuplicateRows([row('n1', 'COFFEE'), row('n2', 'COFFEE')], [row('o2', 'COFFEE')])).toBe(1)
  })
})
