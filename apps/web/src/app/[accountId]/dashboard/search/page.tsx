import { SearchTransactions } from '@/components/transactions/SearchTransactions'
import { Loading } from '@/components/shared/Loading'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <SearchTransactions />
    </Suspense>
  )
}
