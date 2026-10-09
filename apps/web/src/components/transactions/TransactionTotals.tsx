'use client'

import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { useAppContext } from '../context/AppContextProvider'
import { Money } from '../shared/Money'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useTransactionFilterParams } from '@/lib/useTransactionFilterParams'
import { useBankAccountFilterParams } from '@/lib/useBankAccountFilterParams'
import { useTransactionSearchParams } from '@/lib/useTransactionSearchParams'
import { useFilteredTransactionTotals } from '@/lib/useFilteredTransactionTotals'

const DEFAULT_CURRENCY = 'CAD'

function TotalItem({
  label,
  amountInCents,
  currency,
  prominent = false,
}: {
  label: string
  amountInCents: number
  currency: string
  prominent?: boolean
}) {
  return (
    <Box>
      <Typography variant={'h1'} sx={{ fontSize: prominent ? 48 : 22 }}>
        <Money amountInCents={amountInCents} currency={currency} />
      </Typography>
      <Typography variant={prominent ? 'h5' : 'h6'} sx={{ textTransform: 'uppercase' }}>
        {label}
      </Typography>
    </Box>
  )
}

export function TransactionTotals() {
  const { bankAccounts } = useAppContext()
  const t = useTranslations('common')
  const { dateFrom, dateTo } = useDateFilterParams()
  const { categorized, categoryIds } = useTransactionFilterParams()
  const { bankAccountIds: selectedBankAccountIds } = useBankAccountFilterParams()
  const { search } = useTransactionSearchParams()
  const [selectedCurrency, setSelectedCurrency] = useState<string>()

  const filteredBankAccountIds = useMemo(() => {
    return selectedBankAccountIds || bankAccounts.map((bankAccount) => bankAccount.id)
  }, [selectedBankAccountIds, bankAccounts])

  const { deposits, withdrawals } = useFilteredTransactionTotals({
    bankAccountIds: filteredBankAccountIds,
    dateFrom,
    dateTo,
    categorized,
    categoryIds,
    search,
  })

  // Amounts in different currencies can't be added together, so totals are kept per currency.
  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, { deposits: number; withdrawals: number }> = {}
    for (const bankAccount of bankAccounts) {
      if (!filteredBankAccountIds.includes(bankAccount.id)) {
        continue
      }
      const currency = bankAccount.currency || DEFAULT_CURRENCY
      totals[currency] ||= { deposits: 0, withdrawals: 0 }
      totals[currency].deposits += deposits[bankAccount.id] || 0
      totals[currency].withdrawals += withdrawals[bankAccount.id] || 0
    }
    return totals
  }, [bankAccounts, filteredBankAccountIds, deposits, withdrawals])

  const currencies = Object.keys(totalsByCurrency).sort((a, b) => a.localeCompare(b))

  // Focus on CAD by default; fall back when the chosen currency is no longer in the filtered accounts.
  const currency =
    selectedCurrency && totalsByCurrency[selectedCurrency]
      ? selectedCurrency
      : totalsByCurrency[DEFAULT_CURRENCY]
        ? DEFAULT_CURRENCY
        : currencies[0]
  const totals = currency ? totalsByCurrency[currency] : undefined

  if (!currency || !totals) {
    return null
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: 6, rowGap: 2, py: 2 }}>
      <TotalItem
        label={t('shared.net')}
        amountInCents={totals.deposits + totals.withdrawals}
        currency={currency}
        prominent
      />
      <Box sx={{ display: 'flex', gap: 4 }}>
        <TotalItem label={t('transactions.deposits')} amountInCents={totals.deposits} currency={currency} />
        <TotalItem label={t('transactions.withdrawals')} amountInCents={totals.withdrawals} currency={currency} />
      </Box>
      {currencies.length > 1 && (
        <ToggleButtonGroup
          value={currency}
          exclusive
          size={'small'}
          onChange={(event, value: string | null) => value && setSelectedCurrency(value)}
          sx={{ ml: 'auto' }}
        >
          {currencies.map((option) => (
            <ToggleButton key={option} value={option}>
              {option}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
    </Box>
  )
}
