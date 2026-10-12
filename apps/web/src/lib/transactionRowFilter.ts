import { Transaction, TransactionFilter } from '@/graphql/types'

export type TransactionDirection = 'withdrawals' | 'deposits'

export interface TransactionRowFilterOptions {
  categorized?: boolean
  categoryIds?: number[]
  /** Only withdrawals (negative amounts) or only deposits (positive amounts). */
  direction?: TransactionDirection
  /** Bounds on the absolute amount, in cents. */
  amountMin?: number
  amountMax?: number
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

function buildAmountFilter({ direction, amountMin, amountMax }: TransactionRowFilterOptions): TransactionFilter | undefined {
  const hasBounds = amountMin !== undefined || amountMax !== undefined
  if (!direction && !hasBounds) {
    return undefined
  }

  const deposit: TransactionFilter = {
    amount: {
      ...(amountMin !== undefined ? { greaterThanOrEqualTo: String(amountMin) } : { greaterThan: '0' }),
      ...(amountMax !== undefined ? { lessThanOrEqualTo: String(amountMax) } : {}),
    },
  }
  const withdrawal: TransactionFilter = {
    amount: {
      ...(amountMin !== undefined ? { lessThanOrEqualTo: String(-amountMin) } : { lessThan: '0' }),
      ...(amountMax !== undefined ? { greaterThanOrEqualTo: String(-amountMax) } : {}),
    },
  }

  if (direction === 'deposits') {
    return deposit
  }
  if (direction === 'withdrawals') {
    return withdrawal
  }
  return { or: [deposit, withdrawal] }
}

/**
 * The part of a transaction filter that applies to each row on its own, including split transactions.
 * Returns undefined when no row-level filter is active.
 */
export function buildTransactionRowFilter(options: TransactionRowFilterOptions): TransactionFilter | undefined {
  const parts = [buildCategoryFilter(options), buildAmountFilter(options)].filter(
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

function matchesAmountFilter(
  transaction: Transaction,
  { direction, amountMin, amountMax }: TransactionRowFilterOptions,
) {
  const amount = Number(transaction.amount || 0)
  if (direction === 'deposits' && amount <= 0) {
    return false
  }
  if (direction === 'withdrawals' && amount >= 0) {
    return false
  }
  if (!direction && amountMin === undefined && amountMax === undefined) {
    return true
  }
  if (amount === 0) {
    return false
  }
  const absolute = Math.abs(amount)
  return (amountMin === undefined || absolute >= amountMin) && (amountMax === undefined || absolute <= amountMax)
}

/** Client-side mirror of buildTransactionRowFilter, used to highlight which rows of a split group matched. */
export function transactionMatchesRowFilter(transaction: Transaction, options: TransactionRowFilterOptions): boolean {
  return matchesCategoryFilter(transaction, options) && matchesAmountFilter(transaction, options)
}
