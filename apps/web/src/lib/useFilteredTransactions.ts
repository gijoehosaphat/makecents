import { Transaction } from '@/graphql/types'
import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import {
  GetTransactionsByBankAccountsVariables,
  GetFilteredTransactionsByBankAccountsDocument,
} from '@/graphql/operations'

export function useFilteredTransactions({
  limit,
  offset,
  dateFrom,
  dateTo,
  bankAccountIds,
  excludeSplitTransactions,
  categorized,
  category,
}: {
  limit?: number
  offset?: number
  dateFrom?: Date
  dateTo?: Date
  bankAccountIds: number[]
  excludeSplitTransactions?: boolean
  categorized?: boolean
  category?: number
}) {
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

    if (categorized !== undefined) {
      tempVariables.filter.categoryId = { isNull: !categorized }
      tempVariables.filter.transferCount = { equalTo: 0 }
    } else if (category !== undefined) {
      tempVariables.filter.categoryId = { in: [category] }
    }

    if (category === undefined) {
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

    tempVariables.orderBy = 'POSTED_DESC'

    return tempVariables
  }, [bankAccountIds, limit, offset, excludeSplitTransactions, categorized, category, dateFrom, dateTo])

  const query = useSuspenseQuery(GetFilteredTransactionsByBankAccountsDocument, {
    variables,
  })

  const transactions: Transaction[] = useMemo(() => {
    return (query?.data?.allTransactions?.nodes as Transaction[]) || []
  }, [query?.data?.allTransactions?.nodes])

  const totalCount = useMemo(() => {
    return query?.data?.allTransactions?.totalCount || 0
  }, [query?.data?.allTransactions?.totalCount])

  return {
    transactions,
    totalCount,
    refetchQuery: {
      query: GetFilteredTransactionsByBankAccountsDocument,
      variables,
    },
  }
}
