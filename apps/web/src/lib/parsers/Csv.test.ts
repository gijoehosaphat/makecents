import { describe, expect, it } from 'vitest'
import {
  buildTransactions,
  computeAmount,
  findAccountIdColumn,
  groupRowsByAccountId,
  normalizeHeader,
  parseAmount,
  parseHeaders,
  parsePreview,
  parseRowDateAndAmount,
} from './Csv'

const mapping: CsvColumnMapping = {
  delimiter: ',',
  hasHeaderRow: true,
  skipRows: 0,
  dateColumn: 'Date',
  dateFormat: 'MM/dd/yyyy',
  descriptionColumn: 'Description',
  amountMode: 'single',
  amountColumn: 'Amount',
  amountSign: 'asIs',
}

describe('parseAmount', () => {
  it('returns whole cents', () => {
    expect(parseAmount('12.34')).toBe(1234)
    expect(parseAmount('-0.29')).toBe(-29)
    expect(parseAmount('1.15')).toBe(115)
  })

  it('treats empty or unreadable values as zero', () => {
    expect(parseAmount(undefined)).toBe(0)
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('n/a')).toBe(0)
  })

  it('strips currency symbols and thousands separators', () => {
    expect(parseAmount('$1,234.50')).toBe(123450)
    expect(parseAmount(' -$5.00 ')).toBe(-500)
  })

  it('reads parentheses as negative', () => {
    expect(parseAmount('(45.00)')).toBe(-4500)
    expect(parseAmount('($1,000.00)')).toBe(-100000)
  })

  it('reads a European decimal comma', () => {
    expect(parseAmount('1.234,50')).toBe(123450)
    expect(parseAmount('-12,5')).toBe(-1250)
  })
})

describe('parsePreview / parseHeaders', () => {
  const text = 'Date,Description,Amount\n01/02/2024,Coffee,-4.50\n\n01/03/2024,Pay,1000.00\n'

  it('keys rows by header and skips blank lines', () => {
    const { headers, rows } = parsePreview(text, mapping)
    expect(headers).toEqual(['Date', 'Description', 'Amount'])
    expect(rows).toEqual([
      { Date: '01/02/2024', Description: 'Coffee', Amount: '-4.50' },
      { Date: '01/03/2024', Description: 'Pay', Amount: '1000.00' },
    ])
  })

  it('skips leading summary lines', () => {
    const withPreamble = `Account summary\nBalance,100\n${text}`
    const { headers, rows } = parsePreview(withPreamble, { ...mapping, skipRows: 2 })
    expect(headers).toEqual(['Date', 'Description', 'Amount'])
    expect(rows).toHaveLength(2)
    expect(parseHeaders(withPreamble, { ...mapping, skipRows: 2 })).toEqual(['Date', 'Description', 'Amount'])
  })

  it('keys columns by index when there is no header row', () => {
    const noHeader = '01/02/2024,Coffee,-4.50\n'
    const noHeaderMapping = { ...mapping, hasHeaderRow: false }
    expect(parsePreview(noHeader, noHeaderMapping)).toEqual({
      headers: ['0', '1', '2'],
      rows: [{ '0': '01/02/2024', '1': 'Coffee', '2': '-4.50' }],
    })
    expect(parseHeaders(noHeader, noHeaderMapping)).toEqual(['0', '1', '2'])
  })
})

describe('account id columns', () => {
  it('normalizes header spellings', () => {
    expect(normalizeHeader(' Card No. ')).toBe('cardno')
    expect(normalizeHeader('account_number')).toBe('accountnumber')
    expect(normalizeHeader('Account #')).toBe('account')
  })

  it('finds the column holding the bank account identifier', () => {
    expect(findAccountIdColumn(['Date', 'Card No.', 'Amount'])).toBe('Card No.')
    expect(findAccountIdColumn(['Date', 'Description', 'Amount'])).toBeUndefined()
  })

  it('groups rows per account in first-seen order and drops rows without one', () => {
    const rows = [
      { acct: 'B', n: '1' },
      { acct: 'A', n: '2' },
      { acct: ' B ', n: '3' },
      { acct: '', n: '4' },
    ]
    const groups = groupRowsByAccountId(rows, 'acct')
    expect([...groups.keys()]).toEqual(['B', 'A'])
    expect(groups.get('B')?.map((row) => row.n)).toEqual(['1', '3'])
  })
})

