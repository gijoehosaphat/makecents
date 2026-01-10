'use client'

import { Transaction, Category } from '@/graphql/types'
import { useLazyQuery } from '@apollo/client/react'
import { useEffect, useMemo } from 'react'
import { SpendingPieChart } from './SpendingPieChart'
import { CategorySpendingBarChart } from './CategorySpendingBarChart'
import { Box } from '@mui/material'
import { DailySpendingLineChart } from './DailySpendingLineChart'
import { useAppContext } from '../context/AppContextProvider'
import { useTransactions } from '@/lib/useTransactions'
import { GetCategoriesDocument } from '@/graphql/operations'

interface TransactionsByCategory {
  category: Category
  transactions: Transaction[]
}

export function TransactionsByCategory({ dateFrom, dateTo }: { dateFrom: Date; dateTo: Date }) {
  const { user, bankAccounts } = useAppContext()
  const { transactions, transactionsSansTransfers } = useTransactions({
    limit: 1000, //TODO: Optional non-paginated way?
    offset: 0,
    bankAccountIds: bankAccounts.map((bankAccount) => bankAccount.id),
    dateFrom,
    dateTo,
  })
  const [getCategories, getCategoriesResults] = useLazyQuery(GetCategoriesDocument)

  useEffect(() => {
    if (user?.id) {
      getCategories({
        variables: {
          userId: user?.id,
        },
      })
    }
  }, [getCategories, user?.id])

  const categories: Category[] = useMemo(() => {
    return (getCategoriesResults?.data?.allCategories?.nodes as Category[]) || []
  }, [getCategoriesResults?.data?.allCategories?.nodes])

  const transactionsByCategory: TransactionsByCategory[] = useMemo(() => {
    return categories?.map((category) => {
      return {
        category,
        transactions: transactions.filter((t) => t.categoryId === category.id),
      }
    })
  }, [categories, transactions])

  const totalSpendPerCategory = useMemo(() => {
    return transactionsByCategory.map((tbc) => {
      return {
        label: tbc.category.name || '',
        value: tbc.transactions.reduce((partialSum, t) => partialSum + Number(t.amount), 0),
      }
    })
  }, [transactionsByCategory])

  // const transactionsSansTransfers = useMemo(() => {
  //   return transactions.filter(
  //     (transaction) => !transaction.transferByTransactionSourceId && !transaction.transferByTransactionTargetId
  //   )
  // }, [transactions])

  return (
    <Box mt={4}>
      <DailySpendingLineChart />
      <CategorySpendingBarChart />
      <SpendingPieChart data={totalSpendPerCategory} />
    </Box>
  )
}
