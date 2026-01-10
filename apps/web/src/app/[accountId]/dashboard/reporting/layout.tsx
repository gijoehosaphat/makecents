'use client'

import { DateFilter } from '@/components/shared/DateFilter'
import { StickyHeader } from '@/components/shared/StickyHeader'
import { PageTitle } from '@/components/shared/PageTitle'
import { Box, Tab, Tabs } from '@mui/material'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAppContext } from '@/components/context/AppContextProvider'

export default function Layout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common')
  // const { currentAccountId } = useAppContext()
  // const searchParams = useSearchParams()
  // const pathname = usePathname()
  // const router = useRouter()

  // function handleChange(event: React.ChangeEvent<unknown>, value: string) {
  //   const queryString = searchParams?.toString()
  //   if (queryString) {
  //     value += `?${queryString}`
  //   }
  //   router.push(value)
  // }

  return (
    <Box sx={{ mb: 20 }}>
      <PageTitle icon={'barChart'} title={t('reporting.title')} />
      <StickyHeader>
        <DateFilter />
        {/* <Tabs
          value={pathname}
          onChange={handleChange}
          variant={'scrollable'}
          scrollButtons={'auto'}
          sx={{ position: 'sticky', top: '45px' }}
        >
          <Tab label={t('reporting.dailySpendingTitle')} value={`/${currentAccountId}/dashboard/reporting/daily`} />
          <Tab
            label={t('reporting.categorySpendingTitle')}
            value={`/${currentAccountId}/dashboard/reporting/category`}
          />
          <Tab label={t('reporting.budgetsTitle')} value={`/${currentAccountId}/dashboard/reporting/budgets`} />
        </Tabs> */}
      </StickyHeader>
      <Box sx={{ mt: 4 }}>{children}</Box>
    </Box>
  )
}
