'use client'

import { Suspense } from 'react'
import { DateFilter } from '../shared/DateFilter'
import { StickyHeader } from '../shared/StickyHeader'
import { Loading } from '../shared/Loading'
import { BankAccountFilter } from '../shared/BankAccountFilter'
import { TransactionFilter } from '../shared/TransactionFilter'
import { TransactionSearchFilter } from '../shared/TransactionSearchFilter'
import { TransactionsResults } from './TransactionsResults'
import { TransactionTotals } from './TransactionTotals'

export function SearchTransactions() {
  return (
    <>
      <Suspense fallback={<Loading />}>
        <TransactionTotals />
      </Suspense>
      <StickyHeader>
        <DateFilter />
        <TransactionFilter>
          <BankAccountFilter />
          <TransactionSearchFilter />
        </TransactionFilter>
      </StickyHeader>
      <Suspense fallback={<Loading />}>
        <TransactionsResults />
      </Suspense>
    </>
  )
}
