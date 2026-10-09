import Papa from 'papaparse'
import { isValid, parse as parseDateString } from 'date-fns'
import { computeAmount, hasAmountColumns, normalizeHeader } from './Csv'

// Tried in order, so US month-first wins when a column's dates are ambiguous (all days <= 12).
const DATE_FORMATS = [
  'M/d/yyyy',
  'M/d/yy',
  'yyyy-MM-dd',
  'yyyy/MM/dd',
  'M-d-yyyy',
  'M-d-yy',
  'd/M/yyyy',
  'd/M/yy',
  'd.M.yyyy',
  'yyyyMMdd',
  'd-MMM-yyyy',
  'd-MMM-yy',
  'd MMM yyyy',
  'MMM d, yyyy',
  "yyyy-MM-dd'T'HH:mm:ss",
  'yyyy-MM-dd HH:mm:ss',
  'M/d/yyyy h:mm:ss a',
]

// How many leading lines to search for the header/first transaction (banks like Bank of
// America put an account summary above the transactions).
const MAX_PREAMBLE_LINES = 40
const SAMPLE_ROWS = 200

// Banks whose sign convention the generic "most rows are spending" rule could get wrong on an
// unusual file (e.g. a statement that's mostly refunds). Matched on normalized header names.
const PRESETS: { matches: (headers: Set<string>) => boolean; overrides: Partial<CsvColumnMapping> }[] = [
  // American Express lists charges as positive amounts.
  {
    matches: (headers) =>
      headers.has('amount') &&
      (headers.has('cardmember') || headers.has('appearsonyourstatementas') || headers.has('extendeddetails')),
    overrides: { amountSign: 'flipped' },
  },
  // Discover ("Trans. Date", "Post Date", "Description", "Amount", "Category") does too.
  {
    matches: (headers) => headers.has('transdate') && headers.has('postdate') && headers.has('amount'),
    overrides: { amountSign: 'flipped' },
  },
]

export interface DetectedMapping {
  mapping: CsvColumnMapping
  /** False when we couldn't find a date, description and amount, so the user has to pick them. */
  isComplete: boolean
}

function isPlausibleDate(date: Date): boolean {
  const year = date.getFullYear()
  return isValid(date) && year >= 1990 && year <= new Date().getFullYear() + 1
}

function parsesAsDate(value: string, format: string): boolean {
  return isPlausibleDate(parseDateString(value, format, new Date()))
}

function isNumeric(value: string): boolean {
  const cleaned = value.trim().replace(/[()$,\s]/g, '')
  return /^[-+]?\d*\.?\d+$/.test(cleaned)
}

function looksLikeDate(value: string): boolean {
  const trimmed = value.trim()
  return !!trimmed && DATE_FORMATS.some((format) => parsesAsDate(trimmed, format))
}

function isDataRow(row: string[]): boolean {
  const dateIndex = row.findIndex(looksLikeDate)
  return dateIndex !== -1 && row.some((cell, index) => index !== dateIndex && !!cell.trim() && isNumeric(cell))
}

/** The single format every non-empty value in the column parses with, if there is one. */
function detectDateFormat(values: string[]): string | undefined {
  const present = values.map((value) => value.trim()).filter(Boolean)
  if (!present.length) {
    return undefined
  }
  return DATE_FORMATS.find((format) => present.every((value) => parsesAsDate(value, format)))
}

function findHeader(headers: string[], patterns: RegExp[], exclude: Set<string>): string | undefined {
  for (const pattern of patterns) {
    const match = headers.find((header) => !exclude.has(header) && pattern.test(normalizeHeader(header)))
    if (match) {
      return match
    }
  }
  return undefined
}

/**
 * Works out how to read a bank's CSV without asking: delimiter, how many summary lines to skip,
 * whether there's a header row, and which columns hold the date, description, memo and amount.
 * The amount sign is chosen so that spending (the majority of rows on any account) is negative.
 */
