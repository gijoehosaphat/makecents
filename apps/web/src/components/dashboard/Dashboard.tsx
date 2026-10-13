'use client'

import { PageTitle } from '@/components/shared/PageTitle'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { BankAccount } from '@/graphql/types'
import { useSuspenseQuery } from '@apollo/client/react'
import { Box, Divider } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useAppContext } from '../context/AppContextProvider'
import { DateFilter } from '../shared/DateFilter'
import { groupBy } from '@/lib/groupBy'
import { CurrencyTotals, DEFAULT_CURRENCY, resolveCurrency } from '../shared/CurrencyTotals'
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
}: {
  bankAccounts: BankAccount[]
  currency: string
  currencies: string[]
  onCurrencyChange: (currency: string) => void
}) {
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
  const transferDepositTotal: number = Number(query?.data?.transferDeposits?.aggregates?.sum?.amount || 0)
  const transferWithdrawalTotal: number = Number(query?.data?.transferWithdrawals?.aggregates?.sum?.amount || 0)

  return (
    <Box sx={{ pt: 4, pb: 4 }}>
      <CurrencyTotals
        deposits={depositTotal}
        withdrawals={withdrawalTotal}
        transferDeposits={transferDepositTotal}
        transferWithdrawals={transferWithdrawalTotal}
        currency={currency}
        currencies={currencies}
        onCurrencyChange={onCurrencyChange}
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
        />
      )}
    </>
  )
}
