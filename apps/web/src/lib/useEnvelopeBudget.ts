import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import { useAppContext } from '@/components/context/AppContextProvider'
import { GetEnvelopeBudgetDocument } from '@/graphql/operations'
import { Budget } from '@/graphql/types'
import {
  EnvelopeBudgetMonth,
  EnvelopeMonth,
  MonthKey,
  addMonths,
  envelopeMonths,
  startingReadyToAssign,
} from '@/lib/budgetMath'

export interface EnvelopeBudgetRow extends EnvelopeBudgetMonth {
  budget: Budget
  categoryIds: number[]
}

/**
 * The envelope budget for `month`: every budget's carryover, assigned, activity and available money, Ready to Assign,
 * and the previous month's assignments (for copying them forward). Months before the account's start month have
 * nothing to show, so `month` is null for them.
 */
export function useEnvelopeBudget(selectedMonth: MonthKey) {
  const { currentAccountId } = useAppContext()
  const accountId = Number(currentAccountId)
  // Every figure here is derived from transactions and budgets that other pages change (categorizing, importing,
  // editing budgets), so a cached copy is shown at once and refreshed from the server each time the page opens.
  // Transactions are imported at local midnight, so months are the browser's local months, as in the date filters.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const query = useSuspenseQuery(GetEnvelopeBudgetDocument, {
    variables: { accountId, throughMonth: selectedMonth, timeZone },
    fetchPolicy: 'cache-and-network',
  })
  const { data } = query

  const startMonth: MonthKey = data.accountById?.envelopeStartMonth ?? selectedMonth

  const result = useMemo(() => {
    const budgets = [...((data.allBudgets?.nodes ?? []) as Budget[])].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? ''),
    )
    const cashOnHand = data.accountById?.envelopeCashOnHand ?? null
    const startingBalance = startingReadyToAssign({
      cashOnHand,
      conversionBalance: data.accountById?.envelopeStartingBalance,
      openingBalances: budgets.map((budget) => budget.startingAmount),
    })
    const months = envelopeMonths(
      {
        startMonth,
        startingBalance,
        budgets: budgets.map((budget) => ({ id: budget.id, openingBalance: budget.startingAmount })),
        assignments: (data.allBudgetAssignments?.nodes ?? []).map((row) => ({
          budgetId: row.budgetId,
          month: row.month,
          amount: row.amount,
        })),
        activity: (data.budgetMonthlyActivity?.nodes ?? []).map((row) => ({
          budgetId: row.budgetId ?? 0,
          month: row.month,
          activity: row.activity,
        })),
        unbudgeted: (data.envelopeUnbudgetedMonthly?.nodes ?? []).map((row) => ({
          month: row.month,
          payroll: row.payroll,
          unbudgetedInflow: row.unbudgetedInflow,
          unbudgetedOutflow: row.unbudgetedOutflow,
        })),
      },
      selectedMonth,
    )
    const month: EnvelopeMonth | null = months.at(-1) ?? null
    const previousMonth = addMonths(selectedMonth, -1)
    const byId = new Map(budgets.map((budget) => [budget.id, budget]))
    const rows: EnvelopeBudgetRow[] = (month?.budgets ?? []).map((row) => {
      const budget = byId.get(row.budgetId)!
      return {
        ...row,
        budget,
        categoryIds: (budget.budgetCategoriesByBudgetId?.nodes ?? []).map(
          (budgetCategory) => budgetCategory.categoryId,
        ),
      }
    })
    const previousAssigned = new Map<number, number>()
    for (const row of data.allBudgetAssignments?.nodes ?? []) {
      if (row.month === previousMonth) previousAssigned.set(row.budgetId, Number(row.amount))
    }
    return { accountId, startMonth, budgets, month, rows, previousAssigned, cashOnHand, startingBalance }
  }, [data, accountId, startMonth, selectedMonth])
  return { ...result, refetch: query.refetch }
}
