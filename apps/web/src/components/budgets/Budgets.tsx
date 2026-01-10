'use client'

import { Budget, Query } from '@/graphql/types'
import { useTranslations } from 'next-intl'
import { useSuspenseQuery } from '@apollo/client/react'
import { useAppContext } from '../context/AppContextProvider'
import BudgetAdd from './BudgetAdd'
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import BudgetRow from './BudgetRow'
import { useMemo } from 'react'
import {
  GetBudgetsByUserIdDocument,
  GetTransactionAggregatesByBankAccountDocument,
  GetTransactionAggregatesByBankAccount,
} from '@/graphql/operations'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { Money } from '../shared/Money'

export default function Budgets() {
  const t = useTranslations('common')
  const { user, bankAccounts } = useAppContext()
  const { dateFrom, dateTo } = useDateFilterParams()

  const query = useSuspenseQuery<Query>(GetBudgetsByUserIdDocument, {
    variables: {
      userId: Number(user?.id),
    },
  })

  const aggregates = useSuspenseQuery<GetTransactionAggregatesByBankAccount>(
    GetTransactionAggregatesByBankAccountDocument,
    {
      variables: {
        bankAccountIds: bankAccounts.map((bankAccount) => bankAccount.id),
        dateFrom,
        dateTo,
      },
    }
  )

  const depositTotal: number = useMemo(() => {
    return Number(aggregates?.data?.deposits?.aggregates?.sum?.amount)
  }, [aggregates?.data?.deposits?.aggregates?.sum?.amount])

  const budgets: Budget[] = useMemo(() => {
    return [...(query?.data?.allBudgets?.nodes || [])]?.sort((a: Budget, b: Budget) => {
      if ((a.name || '') > (b.name || '')) return 1
      if ((a.name || '') < (b.name || '')) return -1
      return 0
    })
  }, [query?.data?.allBudgets?.nodes])

  const totalBudgeted = useMemo(() => {
    return budgets.reduce((partialSum, b) => partialSum + Number(b.amount), 0)
  }, [budgets])

  return (
    <>
      {!!user && <BudgetAdd user={user} />}
      <Typography>Deposits: </Typography>
      {bankAccounts[0].currency && (
        <Money amountInCents={depositTotal} currency={bankAccounts[0].currency} colored={true} />
      )}
      <Typography>Budgeted: </Typography>
      {bankAccounts[0].currency && (
        <Money amountInCents={totalBudgeted} currency={bankAccounts[0].currency} colored={true} />
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
              <BudgetRow key={budget.nodeId} budget={budget} user={user} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
