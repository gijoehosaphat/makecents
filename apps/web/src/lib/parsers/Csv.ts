import Papa from 'papaparse'
import { parse as parseDateString } from 'date-fns'

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

function parseAmount(value: string | undefined): number {
  if (!value) {
    return 0
  }
  const trimmed = value.trim()
  const isParenNegative = /^\(.*\)$/.test(trimmed)
  const cleaned = trimmed.replace(/[()$,\s]/g, '')
  const magnitude = Number(cleaned) || 0
  const signed = isParenNegative ? -Math.abs(magnitude) : magnitude
  return Math.round(signed * 100)
}

const ACCOUNT_ID_HEADER_ALIASES = new Set(['accountid', 'acctid', 'accountnumber', 'acctnum', 'accountno'])

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

/** Finds a header that looks like it holds the bank's own account identifier (e.g. "account_id"). */
export function findAccountIdColumn(headers: string[]): string | undefined {
  return headers.find((header) => ACCOUNT_ID_HEADER_ALIASES.has(normalizeHeader(header)))
}

export function findAccountIdValue(rows: Record<string, string>[], column: string): string | undefined {
  for (const row of rows) {
    const value = row[column]?.trim()
    if (value) {
      return value
    }
  }
  return undefined
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

export function computeAmount(row: Record<string, string>, mapping: CsvColumnMapping): number {
  const amount =
    mapping.amountMode === 'debitCredit'
      ? parseAmount(row[mapping.creditColumn ?? '']) - parseAmount(row[mapping.debitColumn ?? ''])
      : parseAmount(row[mapping.amountColumn ?? ''])
  return mapping.amountSign === 'flipped' ? -amount : amount
}

async function hashTransactionId(bankAccountId: string, posted: Date, amount: number, name: string): Promise<string> {
  const input = `${bankAccountId}|${posted.toISOString()}|${amount}|${name}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `csv-${hex}`
}

export async function buildTransactions(
  rows: Record<string, string>[],
  mapping: CsvColumnMapping,
  bankAccountId: string
): Promise<InputTransaction[]> {
  const transactions: InputTransaction[] = []
  for (const row of rows) {
    const dateValue = row[mapping.dateColumn]
    if (!dateValue) {
      continue
    }
    const posted = parseDateString(dateValue, mapping.dateFormat, new Date())
    const amount = computeAmount(row, mapping)
    const name = row[mapping.descriptionColumn] ?? ''
    const memo = (mapping.memoColumn && row[mapping.memoColumn]) || ''
    const bankTransactionId = await hashTransactionId(bankAccountId, posted, amount, name)
    transactions.push({ posted, amount, name, memo, type: 'CSV', bankTransactionId })
  }
  return transactions
}
