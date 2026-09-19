import { useSearchParams } from 'next/navigation'
import { parse, isValid, startOfMonth, endOfMonth, startOfYear, endOfYear, endOfDay } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'

export type DateFilterMode = 'month' | 'year' | 'all'

export function useDateFilterParams() {
  const searchParams = useSearchParams()
  const today = useMemo(() => new Date(), [])

  const dateRangeParam = searchParams?.get('dateRange')
  const dateRange: DateFilterMode = dateRangeParam === 'year' || dateRangeParam === 'all' ? dateRangeParam : 'month'

  const dateFromParam = useMemo(() => {
    return parse(String(searchParams?.get('dateFrom')), 'yyyy-MM-dd', new Date())
  }, [searchParams])

  const dateToParam = useMemo(() => {
    return endOfDay(parse(String(searchParams?.get('dateTo')), 'yyyy-MM-dd', new Date()))
  }, [searchParams])

  const defaultDateFrom = useMemo(() => {
    if (dateRange === 'year') {
      return isValid(dateFromParam) ? startOfYear(dateFromParam) : startOfYear(today)
    }
    return isValid(dateFromParam) ? startOfMonth(dateFromParam) : startOfMonth(today)
  }, [dateRange, dateFromParam, today])

  const defaultDateTo = useMemo(() => {
    if (dateRange === 'year') {
      return isValid(dateToParam) ? endOfYear(dateToParam) : endOfYear(endOfDay(today))
    }
    return isValid(dateToParam) ? endOfMonth(dateToParam) : endOfMonth(endOfDay(today))
  }, [dateRange, dateToParam, today])

  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)

  useEffect(() => {
    setDateFrom(defaultDateFrom)
    setDateTo(defaultDateTo)
  }, [defaultDateFrom, defaultDateTo])

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