export function detectMapping(text: string): DetectedMapping {
  const delimiter = Papa.parse<string[]>(text, { preview: MAX_PREAMBLE_LINES }).meta.delimiter || ','
  // Empty lines are kept so row indexes line up with the line numbers skipRows counts.
  const lines = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false, preview: MAX_PREAMBLE_LINES + SAMPLE_ROWS })
    .data

  const firstDataIndex = lines.findIndex(
    (row, index) => index < MAX_PREAMBLE_LINES && isDataRow(row) && (!lines[index + 1] || lines[index + 1].length < 2 || isDataRow(lines[index + 1]))
  )
  if (firstDataIndex === -1) {
    return {
      mapping: {
        delimiter,
        hasHeaderRow: true,
        skipRows: 0,
        dateColumn: '',
        dateFormat: 'MM/dd/yyyy',
        descriptionColumn: '',
        amountMode: 'single',
        amountSign: 'asIs',
      },
      isComplete: false,
    }
  }

  const columnCount = lines[firstDataIndex].length
  const headerCandidate = lines[firstDataIndex - 1]
  const hasHeaderRow =
    !!headerCandidate &&
    // Chase checking ends every transaction row with a trailing comma, one more cell than its header.
    Math.abs(headerCandidate.length - columnCount) <= 1 &&
    !headerCandidate.some(looksLikeDate) &&
    headerCandidate.some((cell) => !!cell.trim() && !isNumeric(cell))
  const skipRows = hasHeaderRow ? firstDataIndex - 1 : firstDataIndex
  const headers = hasHeaderRow ? headerCandidate : Array.from({ length: columnCount }, (_, index) => String(index))

  const dataRows = lines
    .slice(firstDataIndex, firstDataIndex + SAMPLE_ROWS)
    .filter((row) => row.length >= 2)
  const columnValues = (index: number) => dataRows.map((row) => row[index] ?? '')

  // Date: a column whose values all parse with one format, preferring the posted date (what OFX
  // exports use) over a transaction date when a bank provides both.
  const dateColumns = headers
    .map((header, index) => ({ header, index, format: detectDateFormat(columnValues(index)) }))
    .filter((column): column is { header: string; index: number; format: string } => !!column.format)
  const datePreference = (header: string) => {
    const normalized = normalizeHeader(header)
    return normalized.includes('post') ? 3 : normalized === 'date' ? 2 : normalized.includes('date') ? 1 : 0
  }
  const dateColumn = dateColumns.sort((a, b) => datePreference(b.header) - datePreference(a.header))[0]
  const used = new Set<string>(dateColumn ? [dateColumn.header] : [])

  const numericHeaders = headers.filter((header, index) => {
    const present = columnValues(index).filter((value) => value.trim())
    return !used.has(header) && present.length > 0 && present.every(isNumeric)
  })
  // Never mistake a running balance, check number or reference for the amount.
  const notAmount = /bal|check|slip|ref|number|^no$|card|account|acct/
  const amountCandidates = numericHeaders.filter((header) => !hasHeaderRow || !notAmount.test(normalizeHeader(header)))

  let amountMode: CsvAmountMode = 'single'
  let amountColumn = hasHeaderRow ? findHeader(amountCandidates, [/^amount$/, /amount/], used) : undefined
  let debitColumn: string | undefined
  let creditColumn: string | undefined
  if (!amountColumn && hasHeaderRow) {
    debitColumn = findHeader(headers, [/debit/, /withdraw/, /moneyout/, /charge/], used)
    creditColumn = findHeader(headers, [/credit/, /deposit/, /moneyin/, /payment/], used)
    if (debitColumn && creditColumn) {
      amountMode = 'debitCredit'
    } else {
      debitColumn = creditColumn = undefined
    }
  }
  if (!amountColumn && amountMode === 'single') {
    amountColumn = amountCandidates[0]
  }
  for (const column of [amountColumn, debitColumn, creditColumn]) {
    if (column) {
      used.add(column)
    }
  }

  const textHeaders = headers.filter((header) => !used.has(header) && !numericHeaders.includes(header))
  const averageLength = (header: string) => {
    const values = columnValues(headers.indexOf(header))
    return values.reduce((sum, value) => sum + value.trim().length, 0) / Math.max(values.length, 1)
  }
  const descriptionColumn =
    (hasHeaderRow
      ? findHeader(textHeaders, [/^description$/, /description/, /payee/, /^name$/, /merchant/, /narrative/, /details/], used)
      : undefined) ?? [...textHeaders].sort((a, b) => averageLength(b) - averageLength(a))[0]
  if (descriptionColumn) {
    used.add(descriptionColumn)
  }
  const memoColumn = hasHeaderRow ? findHeader(textHeaders, [/^memo$/, /memo/, /^notes?$/], used) : undefined

  const mapping: CsvColumnMapping = {
    delimiter,
    hasHeaderRow,
    skipRows,
    dateColumn: dateColumn?.header ?? '',
    dateFormat: dateColumn?.format ?? 'MM/dd/yyyy',
    descriptionColumn: descriptionColumn ?? '',
    memoColumn,
    amountMode,
    amountColumn,
    debitColumn,
    creditColumn,
    amountSign: 'asIs',
  }

  const normalizedHeaders = new Set(headers.map(normalizeHeader))
  const preset = PRESETS.find((candidate) => candidate.matches(normalizedHeaders))
  if (preset) {
    Object.assign(mapping, preset.overrides)
  } else {
    // A file that's mostly positive is either a card listing charges as positive or an account
    // that mostly receives money (savings, a kid's account). Only the card also shows its
    // payments ("PAYMENT - THANK YOU") as negative, so flip only when both are true.
    const records = dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])))
    const rows = records
      .map((record) => ({ amount: computeAmount(record, mapping), description: record[mapping.descriptionColumn] ?? '' }))
      .filter((row) => row.amount !== 0)
    const positiveShare = rows.filter((row) => row.amount > 0).length / Math.max(rows.length, 1)
    const hasNegativePayment = rows.some((row) => row.amount < 0 && /payment|thank you|autopay/i.test(row.description))
    if (positiveShare > 0.6 && hasNegativePayment) {
      mapping.amountSign = 'flipped'
    }
  }

  return { mapping, isComplete: !!dateColumn && !!descriptionColumn && hasAmountColumns(mapping) }
}
