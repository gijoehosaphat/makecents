import { useSearchParams } from 'next/navigation'
import { parse, isValid, startOfMonth, endOfMonth, endOfDay } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'

export function useDateFilterParams() {
  const searchParams = useSearchParams()
  const today = useMemo(() => new Date(), [])

  const dateFromParam = useMemo(() => {
    return parse(String(searchParams?.get('dateFrom')), 'yyyy-MM-dd', new Date())
  }, [searchParams])

  const dateToParam = useMemo(() => {
    return endOfDay(parse(String(searchParams?.get('dateTo')), 'yyyy-MM-dd', new Date()))
  }, [searchParams])

  const [dateFrom, setDateFrom] = useState(isValid(dateFromParam) ? dateFromParam : startOfMonth(today))

  const [dateTo, setDateTo] = useState(isValid(dateToParam) ? dateToParam : endOfMonth(endOfDay(today)))

  useEffect(() => {
    setDateFrom(isValid(dateFromParam) ? dateFromParam : startOfMonth(today))
    setDateTo(isValid(dateToParam) ? dateToParam : endOfMonth(endOfDay(today)))
  }, [dateToParam, dateFromParam, today])

  return {
    dateTo,
    dateFrom,
  }
}
