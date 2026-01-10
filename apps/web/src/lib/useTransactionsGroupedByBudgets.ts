import { useAppContext } from '@/components/context/AppContextProvider'
import { Budget, Transaction } from '@/graphql/types'
import { useSuspenseQuery } from '@apollo/client/react'
import { useMemo } from 'react'
import { GetTransactionsGroupedByBudgetDocument } from '@/graphql/operations'

export function useTransactionsGroupedByBudgets() {
  const { user } = useAppContext()

  const query = useSuspenseQuery(GetTransactionsGroupedByBudgetDocument, {
    variables: {
      userId: user?.id || 0, //TODO Fix this
    },
  })

  const budgets: Budget[] = useMemo(() => {
    return (query.data.allBudgets?.nodes as Budget[]) || []
  }, [query.data.allBudgets?.nodes])

  const transactionsGroupedByBudget = useMemo(() => {
    return budgets.map((budget) => {
      let transactions: Transaction[] = []
      budget?.budgetCategoriesByBudgetId?.nodes.forEach((budgetCategory) => {
        budgetCategory?.categoryByCategoryId?.transactionsByCategoryId?.nodes?.forEach((transaction) => {
          transactions.push(transaction)
        })
      })
      return {
        budget,
        transactions: transactions.sort((a, b) => {
          if (a.posted > b.posted) return -1
          if (a.posted < b.posted) return 1
          return 0
        }),
      }
    })
  }, [budgets])

  return {
    budgets,
    transactionsGroupedByBudget,
  }
}
