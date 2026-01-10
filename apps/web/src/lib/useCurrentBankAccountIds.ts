import { useAppContext } from '@/components/context/AppContextProvider'
import { useParams } from 'next/navigation'
import { useMemo } from 'react'

export function useCurrentBankAccountIds() {
  const { bankAccounts } = useAppContext()
  const params = useParams()

  const bankAccountIds = useMemo(() => {
    return Number(params?.bankAccountId)
      ? [Number(params?.bankAccountId)]
      : bankAccounts.map((bankAccount) => bankAccount.id)
  }, [params, bankAccounts])

  return {
    bankAccountIds,
  }
}
