'use client'

import { Budget, Query } from '@/graphql/types'
import { useTranslations } from 'next-intl'
import { useSuspenseQuery } from '@apollo/client/react'
import { useAppContext } from '../context/AppContextProvider'
import BudgetAdd from './BudgetAdd'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import BudgetRow from './BudgetRow'
import { useMemo } from 'react'
import {
  GetBudgetsByAccountIdDocument,
  GetPayrollTransactionsDocument,
} from '@/graphql/operations'
import { expectedMonthlyIncome } from '@/lib/budgetMath'
import { startOfMonth, subMonths } from 'date-fns'
import { Money } from '../shared/Money'

const HISTORY_MONTHS = 6

export default function Budgets() {
  const t = useTranslations('common')
  const { currentAccountId, bankAccounts } = useAppContext()

  const query = useSuspenseQuery<Query>(GetBudgetsByAccountIdDocument, {
    variables: {
      accountId: Number(currentAccountId),
    },
  })

  // Expected income is always for the current month: this page has no date component.
  const historyStart = useMemo(
    () => subMonths(startOfMonth(new Date()), HISTORY_MONTHS),
    [],
  )
  const monthStart = useMemo(() => startOfMonth(new Date()), [])
  const payroll = useSuspenseQuery(GetPayrollTransactionsDocument, {
    variables: {
      bankAccountIds: bankAccounts.map((bankAccount) => bankAccount.id),
      dateFrom: historyStart,
      dateTo: monthStart,
    },
  })
  const expectedIncome = useMemo(
    () =>
      expectedMonthlyIncome(
        payroll.data.allTransactions?.nodes ?? [],
        historyStart,
        HISTORY_MONTHS,
      )?.expected ?? 0,
    [payroll.data.allTransactions?.nodes, historyStart],
  )

  const budgets: Budget[] = useMemo(() => {
    return [...(query?.data?.allBudgets?.nodes || [])]?.sort(
      (a: Budget, b: Budget) => {
        if ((a.name || '') > (b.name || '')) return 1
        if ((a.name || '') < (b.name || '')) return -1
        return 0
      },
    )
  }, [query?.data?.allBudgets?.nodes])

  const totalBudgeted = useMemo(() => {
    return budgets.reduce((partialSum, b) => partialSum + Number(b.amount), 0)
  }, [budgets])

  return (
    <>
      {!!currentAccountId && <BudgetAdd accountId={currentAccountId} />}
      <Typography sx={{ mt: 3, mb: 1 }} color={'text.secondary'}>
        {t('budgets.description')}
      </Typography>
      <Typography>{t('budgets.plan.expectedIncome')}: </Typography>
      {bankAccounts[0].currency && (
        <Money
          amountInCents={expectedIncome}
          currency={bankAccounts[0].currency}
          colored={true}
        />
      )}
      <Typography>Budgeted: </Typography>
      {bankAccounts[0].currency && (
        <Money
          amountInCents={totalBudgeted}
          currency={bankAccounts[0].currency}
          colored={true}
        />
      )}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('shared.name')}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('shared.amount')}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('categories.title')}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('budgets.startingAmount')}
                </Typography>
              </TableCell>
              <TableCell align={'right'}>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('budgets.effectiveDate')}
                </Typography>
              </TableCell>
              <TableCell align={'right'}>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('shared.actions')}
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {budgets.map((budget) => (
              <BudgetRow
                key={budget.nodeId}
                budget={budget}
                accountId={currentAccountId}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
