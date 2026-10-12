'use client'

import { Suspense } from 'react'
import { DateFilter } from '../shared/DateFilter'
import { StickyHeader } from '../shared/StickyHeader'
import { Loading } from '../shared/Loading'
import { BankAccountFilter } from '../shared/BankAccountFilter'
import { TransactionFilter } from '../shared/TransactionFilter'
import { TransactionAmountFilter } from '../shared/TransactionAmountFilter'
import { TransactionSearchFilter } from '../shared/TransactionSearchFilter'
import { TransactionsResults } from './TransactionsResults'
import { TransactionTotals } from './TransactionTotals'
import { TransactionTabs } from './TransactionTabs'
import { ActiveFilterChips } from './ActiveFilterChips'

export function SearchTransactions() {
  return (
    <>
      <Suspense fallback={<Loading />}>
        <TransactionTotals />
      </Suspense>
      <StickyHeader>
        <DateFilter allowCustom />
        <TransactionFilter hideCategorized>
          <BankAccountFilter />
          <TransactionAmountFilter />
          <TransactionSearchFilter />
        </TransactionFilter>
        <TransactionTabs />
        <ActiveFilterChips />
      </StickyHeader>
      <Suspense fallback={<Loading />}>
        <TransactionsResults />
      </Suspense>
    </>
  )
}
