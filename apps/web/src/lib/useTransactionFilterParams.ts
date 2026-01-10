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

  const categoryParam = useMemo(() => {
    const val = Number(searchParams?.get('category'))
    if (val) {
      return val
    }
    return undefined
  }, [searchParams])

  const [categorized, setCategorized] = useState<boolean | undefined>(categorizedParam)
  const [category, setCategory] = useState<number | undefined>(categoryParam)

  useEffect(() => {
    setCategorized(categorizedParam)
  }, [categorizedParam])

  useEffect(() => {
    setCategory(categoryParam)
  }, [categoryParam])

  return {
    categorized,
    category,
  }
}
