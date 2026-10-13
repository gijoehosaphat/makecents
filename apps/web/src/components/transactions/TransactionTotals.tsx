'use client'

import { useMemo, useState } from 'react'
import { useAppContext } from '../context/AppContextProvider'
import { CurrencyTotals, DEFAULT_CURRENCY, resolveCurrency } from '../shared/CurrencyTotals'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useTransactionFilterParams } from '@/lib/useTransactionFilterParams'
import { useBankAccountFilterParams } from '@/lib/useBankAccountFilterParams'
import { useTransactionAmountParams } from '@/lib/useTransactionAmountParams'
import { useTransactionSearchParams } from '@/lib/useTransactionSearchParams'
import { useFilteredTransactionTotals } from '@/lib/useFilteredTransactionTotals'

export function TransactionTotals() {
  const { bankAccounts } = useAppContext()
  const { dateFrom, dateTo } = useDateFilterParams()
  const { categorized, categoryIds, autoCategorized } = useTransactionFilterParams()
  const { bankAccountIds: selectedBankAccountIds } = useBankAccountFilterParams()
  const { direction, amountMin, amountMax } = useTransactionAmountParams()
  const { search } = useTransactionSearchParams()
  const [selectedCurrency, setSelectedCurrency] = useState<string>()

  const filteredBankAccountIds = useMemo(() => {
    return selectedBankAccountIds || bankAccounts.map((bankAccount) => bankAccount.id)
  }, [selectedBankAccountIds, bankAccounts])

  const { deposits, withdrawals, transferDeposits, transferWithdrawals } = useFilteredTransactionTotals({
    bankAccountIds: filteredBankAccountIds,
    dateFrom,
    dateTo,
    categorized,
    categoryIds,
    autoCategorized,
    direction,
    amountMin,
    amountMax,
    search,
  })

  // Amounts in different currencies can't be added together, so totals are kept per currency.
  const totalsByCurrency = useMemo(() => {
    const totals: Record<string, { deposits: number; withdrawals: number; transferDeposits: number; transferWithdrawals: number }> = {}
    for (const bankAccount of bankAccounts) {
      if (!filteredBankAccountIds.includes(bankAccount.id)) {
        continue
      }
      const currency = bankAccount.currency || DEFAULT_CURRENCY
      totals[currency] ||= { deposits: 0, withdrawals: 0, transferDeposits: 0, transferWithdrawals: 0 }
      totals[currency].deposits += deposits[bankAccount.id] || 0
      totals[currency].withdrawals += withdrawals[bankAccount.id] || 0
      totals[currency].transferDeposits += transferDeposits[bankAccount.id] || 0
      totals[currency].transferWithdrawals += transferWithdrawals[bankAccount.id] || 0
    }
    return totals
  }, [bankAccounts, filteredBankAccountIds, deposits, withdrawals, transferDeposits, transferWithdrawals])

  const currencies = Object.keys(totalsByCurrency).sort((a, b) => a.localeCompare(b))

  const currency = resolveCurrency(currencies, selectedCurrency)
  const totals = currency ? totalsByCurrency[currency] : undefined

  if (!currency || !totals) {
    return null
  }

  return (
    <CurrencyTotals
      deposits={totals.deposits}
      withdrawals={totals.withdrawals}
      transferDeposits={totals.transferDeposits}
      transferWithdrawals={totals.transferWithdrawals}
      currency={currency}
      currencies={currencies}
      onCurrencyChange={setSelectedCurrency}
    />
  )
}
