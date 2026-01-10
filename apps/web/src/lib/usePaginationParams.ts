import { useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

export function usePaginationParams() {
  const searchParams = useSearchParams()

  const limit = 50

  const page = useMemo(() => {
    return Number(searchParams?.get('page')) || 1
  }, [searchParams])

  const offset = useMemo(() => {
    return (page - 1) * limit
  }, [page])

  return {
    limit,
    page,
    offset,
  }
}
