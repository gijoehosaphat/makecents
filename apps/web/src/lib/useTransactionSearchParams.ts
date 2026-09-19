import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

export function useTransactionSearchParams() {
  const searchParams = useSearchParams()

  const searchParam = useMemo(() => {
    return searchParams?.get('search') || ''
  }, [searchParams])

  const [search, setSearch] = useState(searchParam)

  useEffect(() => {
    setSearch(searchParam)
  }, [searchParam])

  return {
    search,
  }
}
