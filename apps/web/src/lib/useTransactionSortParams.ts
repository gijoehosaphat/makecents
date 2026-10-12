import { useSearchParams } from 'next/navigation'
import { parseTransactionSort } from './transactionSort'

export function useTransactionSortParams() {
  const searchParams = useSearchParams()
  return { sort: parseTransactionSort(searchParams?.get('sort')) }
}
