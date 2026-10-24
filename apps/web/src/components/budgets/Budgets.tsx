'use client'

import { Budget, Query } from '@/graphql/types'
import { useTranslations } from 'next-intl'
import { useSuspenseQuery } from '@apollo/client/react'
import { useAppContext } from '../context/AppContextProvider'
import BudgetAdd from './BudgetAdd'
import StartingCash from './StartingCash'
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import BudgetRow from './BudgetRow'
import { useMemo } from 'react'
import { GetBudgetsByAccountIdDocument } from '@/graphql/operations'
import { Money } from '../shared/Money'

export default function Budgets() {
  const t = useTranslations('common')
  const { currentAccountId, bankAccounts } = useAppContext()

  const query = useSuspenseQuery<Query>(GetBudgetsByAccountIdDocument, {
    variables: {
      accountId: Number(currentAccountId),
    },
  })

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
      {!!currentAccountId && <BudgetAdd accountId={currentAccountId} />}
      <Typography sx={{ mt: 3, mb: 1 }} color={'text.secondary'}>
        {t('budgets.description')}
      </Typography>
      <Typography>
        {t('budgets.plannedTotal')}:{' '}
        <Money amountInCents={totalBudgeted} currency={bankAccounts[0]?.currency || 'CAD'} colored={false} />
      </Typography>
      {!!currentAccountId && (
        <StartingCash accountId={currentAccountId} budgets={budgets} currency={bankAccounts[0]?.currency || 'CAD'} />
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
                  {t('budgets.plannedAmount')}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('categories.title')}
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
              <BudgetRow key={budget.nodeId} budget={budget} accountId={currentAccountId} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
