import { Transaction } from '@/graphql/types'
import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import {
  GetTransactionsByBankAccountsVariables,
  GetFilteredTransactionsByBankAccountsDocument,
  GetFilteredTransactionsBySearchDocument,
} from '@/graphql/operations'
import { buildTransactionSearchQuery } from './buildTransactionSearchQuery'

export function useFilteredTransactions({
  limit,
  offset,
  dateFrom,
  dateTo,
  bankAccountIds,
  excludeSplitTransactions,
  categorized,
  categoryIds,
  search,
}: {
  limit?: number
  offset?: number
  dateFrom?: Date
  dateTo?: Date
  bankAccountIds: number[]
  excludeSplitTransactions?: boolean
  categorized?: boolean
  categoryIds?: number[]
  search?: string
}) {
  const hasCategoryIds = !!categoryIds && categoryIds.length > 0
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

    if (categorized === false) {
      tempVariables.filter.categoryId = { isNull: true }
      tempVariables.filter.transferCount = { equalTo: 0 }
    } else if (hasCategoryIds) {
      tempVariables.filter.categoryId = { in: categoryIds }
    } else if (categorized === true) {
      tempVariables.filter.categoryId = { isNull: false }
      tempVariables.filter.transferCount = { equalTo: 0 }
    }

    if (!hasCategoryIds) {
      if (excludeSplitTransactions !== undefined) {
        tempVariables.filter.splitSourceId = { isNull: excludeSplitTransactions }
      }
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
  }, [bankAccountIds, limit, offset, excludeSplitTransactions, categorized, categoryIds, hasCategoryIds, dateFrom, dateTo, match])

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
