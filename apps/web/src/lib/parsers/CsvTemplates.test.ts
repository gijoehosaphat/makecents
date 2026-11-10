import { describe, expect, it } from 'vitest'
import { detectMapping } from './CsvDetect'
import { parseHeaders } from './Csv'
import {
  adaptTemplateToFile,
  changesRowIds,
  CsvTemplate,
  findChangedFormat,
  findTemplatesForFile,
  fingerprintColumns,
  fingerprintFile,
  resolveAccountColumn,
} from './CsvTemplates'
import { findAccountIdColumn } from './Csv'

const NEW_FORMAT = [
  'transaction_date,transaction_time,account_number,account_type,transaction_type,transaction_sub_type,status,payee,payee_email,amount,currency,notes',
  '2026-11-01,14:32:05,WK8QPKD35CAD,checking,debit,purchase,posted,Coffee Shop,,-4.50,CAD,',
  '2026-11-02,09:05:00,WK8QPKD35CAD,checking,credit,e-transfer,posted,Jane Doe,jane@example.com,50.00,CAD,lunch',
].join('\n')

const OLD_FORMAT = [
  'transaction_date,account_number,account_type,transaction_type,transaction_sub_type,status,payee,amount,currency,notes',
  '2026-10-01,WK8QPKD35CAD,checking,debit,purchase,posted,Coffee Shop,-4.50,CAD,',
].join('\n')

const COSTCO = ['2026-10-01,COSTCO WHOLESALE,-120.00', '2026-10-02,GAS BAR,-60.00'].join('\n')

function templateFor(text: string, id = 1, bankAccountIds: number[] = []): CsvTemplate {
  const { mapping } = detectMapping(text)
  return {
    id,
    nodeId: `node${id}`,
    name: `t${id}`,
    fingerprint: fingerprintFile(text, mapping),
    mapping,
    bankAccountIds,
  }
}

describe('fingerprints', () => {
  it('ignore column order and how header names are written', () => {
    const layout = { delimiter: ',', hasHeaderRow: true, skipRows: 0 }
    expect(fingerprintColumns(['Date', 'Account Number', 'Amount'], layout)).toBe(
      fingerprintColumns(['amount', 'date', 'account_number'], layout),
    )
    expect(fingerprintColumns(['Date', 'Amount'], layout)).not.toBe(
      fingerprintColumns(['Date', 'Amount', 'Memo'], layout),
    )
  })

  it('count columns for a file without a header row', () => {
    expect(fingerprintColumns(['0', '1', '2'], { delimiter: ',', hasHeaderRow: false, skipRows: 0 })).toBe(
      'columns:,:3',
    )
  })
})

describe('findTemplatesForFile', () => {
  it('finds the template made for exactly this format', () => {
    const template = templateFor(NEW_FORMAT)
    expect(findTemplatesForFile(NEW_FORMAT, [template], detectMapping(NEW_FORMAT).mapping)).toEqual([template])
    expect(findTemplatesForFile(OLD_FORMAT, [template], detectMapping(OLD_FORMAT).mapping)).toEqual([])
  })

  it('never applies a template without a header row to a file with one', () => {
    const costco = templateFor(COSTCO)
    expect(costco.mapping.hasHeaderRow).toBe(false)
    expect(findTemplatesForFile(NEW_FORMAT, [costco], detectMapping(NEW_FORMAT).mapping)).toEqual([])
    expect(findTemplatesForFile(COSTCO, [costco], detectMapping(COSTCO).mapping)).toEqual([costco])
  })

  it('needs a template without a header row to read the rows, not just match the column count', () => {
    const costco = templateFor(COSTCO)
    const other = ['COSTCO WHOLESALE,-120.00,2026-10-01', 'GAS BAR,-60.00,2026-10-02'].join('\n')
    expect(findTemplatesForFile(other, [costco], detectMapping(other).mapping)).toEqual([])
  })
})

describe('findChangedFormat / adaptTemplateToFile', () => {
  it('carries a template for an earlier version of the format over to the new columns', () => {
    const old = templateFor(OLD_FORMAT, 1, [933])
    old.mapping = { ...old.mapping, nameColumns: ['payee'], memoColumns: ['notes'] }
    const detected = detectMapping(NEW_FORMAT).mapping
    const changed = findChangedFormat(NEW_FORMAT, [old], detected)
    expect(changed?.template).toBe(old)
    expect(changed?.added).toEqual(['transaction_time', 'payee_email'])
    expect(changed?.removed).toEqual([])

    const adapted = adaptTemplateToFile(old.mapping, detected, parseHeaders(NEW_FORMAT, detected), changed!.added)
    expect(adapted).toMatchObject({
      timeColumn: 'transaction_time',
      nameColumns: ['payee'],
      memoColumns: ['notes', 'payee_email'],
      accountColumn: 'account_number',
      amountColumn: 'amount',
    })
    expect(changesRowIds(old.mapping, adapted)).toBe(true)
  })

  it('ignores templates for formats that only share a few columns', () => {
    const costcoWithHeader = ['Date,Description,Amount,Category,Card', '2026-10-01,COSTCO,-120.00,Food,1234'].join('\n')
    const detected = detectMapping(NEW_FORMAT).mapping
    expect(findChangedFormat(NEW_FORMAT, [templateFor(costcoWithHeader)], detected)).toBeUndefined()
  })

  it('keeps "none" choices', () => {
    const old = templateFor(OLD_FORMAT)
    const saved = { ...old.mapping, memoColumns: [], timeColumn: null, accountColumn: null }
    const detected = detectMapping(NEW_FORMAT).mapping
    const adapted = adaptTemplateToFile(saved, detected, parseHeaders(NEW_FORMAT, detected), ['transaction_time'])
    expect(adapted).toMatchObject({ memoColumns: [], timeColumn: null, accountColumn: null })
  })
})

describe('resolveAccountColumn', () => {
  const headers = ['Date', 'Account Number', 'Amount']
  const base = detectMapping(NEW_FORMAT).mapping

  it('finds the column by name unless one was picked or "none" chosen', () => {
    const unset = { ...base, accountColumn: undefined }
    expect(resolveAccountColumn(unset, headers, findAccountIdColumn)).toBe('Account Number')
    expect(resolveAccountColumn({ ...base, accountColumn: 'Date' }, headers, findAccountIdColumn)).toBe('Date')
    expect(resolveAccountColumn({ ...base, accountColumn: null }, headers, findAccountIdColumn)).toBeUndefined()
  })

  it('uses a picked column by number in a file without a header row', () => {
    const numbered = { ...base, hasHeaderRow: false, accountColumn: '2' }
    expect(resolveAccountColumn(numbered, ['0', '1', '2'], findAccountIdColumn)).toBe('2')
    expect(
      resolveAccountColumn({ ...numbered, accountColumn: undefined }, ['0', '1', '2'], findAccountIdColumn),
    ).toBeUndefined()
  })
})
