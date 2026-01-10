'use client'

import { PageTitle } from '@/components/shared/PageTitle'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { BankAccount } from '@/graphql/types'
import { useSuspenseQuery } from '@apollo/client/react'
import { Box, Divider, Typography, useTheme } from '@mui/material'
import Grid from '@mui/material/Grid'
import { useTranslations } from 'next-intl'
import { useAppContext } from '../context/AppContextProvider'
import { DateFilter } from '../shared/DateFilter'
import { groupBy } from '@/lib/groupBy'
import { Money } from '../shared/Money'
import React from 'react'
import {
  GetTransactionAggregatesByBankAccountDocument,
  GetTransactionAggregatesByBankAccount,
} from '@/graphql/operations'

function BankAccountGroup({ bankAccounts, currency }: { bankAccounts: BankAccount[]; currency: string }) {
  const t = useTranslations('common')
  const { dateFrom, dateTo } = useDateFilterParams()

  const query = useSuspenseQuery<GetTransactionAggregatesByBankAccount>(GetTransactionAggregatesByBankAccountDocument, {
    variables: {
      bankAccountIds: bankAccounts.map((bankAccount) => bankAccount.id),
      dateFrom,
      dateTo,
    },
  })

  const withdrawalTotal: number = Number(query?.data?.withdrawals?.aggregates?.sum?.amount)
  const depositTotal: number = Number(query?.data?.deposits?.aggregates?.sum?.amount)

  return (
    <Box sx={{ pt: 4, pb: 4 }}>
      <Typography variant={'h1'}>{t('dashboard.bankAccountGroup', { count: bankAccounts.length })}:</Typography>
      <Typography variant={'h6'}>({bankAccounts.map((ba) => ba.name).join(', ')})</Typography>
      <Grid container>
        <Grid size={{ xs: 12, md: 4 }}>
          <MoneyGridItem label={t('transactions.deposits')} amountInCents={depositTotal} currency={currency} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <MoneyGridItem label={t('transactions.withdrawals')} amountInCents={withdrawalTotal} currency={currency} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <MoneyGridItem label={t('shared.net')} amountInCents={depositTotal + withdrawalTotal} currency={currency} />
        </Grid>
      </Grid>
    </Box>
  )
}

function MoneyGridItem({
  label,
  amountInCents,
  currency,
  colored = true,
}: {
  label: string
  amountInCents: number
  currency: string
  colored?: boolean
}) {
  return (
    <>
      <Typography
        variant={'h1'}
        sx={{
          display: 'inline',
          fontSize: 50,
        }}
      >
        <Money amountInCents={amountInCents} currency={currency} colored={colored} />
      </Typography>
      <Typography variant={'h1'} sx={{ textTransform: 'uppercase' }}>
        {label}
      </Typography>
    </>
  )
}

export function Dashboard() {
  const t = useTranslations('common')
  const { bankAccounts } = useAppContext()
  const bankAccountGroups = groupBy(bankAccounts, (bankAccount) => bankAccount.currency || 'CAD')

  return (
    <>
      <PageTitle icon={'home'} title={t('dashboard.title')} />
      <Divider />
      <DateFilter />
      <Divider />
      {Object.keys(bankAccountGroups).length === 0 && <p>No Bank Accounts</p>}
      {Object.keys(bankAccountGroups).map((currency, i) => (
        <React.Fragment key={currency}>
          {i !== 0 && <Divider />}
          <BankAccountGroup bankAccounts={bankAccountGroups[currency]} currency={currency} />
        </React.Fragment>
      ))}
    </>
  )
}
