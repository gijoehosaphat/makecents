import { SpendingLineChart } from '@/components/reporting/SpendingLineChart'
import { Loading } from '@/components/shared/Loading'
import TitleSetter from '@/components/TitleSetter'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

export default async function Page() {
  const t = await getTranslations('common')
  return (
    <Suspense fallback={<Loading />}>
      <TitleSetter>{t('reporting.spendingTitle')}</TitleSetter>
      <SpendingLineChart />
    </Suspense>
  )
}
