import { TransactionsOrderBy } from '@/graphql/types'

export type TransactionSort = 'posted_desc' | 'posted_asc' | 'amount_asc' | 'amount_desc'

export const DEFAULT_TRANSACTION_SORT: TransactionSort = 'posted_desc'

const SORTS: TransactionSort[] = ['posted_desc', 'posted_asc', 'amount_asc', 'amount_desc']

export function parseTransactionSort(value: string | null | undefined): TransactionSort {
  return SORTS.find((sort) => sort === value) ?? DEFAULT_TRANSACTION_SORT
}

/** Ties are broken by id so pagination stays stable. `amount_asc` puts the largest withdrawals first. */
export function transactionSortToOrderBy(sort: TransactionSort): TransactionsOrderBy[] {
  switch (sort) {
    case 'posted_asc':
      return ['POSTED_ASC', 'ID_ASC']
    case 'amount_asc':
      return ['AMOUNT_ASC', 'POSTED_DESC', 'ID_DESC']
    case 'amount_desc':
      return ['AMOUNT_DESC', 'POSTED_DESC', 'ID_DESC']
    default:
      return ['POSTED_DESC', 'ID_DESC']
  }
}
