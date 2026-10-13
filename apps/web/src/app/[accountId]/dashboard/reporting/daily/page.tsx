import { DailySpendingLineChart } from '@/components/reporting/DailySpendingLineChart'
import { Loading } from '@/components/shared/Loading'
import TitleSetter from '@/components/TitleSetter'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

export default async function Page() {
  const t = await getTranslations('common')
  return (
    <Suspense fallback={<Loading />}>
      <TitleSetter>{t('reporting.dailySpendingTitle')}</TitleSetter>
      <DailySpendingLineChart />
    </Suspense>
  )
}
