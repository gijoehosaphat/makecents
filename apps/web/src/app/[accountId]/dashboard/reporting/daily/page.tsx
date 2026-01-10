import { DailySpendingLineChart } from '@/components/reporting/DailySpendingLineChart'
import { Loading } from '@/components/shared/Loading'
import TitleSetter from '@/components/TitleSetter'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <TitleSetter>Daily Cash Flow</TitleSetter>
      <DailySpendingLineChart />
    </Suspense>
  )
}
