import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

export function useBankAccountFilterParams() {
  const searchParams = useSearchParams()

  const bankAccountIdsParam = useMemo(() => {
    const val = searchParams?.get('bankAccountIds')
    if (!val) {
      return undefined
    }
    const ids = val
      .split(',')
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id))
    return ids.length > 0 ? ids : undefined
  }, [searchParams])

  const [bankAccountIds, setBankAccountIds] = useState<number[] | undefined>(bankAccountIdsParam)

  useEffect(() => {
    setBankAccountIds(bankAccountIdsParam)
  }, [bankAccountIdsParam])

  return {
    bankAccountIds,
  }
}
