import { describe, expect, it } from 'vitest'
import {
  buildTransactions,
  computeAmount,
  describeColumns,
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
  nameColumns: ['Description'],
  memoColumns: [],
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

  it('adds the time of day from a time column', () => {
    const timed = { ...mapping, timeColumn: 'Time', timeFormat: 'H:mm:ss' }
    const parsed = parseRowDateAndAmount({ Date: '01/02/2024', Time: '14:32:05', Amount: '-4.50' }, timed)
    expect([parsed?.posted.getDate(), parsed?.posted.getHours(), parsed?.posted.getMinutes()]).toEqual([2, 14, 32])
    expect(parsed?.posted.getSeconds()).toBe(5)
  })

  it('keeps a row at midnight when its time is missing or unreadable', () => {
    const timed = { ...mapping, timeColumn: 'Time', timeFormat: 'H:mm:ss' }
    for (const Time of ['', 'soon']) {
      const parsed = parseRowDateAndAmount({ Date: '01/02/2024', Time, Amount: '-4.50' }, timed)
      expect([parsed?.posted.getDate(), parsed?.posted.getHours()]).toEqual([2, 0])
    }
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
      first.map((transaction) => transaction.bankTransactionId),
    )
  })

  it('joins several memo columns in order, skipping blanks', async () => {
    const joined = { ...mapping, memoColumns: ['Notes', 'Email'] }
    const transactions = await buildTransactions(
      [
        { Date: '01/02/2024', Description: 'Coffee', Amount: '-5.00', Notes: 'latte', Email: ' cafe@example.com ' },
        { Date: '01/02/2024', Description: 'Tea', Amount: '-3.00', Notes: '', Email: 'tea@example.com' },
        { Date: '01/02/2024', Description: 'Cake', Amount: '-4.00', Notes: '', Email: '' },
      ],
      joined,
      '7',
    )
    expect(transactions.map((transaction) => transaction.memo)).toEqual([
      'latte · cafe@example.com',
      'tea@example.com',
      '',
    ])
  })

  it('names a row by its name columns, falling back to whichever has a value', async () => {
    const joined = { ...mapping, nameColumns: ['Payee', 'Type'] }
    const transactions = await buildTransactions(
      [
        { Date: '01/02/2024', Payee: 'Jane Doe', Type: 'E-Transfer', Amount: '-50.00' },
        { Date: '01/03/2024', Payee: ' ', Type: 'Interest', Amount: '0.12' },
      ],
      joined,
      '7',
    )
    expect(transactions.map((transaction) => transaction.name)).toEqual(['Jane Doe · E-Transfer', 'Interest'])
  })

  it('reads a single name column untrimmed, so rows keep their ids', async () => {
    const [transaction] = await buildTransactions(
      [{ Date: '01/02/2024', Description: ' Coffee ', Amount: '-5.00' }],
      mapping,
      '7',
    )
    expect(transaction.name).toBe(' Coffee ')
  })

  it('scopes ids to the bank account', async () => {
    const [a] = await buildTransactions(rows, mapping, '7')
    const [b] = await buildTransactions(rows, mapping, '8')
    expect(a.bankTransactionId).not.toBe(b.bankTransactionId)
  })
})

describe('describeColumns', () => {
  const text = [
    'Account summary',
    'Date,Description,Amount',
    '01/02/2024,A very long coffee shop description here,-4.50',
  ].join('\n')

  it('names numbered columns from a skipped header row', () => {
    expect(describeColumns(text, { delimiter: ',', hasHeaderRow: false, skipRows: 2 })).toEqual({
      '0': 'Date',
      '1': 'Description',
      '2': 'Amount',
    })
  })

  it('falls back to the first value as an example, shortened', () => {
    const labels = describeColumns(text, { delimiter: ',', hasHeaderRow: false, skipRows: 0 })
    expect(labels['0']).toBe('e.g. Account summary')
    const noHeader = describeColumns('01/02/2024,A very long coffee shop description here,-4.50', {
      delimiter: ',',
      hasHeaderRow: false,
      skipRows: 0,
    })
    expect(noHeader).toEqual({ '0': 'e.g. 01/02/2024', '1': 'e.g. A very long coffee shop descr…', '2': 'e.g. -4.50' })
  })

  it('is empty when the file is read with its header', () => {
    expect(describeColumns(text, { delimiter: ',', hasHeaderRow: true, skipRows: 1 })).toEqual({})
  })
})
