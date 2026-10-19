import { Transaction, TransactionFilter } from '@/graphql/types'

export type TransactionDirection = 'withdrawals' | 'deposits'

export interface TransactionRowFilterOptions {
  categorized?: boolean
  categoryIds?: number[]
  /** Only transactions an import categorized automatically, for reviewing them. */
  autoCategorized?: boolean
  /** Only withdrawals (negative amounts) or only deposits (positive amounts). */
  direction?: TransactionDirection
  /** The exact absolute amount, in cents: a withdrawal or deposit of this much. */
  amount?: number
}

function buildCategoryFilter({ categorized, categoryIds }: TransactionRowFilterOptions): TransactionFilter | undefined {
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

function buildAutoFilter({ autoCategorized }: TransactionRowFilterOptions): TransactionFilter | undefined {
  return autoCategorized ? { categorySource: { equalTo: 'auto' } } : undefined
}

function buildAmountFilter({ direction, amount }: TransactionRowFilterOptions): TransactionFilter | undefined {
  if (amount === undefined) {
    if (direction === 'deposits') {
      return { amount: { greaterThan: '0' } }
    }
    if (direction === 'withdrawals') {
      return { amount: { lessThan: '0' } }
    }
    return undefined
  }

  if (direction === 'deposits') {
    return { amount: { equalTo: String(amount) } }
  }
  if (direction === 'withdrawals') {
    return { amount: { equalTo: String(-amount) } }
  }
  return { amount: { in: [String(amount), String(-amount)] } }
}

/**
 * The part of a transaction filter that applies to each row on its own, including split transactions.
 * Returns undefined when no row-level filter is active.
 */
export function buildTransactionRowFilter(options: TransactionRowFilterOptions): TransactionFilter | undefined {
  const parts = [buildCategoryFilter(options), buildAutoFilter(options), buildAmountFilter(options)].filter(
    (part): part is TransactionFilter => part !== undefined,
  )
  if (parts.length === 0) {
    return undefined
  }
  return parts.length === 1 ? parts[0] : { and: parts }
}

export function hasTransactionRowFilter(options: TransactionRowFilterOptions) {
  return buildTransactionRowFilter(options) !== undefined
}

function matchesCategoryFilter(transaction: Transaction, { categorized, categoryIds }: TransactionRowFilterOptions) {
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

function matchesAutoFilter(transaction: Transaction, { autoCategorized }: TransactionRowFilterOptions) {
  return !autoCategorized || transaction.categorySource === 'auto'
}

function matchesAmountFilter(transaction: Transaction, { direction, amount: wanted }: TransactionRowFilterOptions) {
  const amount = Number(transaction.amount || 0)
  if (direction === 'deposits' && amount <= 0) {
    return false
  }
  if (direction === 'withdrawals' && amount >= 0) {
    return false
  }
  return wanted === undefined || Math.abs(amount) === wanted
}

/** Client-side mirror of buildTransactionRowFilter, used to highlight which rows of a split group matched. */
export function transactionMatchesRowFilter(transaction: Transaction, options: TransactionRowFilterOptions): boolean {
  return (
    matchesCategoryFilter(transaction, options) &&
    matchesAutoFilter(transaction, options) &&
    matchesAmountFilter(transaction, options)
  )
}
