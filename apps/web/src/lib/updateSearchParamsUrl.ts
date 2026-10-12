/**
 * Builds a URL for `pathname` from the current search params with the given changes applied.
 * A null/undefined/empty value removes the key. Values are always URL-encoded. `page` is dropped
 * unless it is explicitly set, because any other change invalidates the current page.
 */
export function updateSearchParamsUrl(
  pathname: string,
  current: { toString(): string } | null | undefined,
  changes: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams(current?.toString() ?? '')
  if (!('page' in changes)) {
    params.delete('page')
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
  }
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
