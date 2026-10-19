import { useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

export function useTransactionFilterParams() {
  const searchParams = useSearchParams()
  const categorizedParam = searchParams?.get('categorized')
  const categoryIdsParam = searchParams?.get('categoryIds')
  const autoParam = searchParams?.get('auto')

  return useMemo(() => {
    const categorized = categorizedParam === 'true' ? true : categorizedParam === 'false' ? false : undefined

    const ids = (categoryIdsParam || '')
      .split(',')
      .filter(Boolean)
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id))

    return {
      categorized,
      categoryIds: ids.length > 0 ? ids : undefined,
      autoCategorized: autoParam === 'true',
    }
  }, [categorizedParam, categoryIdsParam, autoParam])
}
