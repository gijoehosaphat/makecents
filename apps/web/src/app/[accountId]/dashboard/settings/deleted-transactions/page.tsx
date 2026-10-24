import DeletedTransactions from '@/components/deletedTransactions/DeletedTransactions'
import { Loading } from '@/components/shared/Loading'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <DeletedTransactions />
    </Suspense>
  )
}
