/**
 * Converts free text typed by a user into a Postgres `to_tsquery`-compatible
 * expression that prefix-matches every word, e.g. "coffee shop" -> "coffee:* & shop:*".
 * Returns an empty string if there are no searchable terms.
 */
export function buildTransactionSearchQuery(search: string): string {
  const terms = search
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)

  return terms.map((term) => `${term}:*`).join(' & ')
}
