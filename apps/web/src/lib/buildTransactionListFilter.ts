import { TransactionFilter } from '@/graphql/types'
import { TransactionRowFilterOptions, buildTransactionRowFilter } from './transactionRowFilter'

export interface TransactionListFilterOptions extends TransactionRowFilterOptions {
  bankAccountIds: number[]
  dateFrom?: Date
  dateTo?: Date
}

/**
 * The filter for the list of top-level transactions. Split transactions are always returned nested under
 * their parent, so a parent is included when it, or any of its splits, matches the row-level filter.
 */
export function buildTransactionListFilter({
  bankAccountIds,
  dateFrom,
  dateTo,
  ...rowOptions
}: TransactionListFilterOptions): TransactionFilter {
  const filter: TransactionFilter = {
    bankAccountId: { in: bankAccountIds },
    splitSourceId: { isNull: true },
  }

  const rowFilter = buildTransactionRowFilter(rowOptions)
  if (rowFilter) {
    filter.or = [rowFilter, { transactionsBySplitSourceId: { some: rowFilter } }]
  }

  if (dateFrom !== undefined && dateTo !== undefined) {
    filter.posted = { greaterThanOrEqualTo: dateFrom, lessThan: dateTo }
  }

  return filter
}
