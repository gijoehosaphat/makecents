import { describe, expect, it } from 'vitest'
import { Transaction } from '@/graphql/types'
import { buildTransactionsCsv } from './transactionsCsv'

const lookups = {
  accountLabel: (id?: number | null) => (id === 1 ? 'Chequing' : ''),
  categoryName: (id?: number | null) => (id === 7 ? 'Food, Drink' : ''),
}

const tx = (extra: Record<string, unknown>) => extra as unknown as Transaction

describe('buildTransactionsCsv', () => {
  it('writes a header and one line per transaction', () => {
    const csv = buildTransactionsCsv(
      [tx({ posted: '2026-03-05T12:00:00', bankAccountId: 1, name: 'Coffee', amount: -450, categoryId: 7 })],
      lookups,
    )
    expect(csv.split('\r\n')).toEqual([
      'Date,Account,Name,Memo,Category,Amount,Split,Transfer',
      '2026-03-05,Chequing,Coffee,,"Food, Drink",-4.50,,',
      '',
    ])
  })

  it('prefers custom name and memo and quotes embedded quotes', () => {
    const csv = buildTransactionsCsv(
      [tx({ posted: '2026-03-05T12:00:00', name: 'RAW', customName: 'My "thing"', memo: 'm', customMemo: 'line\nbreak', amount: 100 })],
      lookups,
    )
    expect(csv).toContain('"My ""thing""","line\nbreak"')
  })

  it('neutralizes spreadsheet formulas in text cells but not amounts', () => {
    const csv = buildTransactionsCsv([tx({ posted: '2026-03-05T12:00:00', name: '=SUM(A1)', amount: -100 })], lookups)
    expect(csv).toContain(",'=SUM(A1),")
    expect(csv).toContain(',-1.00,')
  })

  it('lists splits after their parent and flags transfers', () => {
    const csv = buildTransactionsCsv(
      [
        tx({
          posted: '2026-03-05T12:00:00',
          name: 'Parent',
          amount: -200,
          transactionsBySplitSourceId: { nodes: [tx({ posted: '2026-03-05T12:00:00', name: 'Child', amount: -300 })] },
        }),
        tx({ posted: '2026-03-06T12:00:00', name: 'Move', amount: -500, transferByTransactionSourceId: { id: 1 } }),
      ],
      lookups,
    )
    const rows = csv.trim().split('\r\n')
    expect(rows[1]).toBe('2026-03-05,,Parent,,,-2.00,,')
    expect(rows[2]).toBe('2026-03-05,,Child,,,-3.00,Yes,')
    expect(rows[3]).toBe('2026-03-06,,Move,,,-5.00,,Yes')
  })
})
