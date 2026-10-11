import { describe, expect, it } from 'vitest'
import {
  extractFileNameIdentifiers,
  identifierMatchesAccount,
  matchAccount,
  scoreOverlap,
  type ExistingTransaction,
} from './csvAccountMatching'

describe('extractFileNameIdentifiers', () => {
  it('finds a card ending and ignores statement dates', () => {
    expect(extractFileNameIdentifiers('Chase1234_Activity20240101_20240201_20240202.CSV')).toEqual(['1234'])
  })

  it('ignores bare years and separated dates', () => {
    expect(extractFileNameIdentifiers('statement-2024.csv')).toEqual([])
    expect(extractFileNameIdentifiers('export 2024-01-31 5678.csv')).toEqual(['5678'])
  })
})

describe('identifierMatchesAccount', () => {
  it('matches an exact bank account id regardless of case', () => {
    expect(identifierMatchesAccount('wk8qpkd35cad', { id: 1, bankAccountId: 'WK8QPKD35CAD' })).toBe(true)
  })

  it('matches on the last four digits of a masked number', () => {
    expect(identifierMatchesAccount('XXXX1234', { id: 1, bankAccountId: '99991234' })).toBe(true)
    expect(identifierMatchesAccount('XXXX1234', { id: 1, bankAccountId: '99995678' })).toBe(false)
  })

  it('matches an ending written into the account name', () => {
    expect(identifierMatchesAccount('1234', { id: 1, name: 'Sapphire ••1234' })).toBe(true)
    expect(identifierMatchesAccount('1234', { id: 1, name: 'Sapphire ••5678' })).toBe(false)
  })

  it('ignores the random UUIDs given to accounts created before ids were detected', () => {
    const bankAccountId = '123e4567-e89b-12d3-a456-4266141f1234'
    expect(identifierMatchesAccount('1234', { id: 1, bankAccountId })).toBe(false)
  })

  it('does not infer endings from alphanumeric identifiers', () => {
    expect(identifierMatchesAccount('1234', { id: 1, bankAccountId: 'WK1234XY' })).toBe(false)
  })
})

describe('scoreOverlap', () => {
  const day = (d: number) => new Date(2024, 0, d)
  const existing: ExistingTransaction[] = [
    { bankAccountId: 1, posted: day(2), amount: -500 },
    { bankAccountId: 1, posted: day(10), amount: -1200 },
    { bankAccountId: 2, posted: day(2), amount: -500 },
  ]

  it('counts rows already present, ignoring sign and allowing a day of slack', () => {
    const scores = scoreOverlap(
      [
        { posted: day(3), amount: 500 },
        { posted: day(10), amount: -1200 },
      ],
      existing
    )
    expect(scores.get(1)).toBe(2)
    expect(scores.get(2)).toBe(1)
  })

  it('uses each existing transaction at most once', () => {
    const scores = scoreOverlap(
      [
        { posted: day(2), amount: -500 },
        { posted: day(2), amount: -500 },
      ],
      existing
    )
    expect(scores.get(1)).toBe(1)
  })
})

describe('matchAccount', () => {
  const accounts = [
    { id: 1, name: 'Checking', bankAccountId: '1111' },
    { id: 2, name: 'Visa ••2222', bankAccountId: 'abc' },
  ]
  const none = new Map<number, number>()

  it('prefers the file’s account column', () => {
    expect(matchAccount({ accounts, accountColumnValue: '1111', fileName: 'x2222.csv', overlapScores: none })).toEqual({
      accountId: 1,
      reason: 'accountColumn',
      detail: '1111',
    })
  })

  it('falls back to an ending in the file name', () => {
    expect(matchAccount({ accounts, fileName: 'Visa2222_Activity.csv', overlapScores: none })).toEqual({
      accountId: 2,
      reason: 'fileName',
      detail: '2222',
    })
  })

  it('uses overlap only when it is a clear winner', () => {
    expect(matchAccount({ accounts, fileName: 'export.csv', overlapScores: new Map([[1, 5]]) })?.accountId).toBe(1)
    expect(matchAccount({ accounts, fileName: 'export.csv', overlapScores: new Map([[1, 2]]) })).toBeUndefined()
    expect(
      matchAccount({ accounts, fileName: 'export.csv', overlapScores: new Map([[1, 6], [2, 4]]) })
    ).toBeUndefined()
  })

  it('does not guess when the file name and the transactions disagree', () => {
    expect(
      matchAccount({ accounts, fileName: 'Visa2222.csv', overlapScores: new Map([[1, 10]]) })
    ).toBeUndefined()
  })

  it('uses overlap to break a tie between accounts sharing an ending', () => {
    const shared = [
      { id: 1, name: 'A ••3333' },
      { id: 2, name: 'B ••3333' },
    ]
    expect(
      matchAccount({ accounts: shared, accountColumnValue: '3333', fileName: 'x.csv', overlapScores: new Map([[2, 5]]) })
    ).toEqual({ accountId: 2, reason: 'overlap', detail: '5' })
    expect(matchAccount({ accounts: shared, accountColumnValue: '3333', fileName: 'x.csv', overlapScores: none })).toBeUndefined()
  })
})
