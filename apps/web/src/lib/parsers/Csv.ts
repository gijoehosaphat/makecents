import Papa from 'papaparse'
import { isValid, parse as parseDateString } from 'date-fns'

export interface CsvPreview {
  headers: string[]
  rows: Record<string, string>[]
}

function stripSkippedRows(text: string, skipRows: number): string {
  if (!skipRows) {
    return text
  }
  return text.split(/\r?\n/).slice(skipRows).join('\n')
}

/**
 * Parses raw CSV text into header-keyed rows. When the mapping says there's no
 * header row, columns are keyed by their stringified index (e.g. "0", "1")
 * instead, so downstream code can always look columns up by name.
 */
export function parsePreview(text: string, mapping: Pick<CsvColumnMapping, 'delimiter' | 'hasHeaderRow' | 'skipRows'>): CsvPreview {
  const content = stripSkippedRows(text, mapping.skipRows)

  if (mapping.hasHeaderRow) {
    const result = Papa.parse<Record<string, string>>(content, {
      delimiter: mapping.delimiter,
      header: true,
      skipEmptyLines: true,
    })
    return { headers: result.meta.fields ?? [], rows: result.data }
  }

  const result = Papa.parse<string[]>(content, {
    delimiter: mapping.delimiter,
    header: false,
    skipEmptyLines: true,
  })
  const columnCount = result.data.reduce((max, row) => Math.max(max, row.length), 0)
  const headers = Array.from({ length: columnCount }, (_, index) => String(index))
  const rows = result.data.map((row) => {
    const record: Record<string, string> = {}
    row.forEach((value, index) => {
      record[String(index)] = value
    })
    return record
  })
  return { headers, rows }
}

/** Just the column names a file has when read with these settings, without parsing every row. */
export function parseHeaders(text: string, mapping: Pick<CsvColumnMapping, 'delimiter' | 'hasHeaderRow' | 'skipRows'>): string[] {
  const result = Papa.parse<string[]>(stripSkippedRows(text, mapping.skipRows), {
    delimiter: mapping.delimiter,
    header: false,
    skipEmptyLines: true,
    preview: 1,
  })
  const firstRow = result.data[0] ?? []
  return mapping.hasHeaderRow ? firstRow : firstRow.map((_, index) => String(index))
}

export function parseAmount(value: string | undefined): number {
  if (!value) {
    return 0
  }
  const trimmed = value.trim()
  const isParenNegative = /^\(.*\)$/.test(trimmed)
  // "-1.234,50" (European decimal comma) rather than "1,234" (US thousands separator).
  const isDecimalComma = /,\d{1,2}\)?$/.test(trimmed)
  const cleaned = (isDecimalComma ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed).replace(/[()$,\s]/g, '')
  const magnitude = Number(cleaned) || 0
  const signed = isParenNegative ? -Math.abs(magnitude) : magnitude
  return Math.round(signed * 100)
}

const ACCOUNT_ID_HEADER_ALIASES = new Set([
  'accountid',
  'acctid',
  'accountnumber',
  'acctnum',
  'accountno',
  'account',
  'cardno',
  'cardnumber',
  'cardnum',
  'card',
])

