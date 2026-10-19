import { Transaction } from '@/graphql/types'
import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import {
  GetTransactionsByBankAccountsVariables,
  GetFilteredTransactionsByBankAccountsDocument,
  GetFilteredTransactionsBySearchDocument,
} from '@/graphql/operations'
import { buildTransactionSearchQuery } from './buildTransactionSearchQuery'
import { buildTransactionListFilter } from './buildTransactionListFilter'
import { TransactionDirection } from './transactionRowFilter'
import { DEFAULT_TRANSACTION_SORT, TransactionSort, transactionSortToOrderBy } from './transactionSort'

export interface FilteredTransactionsParams {
  limit?: number
  offset?: number
  dateFrom?: Date
  dateTo?: Date
  bankAccountIds: number[]
  categorized?: boolean
  categoryIds?: number[]
  autoCategorized?: boolean
  direction?: TransactionDirection
  amount?: number
  search?: string
  sort?: TransactionSort
}

/**
 * The document and variables for the transaction list. Text search results are always newest first (the
 * search function orders them itself and takes no orderBy), so `sort` only applies without a search.
 */
export function buildFilteredTransactionsRequest({
  limit,
  offset,
  dateFrom,
  dateTo,
  bankAccountIds,
  categorized,
  categoryIds,
  autoCategorized,
  direction,
  amount,
  search,
  sort = DEFAULT_TRANSACTION_SORT,
}: FilteredTransactionsParams) {
  const match = buildTransactionSearchQuery(search || '')

  const variables: GetTransactionsByBankAccountsVariables = {
    filter: buildTransactionListFilter({
      bankAccountIds,
      dateFrom,
      dateTo,
      categorized,
      categoryIds,
      autoCategorized,
      direction,
      amount,
    }),
  }

  if (limit !== undefined) {
    variables.first = limit
  }

  if (offset !== undefined) {
    variables.offset = offset
  }

  if (!match) {
    variables.orderBy = transactionSortToOrderBy(sort)
  }

  return {
    match,
    document: match ? GetFilteredTransactionsBySearchDocument : GetFilteredTransactionsByBankAccountsDocument,
    variables: match ? { ...variables, match } : variables,
  }
}

export function useFilteredTransactions({
  limit,
  offset,
  dateFrom,
  dateTo,
  bankAccountIds,
  categorized,
  categoryIds,
  autoCategorized,
  direction,
  amount,
  search,
  sort,
}: FilteredTransactionsParams) {
  const {
    match,
    document,
    variables: documentVariables,
  } = useMemo(
    () =>
      buildFilteredTransactionsRequest({
        limit,
        offset,
        dateFrom,
        dateTo,
        bankAccountIds,
        categorized,
        categoryIds,
        autoCategorized,
        direction,
        amount,
        search,
        sort,
      }),
    [
      limit,
      offset,
      dateFrom,
      dateTo,
      bankAccountIds,
      categorized,
      categoryIds,
      autoCategorized,
      direction,
      amount,
      search,
      sort,
    ],
  )

  const query = useSuspenseQuery(document as any, {
    variables: documentVariables as any,
  })

  const data = query?.data as {
    transactionSearch?: { nodes: Transaction[]; totalCount: number } | null
    allTransactions?: { nodes: Transaction[]; totalCount: number } | null
  }

  const connection = match ? data?.transactionSearch : data?.allTransactions

  const transactions: Transaction[] = useMemo(() => {
    return (connection?.nodes as Transaction[]) || []
  }, [connection?.nodes])

  const totalCount = useMemo(() => {
    return connection?.totalCount || 0
  }, [connection?.totalCount])

  return {
    transactions,
    totalCount,
    refetchQuery: {
      query: document,
      variables: documentVariables,
    },
  }
}
