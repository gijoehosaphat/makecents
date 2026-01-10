'use client'

import { DateFilter } from '../shared/DateFilter'
import { TransactionsByCategory } from './TransactionsByCategory'
import { useDateFilterParams } from '@/lib/useDateFilterParams'

export function Reporting() {
  const { dateFrom, dateTo } = useDateFilterParams()

  return (
    <>
      <TransactionsByCategory dateFrom={dateFrom} dateTo={dateTo} />
    </>
  )
}