export function normalizeHeader(header: string): string {
  // "Card No.", "Account #", "account_number" all normalize to their bare letters.
  return header.trim().toLowerCase().replace(/[\s_.#-]+/g, '')
}

/** Finds a header that looks like it holds the bank's own account identifier (e.g. "account_id"). */
export function findAccountIdColumn(headers: string[]): string | undefined {
  return headers.find((header) => ACCOUNT_ID_HEADER_ALIASES.has(normalizeHeader(header)))
}

/** Splits rows into per-account groups using an account id column, preserving first-seen order. */
export function groupRowsByAccountId(
  rows: Record<string, string>[],
  column: string
): Map<string, Record<string, string>[]> {
  const groups = new Map<string, Record<string, string>[]>()
  for (const row of rows) {
    const value = row[column]?.trim()
    if (!value) {
      continue
    }
    const group = groups.get(value)
    if (group) {
      group.push(row)
    } else {
      groups.set(value, [row])
    }
  }
  return groups
}

export function getMappedColumns(mapping: CsvColumnMapping): string[] {
  const columns =
    mapping.amountMode === 'debitCredit'
      ? [mapping.dateColumn, mapping.descriptionColumn, mapping.memoColumn, mapping.debitColumn, mapping.creditColumn]
      : [mapping.dateColumn, mapping.descriptionColumn, mapping.memoColumn, mapping.amountColumn]
  return columns.filter((column): column is string => Boolean(column))
}

/** Whether the mapping names every column needed to read an amount. */
export function hasAmountColumns(mapping: CsvColumnMapping): boolean {
  return mapping.amountMode === 'debitCredit' ? !!mapping.debitColumn && !!mapping.creditColumn : !!mapping.amountColumn
}

export function computeAmount(row: Record<string, string>, mapping: CsvColumnMapping): number {
  // Some banks (e.g. Citi) write payments as negative numbers in the credit column, so a credit
  // always adds. A negative debit is a refund/reversal and keeps its sign, so it adds too.
  const amount =
    mapping.amountMode === 'debitCredit'
      ? Math.abs(parseAmount(row[mapping.creditColumn ?? ''])) - parseAmount(row[mapping.debitColumn ?? ''])
      : parseAmount(row[mapping.amountColumn ?? ''])
  return mapping.amountSign === 'flipped' ? -amount : amount
}

/**
 * A CSV row's id within a bank account, so re-importing an overlapping file skips rows already
 * there. Identical rows in one file (two $5 coffees the same day) are told apart by occurrence;
 * the first keeps the plain id so earlier imports still match. The database assigns the stored id
 * itself (app_private.csv_transaction_id in import_transactions); this copy only lets the import
 * dialog preview how many rows are already there.
 */
async function hashTransactionId(
  bankAccountId: string,
  posted: Date,
  amount: number,
  name: string,
  occurrence: number
): Promise<string> {
  const input = `${bankAccountId}|${posted.toISOString()}|${amount}|${name}${occurrence > 1 ? `|${occurrence}` : ''}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `csv-${hex}`
}

/** The row's posted date and signed amount in cents, or undefined when it has no usable date. */
export function parseRowDateAndAmount(
  row: Record<string, string>,
  mapping: CsvColumnMapping
): { posted: Date; amount: number } | undefined {
  const dateValue = row[mapping.dateColumn]
  const amountColumns =
    mapping.amountMode === 'debitCredit' ? [mapping.debitColumn, mapping.creditColumn] : [mapping.amountColumn]
  // Summary lines like Bank of America's "Beginning balance as of …" have a date but no amount.
  if (!dateValue || amountColumns.every((column) => !row[column ?? '']?.trim())) {
    return undefined
  }
  const posted = parseDateString(dateValue.trim(), mapping.dateFormat, new Date())
  return isValid(posted) ? { posted, amount: computeAmount(row, mapping) } : undefined
}

export async function buildTransactions(
  rows: Record<string, string>[],
  mapping: CsvColumnMapping,
  bankAccountId: string
): Promise<InputTransaction[]> {
  const transactions: InputTransaction[] = []
  const occurrences = new Map<string, number>()
  for (const row of rows) {
    const parsed = parseRowDateAndAmount(row, mapping)
    if (!parsed) {
      continue
    }
    const { posted, amount } = parsed
    const name = row[mapping.descriptionColumn] ?? ''
    const memo = (mapping.memoColumn && row[mapping.memoColumn]) || ''
    const key = `${posted.toISOString()}|${amount}|${name}`
    const occurrence = (occurrences.get(key) ?? 0) + 1
    occurrences.set(key, occurrence)
    const bankTransactionId = await hashTransactionId(bankAccountId, posted, amount, name, occurrence)
    transactions.push({ posted, amount, name, memo, type: 'CSV', bankTransactionId })
  }
  return transactions
}
