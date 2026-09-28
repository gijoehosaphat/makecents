import { Transaction } from '@/graphql/types'
import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import {
  GetTransactionsByBankAccountsVariables,
  GetFilteredTransactionsByBankAccountsDocument,
  GetFilteredTransactionsBySearchDocument,
} from '@/graphql/operations'
import { buildTransactionSearchQuery } from './buildTransactionSearchQuery'
import { buildTransactionRowFilter } from './transactionRowFilter'

export function useFilteredTransactions({
  limit,
  offset,
  dateFrom,
  dateTo,
  bankAccountIds,
  categorized,
  categoryIds,
  search,
}: {
  limit?: number
  offset?: number
  dateFrom?: Date
  dateTo?: Date
  bankAccountIds: number[]
  categorized?: boolean
  categoryIds?: number[]
  search?: string
}) {
  const match = useMemo(() => buildTransactionSearchQuery(search || ''), [search])

  const variables = useMemo(() => {
    let tempVariables: GetTransactionsByBankAccountsVariables = {
      filter: {
        bankAccountId: { in: bankAccountIds },
      },
    }

    if (limit !== undefined) {
      tempVariables.first = limit
    }

    if (offset !== undefined) {
      tempVariables.offset = offset
    }

    // Split transactions are always returned nested under their parent. A parent is included when it,
    // or any of its splits, matches the row-level filter.
    const rowFilter = buildTransactionRowFilter({ categorized, categoryIds })
    tempVariables.filter.splitSourceId = { isNull: true }
    if (rowFilter) {
      tempVariables.filter.or = [rowFilter, { transactionsBySplitSourceId: { some: rowFilter } }]
    }

    if (dateFrom !== undefined && dateTo !== undefined) {
      tempVariables.filter.posted = {
        greaterThanOrEqualTo: dateFrom,
        lessThan: dateTo,
      }
    }

    if (!match) {
      tempVariables.orderBy = 'POSTED_DESC'
    }

    return tempVariables
  }, [bankAccountIds, limit, offset, categorized, categoryIds, dateFrom, dateTo, match])

  const document = match ? GetFilteredTransactionsBySearchDocument : GetFilteredTransactionsByBankAccountsDocument
  const documentVariables = match ? { ...variables, match } : variables

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
