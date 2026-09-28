import { Transaction, TransactionFilter } from '@/graphql/types'

export interface TransactionRowFilterOptions {
  categorized?: boolean
  categoryIds?: number[]
}

/**
 * The part of a transaction filter that applies to each row on its own, including split transactions.
 * Returns undefined when no row-level filter is active.
 */
export function buildTransactionRowFilter({
  categorized,
  categoryIds,
}: TransactionRowFilterOptions): TransactionFilter | undefined {
  if (categorized === false) {
    return { categoryId: { isNull: true }, transferCount: { equalTo: 0 } }
  }
  if (categoryIds && categoryIds.length > 0) {
    return { categoryId: { in: categoryIds } }
  }
  if (categorized === true) {
    return { categoryId: { isNull: false }, transferCount: { equalTo: 0 } }
  }
  return undefined
}

export function hasTransactionRowFilter(options: TransactionRowFilterOptions) {
  return buildTransactionRowFilter(options) !== undefined
}

/** Client-side mirror of buildTransactionRowFilter, used to highlight which rows of a split group matched. */
export function transactionMatchesRowFilter(
  transaction: Transaction,
  { categorized, categoryIds }: TransactionRowFilterOptions,
): boolean {
  const hasTransfer = !!transaction.transferByTransactionSourceId || !!transaction.transferByTransactionTargetId
  if (categorized === false) {
    return !transaction.categoryId && !hasTransfer
  }
  if (categoryIds && categoryIds.length > 0) {
    return !!transaction.categoryId && categoryIds.includes(transaction.categoryId)
  }
  if (categorized === true) {
    return !!transaction.categoryId && !hasTransfer
  }
  return true
}
