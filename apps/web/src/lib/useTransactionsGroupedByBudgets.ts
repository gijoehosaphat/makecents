import { useAppContext } from '@/components/context/AppContextProvider'
import { Budget, Transaction } from '@/graphql/types'
import { skipToken, useSuspenseQuery } from '@apollo/client/react'
import { useMemo } from 'react'
import { GetTransactionsGroupedByBudgetDocument } from '@/graphql/operations'

export function useTransactionsGroupedByBudgets() {
  const { currentAccountId } = useAppContext()

  // The context fills in after mount; without an account there is nothing to ask for.
  const query = useSuspenseQuery(
    GetTransactionsGroupedByBudgetDocument,
    currentAccountId ? { variables: { accountId: currentAccountId } } : skipToken,
  )

  const budgets: Budget[] = useMemo(() => {
    return (query.data?.allBudgets?.nodes as Budget[]) || []
  }, [query.data?.allBudgets?.nodes])

  const transactionsGroupedByBudget = useMemo(() => {
    return budgets.map((budget) => {
      const transactions: Transaction[] = []
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