describe('computeAmount', () => {
  it('reads a single amount column and can flip its sign', () => {
    expect(computeAmount({ Amount: '-4.50' }, mapping)).toBe(-450)
    expect(computeAmount({ Amount: '4.50' }, { ...mapping, amountSign: 'flipped' })).toBe(-450)
  })

  const debitCredit: CsvColumnMapping = {
    ...mapping,
    amountMode: 'debitCredit',
    amountColumn: undefined,
    debitColumn: 'Debit',
    creditColumn: 'Credit',
  }

  it('subtracts debits and adds credits', () => {
    expect(computeAmount({ Debit: '20.00', Credit: '' }, debitCredit)).toBe(-2000)
    expect(computeAmount({ Debit: '', Credit: '15.00' }, debitCredit)).toBe(1500)
  })

  it('treats a negative credit as a credit and a negative debit as a refund', () => {
    expect(computeAmount({ Debit: '', Credit: '-75.00' }, debitCredit)).toBe(7500)
    expect(computeAmount({ Debit: '-5.00', Credit: '' }, debitCredit)).toBe(500)
  })
})

describe('parseRowDateAndAmount', () => {
  it('parses the date and amount', () => {
    const parsed = parseRowDateAndAmount({ Date: '01/02/2024', Amount: '-4.50' }, mapping)
    expect(parsed?.amount).toBe(-450)
    expect(parsed?.posted.getFullYear()).toBe(2024)
    expect(parsed?.posted.getMonth()).toBe(0)
    expect(parsed?.posted.getDate()).toBe(2)
  })

  it('skips rows with no date, no amount or an unparseable date', () => {
    expect(parseRowDateAndAmount({ Date: '', Amount: '1.00' }, mapping)).toBeUndefined()
    expect(parseRowDateAndAmount({ Date: '01/02/2024', Amount: ' ' }, mapping)).toBeUndefined()
    expect(parseRowDateAndAmount({ Date: 'Beginning balance', Amount: '1.00' }, mapping)).toBeUndefined()
  })
})

describe('buildTransactions', () => {
  const rows = [
    { Date: '01/02/2024', Description: 'Coffee', Amount: '-5.00' },
    { Date: '01/02/2024', Description: 'Coffee', Amount: '-5.00' },
    { Date: '01/03/2024', Description: 'Summary', Amount: '' },
    { Date: '01/04/2024', Description: 'Pay', Amount: '100.00' },
  ]

  it('builds a transaction per usable row', async () => {
    const transactions = await buildTransactions(rows, mapping, '7')
    expect(transactions.map((transaction) => [transaction.name, transaction.amount])).toEqual([
      ['Coffee', -500],
      ['Coffee', -500],
      ['Pay', 10000],
    ])
    expect(transactions.every((transaction) => transaction.type === 'CSV')).toBe(true)
  })

  it('tells identical rows apart but gives them stable ids across imports', async () => {
    const first = await buildTransactions(rows, mapping, '7')
    const again = await buildTransactions(rows, mapping, '7')
    expect(new Set(first.map((transaction) => transaction.bankTransactionId)).size).toBe(3)
    expect(again.map((transaction) => transaction.bankTransactionId)).toEqual(
      first.map((transaction) => transaction.bankTransactionId)
    )
  })

  it('scopes ids to the bank account', async () => {
    const [a] = await buildTransactions(rows, mapping, '7')
    const [b] = await buildTransactions(rows, mapping, '8')
    expect(a.bankTransactionId).not.toBe(b.bankTransactionId)
  })
})
