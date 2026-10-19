import { useSearchParams } from 'next/navigation'
import { parse, isValid, startOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, endOfDay } from 'date-fns'
import { useMemo } from 'react'

export type DateFilterMode = 'month' | 'year' | 'all' | 'custom'

export function useDateFilterParams() {
  const searchParams = useSearchParams()
  const today = useMemo(() => new Date(), [])

  const dateRangeParam = searchParams?.get('dateRange')
  const dateRange: DateFilterMode =
    dateRangeParam === 'year' || dateRangeParam === 'all' || dateRangeParam === 'custom' ? dateRangeParam : 'month'

  const dateFromString = searchParams?.get('dateFrom')
  const dateToString = searchParams?.get('dateTo')

  const dateFrom = useMemo(() => {
    const dateFromParam = parse(String(dateFromString), 'yyyy-MM-dd', new Date())
    if (dateRange === 'custom') {
      return isValid(dateFromParam) ? startOfDay(dateFromParam) : startOfMonth(today)
    }
    if (dateRange === 'year') {
      return isValid(dateFromParam) ? startOfYear(dateFromParam) : startOfYear(today)
    }
    return isValid(dateFromParam) ? startOfMonth(dateFromParam) : startOfMonth(today)
  }, [dateRange, dateFromString, today])

  const dateTo = useMemo(() => {
    const dateToParam = endOfDay(parse(String(dateToString), 'yyyy-MM-dd', new Date()))
    if (dateRange === 'custom') {
      return isValid(dateToParam) ? endOfDay(dateToParam) : endOfMonth(endOfDay(today))
    }
    if (dateRange === 'year') {
      return isValid(dateToParam) ? endOfYear(dateToParam) : endOfYear(endOfDay(today))
    }
    return isValid(dateToParam) ? endOfMonth(dateToParam) : endOfMonth(endOfDay(today))
  }, [dateRange, dateToString, today])

  if (dateRange === 'all') {
    return {
      dateRange,
      dateTo: undefined,
      dateFrom: undefined,
    }
  }

  return {
    dateRange,
    dateTo,
    dateFrom,
  }
}
