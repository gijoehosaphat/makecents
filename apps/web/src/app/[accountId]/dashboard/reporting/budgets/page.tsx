import { Budgets } from '@/components/reporting/Budgets'
import { Loading } from '@/components/shared/Loading'
import TitleSetter from '@/components/TitleSetter'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <TitleSetter>By Budget</TitleSetter>
      <Budgets />
    </Suspense>
  )
}
