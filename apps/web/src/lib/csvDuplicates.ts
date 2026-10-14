export interface ImportRow {
  posted: Date
  amount: number
  name?: string | null
  bankTransactionId: string
}

export interface ExistingRow extends Omit<ImportRow, 'bankTransactionId'> {
  bankTransactionId?: string | null
}

/**
 * How many of a file's rows the bank account already has, the way import_transactions decides it
 * (apps/api/db/migrations/20261012160000_import-duplicate-detection.ts). Keep the two in sync.
 *
 * A row is a duplicate when its id is already stored. Rows with a new id still count as duplicates
 * when the account holds rows with the same date and amount whose ids the file doesn't carry (the
 * bank re-issued the id or renamed the payee), paired off one-to-one, same names first.
 */
export function countDuplicateRows(incoming: ImportRow[], existing: ExistingRow[]): number {
  const existingIds = new Set(existing.map((row) => row.bankTransactionId ?? ''))
  const incomingIds = new Set(incoming.map((row) => row.bankTransactionId))
  const fresh = incoming.filter((row) => !existingIds.has(row.bankTransactionId))
  let duplicates = incoming.length - fresh.length

  const keyOf = (row: Pick<ImportRow, 'posted' | 'amount'>) => `${row.posted.getTime()}|${row.amount}`
  const freshByKey = groupBy(fresh, keyOf)
  const unmatchedByKey = groupBy(
    existing.filter((row) => !incomingIds.has(row.bankTransactionId ?? '')),
    keyOf,
  )

  for (const [key, freshRows] of freshByKey) {
    const unmatchedRows = unmatchedByKey.get(key) ?? []
    if (!unmatchedRows.length) {
      continue
    }
    const unmatchedNames = countBy(unmatchedRows, (row) => row.name ?? '')
    const freshNames = countBy(freshRows, (row) => row.name ?? '')
    let paired = 0
    for (const [name, count] of freshNames) {
      paired += Math.min(count, unmatchedNames.get(name) ?? 0)
    }
    const leftover = Math.min(freshRows.length - paired, unmatchedRows.length - paired)
    duplicates += paired + leftover
  }
  return duplicates
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return groups
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1)
  }
  return counts
}
