import { useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

export function useBankAccountFilterParams() {
  const searchParams = useSearchParams()
  const bankAccountIdsParam = searchParams?.get('bankAccountIds')

  return useMemo(() => {
    if (!bankAccountIdsParam) {
      return { bankAccountIds: undefined }
    }
    const ids = bankAccountIdsParam
      .split(',')
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id))
    return { bankAccountIds: ids.length > 0 ? ids : undefined }
  }, [bankAccountIdsParam])
}
