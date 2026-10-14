import { describe, expect, it } from 'vitest'
import { detectMapping } from './CsvDetect'

describe('detectMapping', () => {
  it('reads a plain header + single amount file', () => {
    const { mapping, isComplete } = detectMapping(
      [
        'Date,Description,Amount,Balance',
        '01/15/2024,Coffee Shop,-4.50,995.50',
        '01/16/2024,Paycheck,1000.00,1995.50',
      ].join('\n'),
    )
    expect(isComplete).toBe(true)
    expect(mapping).toMatchObject({
      delimiter: ',',
      hasHeaderRow: true,
      skipRows: 0,
      dateColumn: 'Date',
      dateFormat: 'M/d/yyyy',
      descriptionColumn: 'Description',
      amountMode: 'single',
      amountColumn: 'Amount',
      amountSign: 'asIs',
    })
  })

  it('never mistakes a running balance for the amount', () => {
    const { mapping } = detectMapping(
      ['Date,Description,Balance,Amount', '01/15/2024,Coffee,995.50,-4.50', '01/16/2024,Pay,1995.50,1000.00'].join(
        '\n',
      ),
    )
    expect(mapping.amountColumn).toBe('Amount')
  })

  it('skips an account summary above the transactions', () => {
    const { mapping, isComplete } = detectMapping(
      [
        'Description,,Summary Amt.',
        'Beginning balance as of 01/01/2024,,"1,000.00"',
        'Total credits,,"500.00"',
        '',
        'Date,Description,Amount,Running Bal.',
        '01/15/2024,Coffee Shop,-4.50,995.50',
        '01/16/2024,Paycheck,1000.00,1995.50',
      ].join('\n'),
    )
    expect(isComplete).toBe(true)
    expect(mapping.skipRows).toBe(4)
    expect(mapping.hasHeaderRow).toBe(true)
    expect(mapping.dateColumn).toBe('Date')
    expect(mapping.amountColumn).toBe('Amount')
  })

  it('detects separate debit and credit columns', () => {
    const { mapping, isComplete } = detectMapping(
      ['Date,Description,Debit,Credit', '2024-01-15,Coffee Shop,4.50,', '2024-01-16,Paycheck,,1000.00'].join('\n'),
    )
    expect(isComplete).toBe(true)
    expect(mapping).toMatchObject({
      amountMode: 'debitCredit',
      debitColumn: 'Debit',
      creditColumn: 'Credit',
      dateFormat: 'yyyy-MM-dd',
    })
  })

  it('detects other delimiters', () => {
    const { mapping } = detectMapping(
      ['Date;Description;Amount', '15.01.2024;Coffee;-4.50', '16.01.2024;Pay;1000.00'].join('\n'),
    )
    expect(mapping.delimiter).toBe(';')
    expect(mapping.dateFormat).toBe('d.M.yyyy')
  })

  it('handles files with no header row', () => {
    const { mapping, isComplete } = detectMapping(
      ['01/15/2024,Coffee Shop,-4.50', '01/16/2024,Paycheck,1000.00'].join('\n'),
    )
    expect(isComplete).toBe(true)
    expect(mapping.hasHeaderRow).toBe(false)
    expect(mapping.dateColumn).toBe('0')
    expect(mapping.descriptionColumn).toBe('1')
    expect(mapping.amountColumn).toBe('2')
  })

  it('flips American Express files, which list charges as positive', () => {
    const { mapping } = detectMapping(
      [
        'Date,Description,Card Member,Amount',
        '01/15/2024,COFFEE SHOP,JOE LEONARD,4.50',
        '01/16/2024,GROCERY,JOE LEONARD,82.10',
      ].join('\n'),
    )
    expect(mapping.amountSign).toBe('flipped')
  })

  it('flips a card that lists charges as positive and payments as negative', () => {
    const { mapping } = detectMapping(
      [
        'Date,Description,Amount',
        '01/10/2024,Coffee,4.50',
        '01/11/2024,Grocery,82.10',
        '01/12/2024,Gas,40.00',
        '01/13/2024,PAYMENT - THANK YOU,-200.00',
      ].join('\n'),
    )
    expect(mapping.amountSign).toBe('flipped')
  })

  it('leaves an account that mostly receives money alone', () => {
    const { mapping } = detectMapping(
      [
        'Date,Description,Amount',
        '01/10/2024,Allowance,20.00',
        '01/11/2024,Gift,50.00',
        '01/12/2024,Interest,0.10',
        '01/13/2024,Toy,-15.00',
      ].join('\n'),
    )
    expect(mapping.amountSign).toBe('asIs')
  })

  it('reports an incomplete mapping when nothing looks like a transaction', () => {
    const { isComplete, mapping } = detectMapping('just,some,words\nnot,a,statement')
    expect(isComplete).toBe(false)
    expect(mapping.dateColumn).toBe('')
  })
})
