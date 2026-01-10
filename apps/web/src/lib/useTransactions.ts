import { BankAccount, Query, Transaction, UpdateTransactionInput } from '@/graphql/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useSuspenseQuery } from '@apollo/client/react'
import {
  GetTransactionsByBankAccountsDocument,
  UpdateTransactionDocument,
  CreateTransactionDocument,
  DeleteTransactionDocument,
  GetTransactionsByBankAccountsVariables,
} from '@/graphql/operations'

export function useTransactions({
  limit,
  offset,
  dateFrom,
  dateTo,
  bankAccountIds,
  excludeSplitTransactions,
  isCategoryNull,
}: {
  limit?: number
  offset?: number
  dateFrom?: Date
  dateTo?: Date
  bankAccountIds: number[]
  excludeSplitTransactions?: boolean
  isCategoryNull?: boolean
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

    // if (excludeSplitTransactions !== undefined || excludeSplitTransactions !== false) {
    //   tempVariables.filter.splitSourceId = { isNull: excludeSplitTransactions }
    // }

    if (isCategoryNull !== undefined) {
      tempVariables.filter.categoryId = { isNull: isCategoryNull }
    }

    if (dateFrom !== undefined && dateTo !== undefined) {
      tempVariables.filter.posted = {
        greaterThanOrEqualTo: dateFrom,
        lessThan: dateTo,
      }
    }

    tempVariables.orderBy = 'POSTED_DESC'

    return tempVariables
  }, [bankAccountIds, limit, offset, /*excludeSplitTransactions,*/ isCategoryNull, dateFrom, dateTo])

  const query = useSuspenseQuery(GetTransactionsByBankAccountsDocument, {
    variables,
  })

  const [updateTransaction] = useMutation(UpdateTransactionDocument, {
    refetchQueries: [
      {
        query: GetTransactionsByBankAccountsDocument,
        variables,
      },
    ],
  })

  const [createTransaction] = useMutation(CreateTransactionDocument, {
    refetchQueries: [
      {
        query: GetTransactionsByBankAccountsDocument,
        variables,
      },
    ],
  })

  const [deleteTransaction] = useMutation(DeleteTransactionDocument, {
    refetchQueries: [
      {
        query: GetTransactionsByBankAccountsDocument,
        variables,
      },
    ],
  })

  const transactions: Transaction[] = useMemo(() => {
    return (query?.data?.allTransactions?.nodes as Transaction[]) || []
  }, [query?.data?.allTransactions?.nodes])

  const transactionsSansTransfers = useMemo(() => {
    return transactions.filter(
      (transaction) => !transaction.transferByTransactionSourceId && !transaction.transferByTransactionTargetId
    )
  }, [transactions])

  const totalCount = useMemo(() => {
    return query?.data?.allTransactions?.totalCount || 0
  }, [query?.data?.allTransactions?.totalCount])

  return {
    variables,
    transactions,
    transactionsSansTransfers,
    totalCount,
    updateTransaction,
    createTransaction,
    deleteTransaction,
  }
}
