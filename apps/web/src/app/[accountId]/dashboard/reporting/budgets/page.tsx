import { EnvelopeBudget } from '@/components/reporting/EnvelopeBudget'
import { Loading } from '@/components/shared/Loading'
import TitleSetter from '@/components/TitleSetter'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <TitleSetter>By Budget</TitleSetter>
      <EnvelopeBudget />
    </Suspense>
  )
}
