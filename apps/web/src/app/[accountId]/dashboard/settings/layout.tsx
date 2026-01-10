'use client'

import { useAppContext } from '@/components/context/AppContextProvider'
import { PageTitle } from '@/components/shared/PageTitle'
import { Settings } from '@mui/icons-material'
import { Box, Tab, Tabs } from '@mui/material'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common')
  const { currentAccountId } = useAppContext()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  function handleChange(event: React.ChangeEvent<unknown>, value: string) {
    const queryString = searchParams?.toString()
    if (queryString) {
      value += `?${queryString}`
    }
    router.push(value)
  }

  return (
    <Box sx={{ mb: 20 }}>
      <PageTitle icon={'settings'} title={t('settings.title')} />
      <Tabs value={pathname} onChange={handleChange} variant={'scrollable'} scrollButtons={'auto'}>
        <Tab label={t('categories.title')} value={`/${currentAccountId}/dashboard/settings/categories`} />
        <Tab label={t('budgets.title')} value={`/${currentAccountId}/dashboard/settings/budgets`} />
        <Tab label={t('groups.title')} value={`/${currentAccountId}/dashboard/settings/groups`} />
      </Tabs>
      {children}
    </Box>
  )
}
