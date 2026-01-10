import Budgets from '@/components/budgets/Budgets'
import { Loading } from '@/components/shared/Loading'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Budgets />
    </Suspense>
  )
}
