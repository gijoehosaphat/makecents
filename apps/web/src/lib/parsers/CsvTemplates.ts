import { normalizeHeader, parseHeaders, parsePreview, parseRowDateAndAmount } from './Csv'

/** A saved template: how to read one file format, shared by every account that exports it. */
export interface CsvTemplate {
  id: number
  nodeId: string
  name: string
  fingerprint: string
  mapping: CsvColumnMapping
  /** The bank accounts this template has imported into. */
  bankAccountIds: number[]
}

/** A mapping saved before names and memos could join several columns. */
interface LegacyCsvColumnMapping {
  descriptionColumn?: string
  memoColumn?: string
}

/**
 * Reads a saved mapping, upgrading one saved in an older shape: a single `descriptionColumn` and
 * `memoColumn` become one-column `nameColumns` and `memoColumns`.
 */
export function normalizeSavedMapping(saved: unknown): CsvColumnMapping {
  const { descriptionColumn, memoColumn, ...mapping } = (saved ?? {}) as Partial<CsvColumnMapping> &
    LegacyCsvColumnMapping
  return {
    ...(mapping as CsvColumnMapping),
    nameColumns: Array.isArray(mapping.nameColumns)
      ? mapping.nameColumns
      : descriptionColumn
        ? [descriptionColumn]
        : [],
    memoColumns: Array.isArray(mapping.memoColumns) ? mapping.memoColumns : memoColumn ? [memoColumn] : [],
  }
}

type Layout = Pick<CsvColumnMapping, 'delimiter' | 'hasHeaderRow' | 'skipRows'>

const HEADERS_PREFIX = 'headers'
const COLUMNS_PREFIX = 'columns'
const SEPARATOR = '|'
// Header names a template's file and this file must share for this file to be the same format
// with a few columns added or dropped, rather than another format altogether.
const CHANGED_FORMAT_SIMILARITY = 0.6
// Rows checked when confirming a template without a header row reads this file.
const SAMPLE_ROWS = 20

function normalizedHeaders(headers: string[]): string[] {
  return Array.from(new Set(headers.map(normalizeHeader).filter(Boolean))).sort()
}

/**
 * Identifies a file format: its delimiter and its sorted header names, which ignore column order
 * and how names are written ("Account Number" and "account_number" are the same column). A file
 * without a header row has nothing to go on but its column count.
 */
export function fingerprintColumns(headers: string[], layout: Layout): string {
  return layout.hasHeaderRow
    ? [HEADERS_PREFIX, layout.delimiter, normalizedHeaders(headers).join(SEPARATOR)].join(':')
    : [COLUMNS_PREFIX, layout.delimiter, headers.length].join(':')
}

/** The fingerprint of a file read with the given settings. */
export function fingerprintFile(text: string, layout: Layout): string {
  return fingerprintColumns(parseHeaders(text, layout), layout)
}

/** The normalized header names a header fingerprint was made from. */
function fingerprintHeaders(fingerprint: string): string[] | undefined {
  const [prefix, delimiter, ...rest] = fingerprint.split(':')
  return prefix === HEADERS_PREFIX && delimiter !== undefined ? rest.join(':').split(SEPARATOR) : undefined
}

function fingerprintDelimiter(fingerprint: string): string | undefined {
  return fingerprint.split(':')[1]
}

/**
 * Whether a template without a header row really reads this file: a column count alone can't tell
 * two banks apart, so most of the first rows must give a date and an amount with its settings.
 */
function readsRows(text: string, mapping: CsvColumnMapping): boolean {
  const rows = parsePreview(text, mapping).rows.slice(0, SAMPLE_ROWS)
  const read = rows.filter((row) => parseRowDateAndAmount(row, mapping)).length
  return read > 0 && read >= rows.length / 2
}

/**
 * The templates made for exactly this file's format. Whether the file has a header row is up to
 * detection: a template without one never applies to a file that has one (its numbered columns
 * would otherwise fit any file with enough columns).
 */
export function findTemplatesForFile(
  text: string,
  templates: CsvTemplate[],
  detected: CsvColumnMapping,
): CsvTemplate[] {
  return templates.filter((template) => {
    const { mapping } = template
    if (!mapping.hasHeaderRow && detected.hasHeaderRow) {
      return false
    }
    if (fingerprintFile(text, mapping) !== template.fingerprint) {
      return false
    }
    return mapping.hasHeaderRow || readsRows(text, mapping)
  })
}

export interface ChangedFormat {
  template: CsvTemplate
  /** This file's columns the template's file didn't have, as this file names them. */
  added: string[]
  /** The template's file's columns this file doesn't have, normalized. */
  removed: string[]
}

/**
 * A template for an earlier version of this file's format, when its bank has since added or
 * dropped a few columns: the header template sharing the most header names with this file, if it
 * shares enough of them.
 */
