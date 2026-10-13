'use client'

import { PageTitle } from '@/components/shared/PageTitle'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { BankAccount } from '@/graphql/types'
import { useSuspenseQuery } from '@apollo/client/react'
import { Box, Divider, Typography } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useAppContext } from '../context/AppContextProvider'
import { DateFilter } from '../shared/DateFilter'
import { groupBy } from '@/lib/groupBy'
import { ANY_TRANSACTION_FILTER, CurrencyTotals, DEFAULT_CURRENCY, EXCLUDE_TRANSFERS_FILTER, resolveCurrency } from '../shared/CurrencyTotals'
import { useState } from 'react'
import {
  GetTransactionAggregatesByBankAccountDocument,
  GetTransactionAggregatesByBankAccount,
} from '@/graphql/operations'

function BankAccountGroup({
  bankAccounts,
  currency,
  currencies,
  onCurrencyChange,
  includeTransfers,
  onIncludeTransfersChange,
}: {
  bankAccounts: BankAccount[]
  currency: string
  currencies: string[]
  onCurrencyChange: (currency: string) => void
  includeTransfers: boolean
  onIncludeTransfersChange: (includeTransfers: boolean) => void
}) {
  const t = useTranslations('common')
  const { dateFrom, dateTo } = useDateFilterParams()

  const query = useSuspenseQuery<GetTransactionAggregatesByBankAccount>(GetTransactionAggregatesByBankAccountDocument, {
    variables: {
      bankAccountIds: bankAccounts.map((bankAccount) => bankAccount.id),
      dateFrom,
      dateTo,
      transferFilter: includeTransfers ? ANY_TRANSACTION_FILTER : EXCLUDE_TRANSFERS_FILTER,
    },
  })

  const withdrawalTotal: number = Number(query?.data?.withdrawals?.aggregates?.sum?.amount)
  const depositTotal: number = Number(query?.data?.deposits?.aggregates?.sum?.amount)

  return (
    <Box sx={{ pt: 4, pb: 4 }}>
      <Typography variant={'h1'}>{t('dashboard.bankAccountGroup', { count: bankAccounts.length })}:</Typography>
      <CurrencyTotals
        deposits={depositTotal}
        withdrawals={withdrawalTotal}
        currency={currency}
        currencies={currencies}
        onCurrencyChange={onCurrencyChange}
        includeTransfers={includeTransfers}
        onIncludeTransfersChange={onIncludeTransfersChange}
      />
    </Box>
  )
}

export function Dashboard() {
  const t = useTranslations('common')
  const { bankAccounts } = useAppContext()
  const bankAccountGroups = groupBy(bankAccounts, (bankAccount) => bankAccount.currency || DEFAULT_CURRENCY)
  const currencies = Object.keys(bankAccountGroups).sort((a, b) => a.localeCompare(b))
  const [selectedCurrency, setSelectedCurrency] = useState<string>()
  const [includeTransfers, setIncludeTransfers] = useState(false)
  const currency = resolveCurrency(currencies, selectedCurrency)

  return (
    <>
      <PageTitle icon={'home'} title={t('dashboard.title')} />
      <Divider />
      <DateFilter />
      <Divider />
      {currencies.length === 0 && <p>No Bank Accounts</p>}
      {currency && (
        <BankAccountGroup
          key={currency}
          bankAccounts={bankAccountGroups[currency]}
          currency={currency}
          currencies={currencies}
          onCurrencyChange={setSelectedCurrency}
          includeTransfers={includeTransfers}
          onIncludeTransfersChange={setIncludeTransfers}
        />
      )}
    </>
  )
}
