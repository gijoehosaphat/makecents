import { useSearchParams } from 'next/navigation'

export function useTransactionSearchParams() {
  const searchParams = useSearchParams()
  return { search: searchParams?.get('search') || '' }
}