export function findChangedFormat(
  text: string,
  templates: CsvTemplate[],
  detected: CsvColumnMapping,
): ChangedFormat | undefined {
  if (!detected.hasHeaderRow) {
    return undefined
  }
  const fileHeaders = parseHeaders(text, detected)
  const fileNames = new Set(normalizedHeaders(fileHeaders))
  let best: { template: CsvTemplate; similarity: number; names: Set<string> } | undefined
  for (const template of templates) {
    const names = fingerprintHeaders(template.fingerprint)
    if (!names || fingerprintDelimiter(template.fingerprint) !== detected.delimiter) {
      continue
    }
    const templateNames = new Set(names)
    const shared = [...templateNames].filter((name) => fileNames.has(name)).length
    const similarity = shared / new Set([...templateNames, ...fileNames]).size
    if (similarity >= CHANGED_FORMAT_SIMILARITY && similarity < 1 && (!best || similarity > best.similarity)) {
      best = { template, similarity, names: templateNames }
    }
  }
  if (!best) {
    return undefined
  }
  const { template, names } = best
  return {
    template,
    added: fileHeaders.filter((header) => !names.has(normalizeHeader(header))),
    removed: [...names].filter((name) => !fileNames.has(name)),
  }
}

/**
 * Reads a file whose format changed with the choices of the template made for its earlier
 * version: every column the template picked that the file still has stays picked (matched by
 * normalized name), and anything else comes from detection. New columns detection assigns to the
 * name or memo are added after the template's own.
 */
export function adaptTemplateToFile(
  saved: CsvColumnMapping,
  detected: CsvColumnMapping,
  headers: string[],
  added: string[],
): CsvColumnMapping {
  const byName = new Map(headers.map((header) => [normalizeHeader(header), header]))
  const find = (column: string | null | undefined) => (column ? byName.get(normalizeHeader(column)) : undefined)
  const keep = (columns: string[]) => columns.map(find).filter((column): column is string => !!column)
  const isNew = new Set(added)
  const merge = (savedColumns: string[], detectedColumns: string[]) => {
    const kept = keep(savedColumns)
    return kept.length
      ? [...kept, ...detectedColumns.filter((column) => isNew.has(column) && !kept.includes(column))]
      : detectedColumns
  }

  const dateColumn = find(saved.dateColumn)
  const timeColumn = saved.timeColumn === null ? null : find(saved.timeColumn)
  const accountColumn = saved.accountColumn === null ? null : find(saved.accountColumn)
  const keepsAmount =
    saved.amountMode === 'debitCredit'
      ? !!find(saved.debitColumn) && !!find(saved.creditColumn)
      : !!find(saved.amountColumn)

  return {
    delimiter: detected.delimiter,
    hasHeaderRow: detected.hasHeaderRow,
    skipRows: detected.skipRows,
    dateColumn: dateColumn ?? detected.dateColumn,
    dateFormat: dateColumn ? saved.dateFormat : detected.dateFormat,
    ...(timeColumn === null
      ? { timeColumn: null }
      : timeColumn
        ? { timeColumn, timeFormat: saved.timeFormat }
        : { timeColumn: detected.timeColumn, timeFormat: detected.timeFormat }),
    nameColumns: merge(saved.nameColumns, detected.nameColumns),
    // A template that chose no memo columns keeps none.
    memoColumns: saved.memoColumns.length ? merge(saved.memoColumns, detected.memoColumns) : [],
    accountColumn: accountColumn === null ? null : (accountColumn ?? detected.accountColumn),
    ...(keepsAmount
      ? {
          amountMode: saved.amountMode,
          amountColumn: find(saved.amountColumn),
          debitColumn: find(saved.debitColumn),
          creditColumn: find(saved.creditColumn),
        }
      : {
          amountMode: detected.amountMode,
          amountColumn: detected.amountColumn,
          debitColumn: detected.debitColumn,
          creditColumn: detected.creditColumn,
        }),
    amountSign: saved.amountSign,
  }
}

/**
 * Whether two mappings read rows' import ids from different columns. A CSV row's id is built from
 * its date, time, amount and name, so changing any of those columns gives already-imported rows
 * new ids.
 */
export function changesRowIds(before: CsvColumnMapping, after: CsvColumnMapping): boolean {
  const key = (mapping: CsvColumnMapping) =>
    JSON.stringify([
      normalizeHeader(mapping.dateColumn),
      normalizeHeader(mapping.timeColumn ?? ''),
      mapping.nameColumns.map(normalizeHeader),
      mapping.amountMode === 'debitCredit'
        ? [normalizeHeader(mapping.debitColumn ?? ''), normalizeHeader(mapping.creditColumn ?? '')]
        : normalizeHeader(mapping.amountColumn ?? ''),
    ])
  return key(before) !== key(after)
}

/** The column holding the bank's account identifier, if the mapping names one the file has. */
export function resolveAccountColumn(
  mapping: CsvColumnMapping,
  headers: string[],
  findByName: (headers: string[]) => string | undefined,
): string | undefined {
  if (mapping.accountColumn === null) {
    return undefined
  }
  if (mapping.accountColumn) {
    return headers.includes(mapping.accountColumn) ? mapping.accountColumn : undefined
  }
  return mapping.hasHeaderRow ? findByName(headers) : undefined
}
