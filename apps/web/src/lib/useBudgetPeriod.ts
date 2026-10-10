import { useMemo } from 'react'
import { startOfMonth, endOfMonth, endOfDay } from 'date-fns'
import { useDateFilterParams } from '@/lib/useDateFilterParams'

/**
 * Budget accrual and the monthly plan are month-scoped, so when the shared date filter is in
 * "year" or "all time" mode this falls back to the current month and reports `isFallback`.
 */
export function useBudgetPeriod() {
  const { dateFrom: rawDateFrom, dateTo: rawDateTo, dateRange } = useDateFilterParams()
  return useMemo(() => {
    const today = new Date()
    const isMonth = dateRange === 'month' && !!rawDateFrom && !!rawDateTo
    return {
      dateFrom: isMonth ? rawDateFrom : startOfMonth(today),
      dateTo: isMonth ? rawDateTo : endOfMonth(endOfDay(today)),
      isFallback: dateRange !== 'month',
    }
  }, [dateRange, rawDateFrom, rawDateTo])
}
