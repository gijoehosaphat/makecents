import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

export function useTransactionFilterParams() {
  const searchParams = useSearchParams()

  const categorizedParam = useMemo(() => {
    const val = searchParams?.get('categorized')
    if (val === 'true') {
      return true
    }
    if (val === 'false') {
      return false
    }
    return undefined
  }, [searchParams])

  const categoryIdsParam = useMemo(() => {
    const val = searchParams?.get('categoryIds')
    if (!val) {
      return undefined
    }
    const ids = val
      .split(',')
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id))
    return ids.length > 0 ? ids : undefined
  }, [searchParams])

  const [categorized, setCategorized] = useState<boolean | undefined>(categorizedParam)
  const [categoryIds, setCategoryIds] = useState<number[] | undefined>(categoryIdsParam)

  useEffect(() => {
    setCategorized(categorizedParam)
  }, [categorizedParam])

  useEffect(() => {
    setCategoryIds(categoryIdsParam)
  }, [categoryIdsParam])

  return {
    categorized,
    categoryIds,
  }
}
