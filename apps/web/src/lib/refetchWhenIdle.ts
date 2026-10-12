import { InternalRefetchQueryDescriptor } from '@apollo/client'

let inFlight = 0

/**
 * Runs a save and counts it as in flight until it settles. Pair with `refetchWhenIdle`.
 *
 * Categorizing a row takes it out of the list being viewed (e.g. the uncategorized tab), so each save refetches
 * the list. When several rows are clicked quickly, a refetch that started before a later save landed returns the
 * older data, which overwrites that row back to "uncategorized" until the next refetch.
 */
export async function trackSave<T>(save: () => Promise<T>): Promise<T> {
  inFlight++
  try {
    return await save()
  } finally {
    inFlight--
  }
}

/**
 * For a mutation's `refetchQueries`: refetch only when this is the last save in flight, so one refetch,
 * started after everything has landed, brings the list up to date. Evaluated while the save still counts.
 */
export function refetchWhenIdle(refetch?: InternalRefetchQueryDescriptor) {
  return () => (refetch && inFlight <= 1 ? [refetch] : [])
}
