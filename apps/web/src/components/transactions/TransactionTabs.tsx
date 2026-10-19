'use client'

import { Box, Tab, Tabs } from '@mui/material'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useOptimistic, useTransition } from 'react'
import { ExportTransactionsButton } from './ExportTransactionsButton'
import { useAppContext } from '../context/AppContextProvider'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useBankAccountFilterParams } from '@/lib/useBankAccountFilterParams'
import { useTransactionFilterParams } from '@/lib/useTransactionFilterParams'
import { useTransactionAmountParams } from '@/lib/useTransactionAmountParams'
import { useTransactionSearchParams } from '@/lib/useTransactionSearchParams'
import { useTransactionTabCounts } from '@/lib/useTransactionTabCounts'
import { updateSearchParamsUrl } from '@/lib/updateSearchParamsUrl'

type TabValue = 'any' | 'false' | 'true'

function TabsView({ counts }: { counts?: { all: number; uncategorized: number; categorized: number } }) {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { categorized } = useTransactionFilterParams()
  const [, startTransition] = useTransition()

  // Optimistic so the tab switches straight away, while its results load.
  const [value, setValue] = useOptimistic<TabValue>(categorized === undefined ? 'any' : categorized ? 'true' : 'false')

  function handleChange(event: React.SyntheticEvent, next: TabValue) {
    if (next === value) {
      return
    }
    startTransition(() => {
      setValue(next)
      router.push(
        updateSearchParamsUrl(pathname, searchParams, {
          categorized: next === 'any' ? null : next,
          // Picking specific categories only makes sense alongside the "categorized" tab.
          ...(next === 'false' ? { categoryIds: null } : {}),
        }),
      )
    })
  }

  function label(text: string, count?: number) {
    return count === undefined ? text : `${text} (${count.toLocaleString()})`
  }

  return (
    <Tabs value={value} onChange={handleChange} sx={{ px: 2 }}>
      <Tab value={'any'} label={label(t('shared.all'), counts?.all)} />
      <Tab value={'false'} label={label(t('shared.uncategorized'), counts?.uncategorized)} />
      <Tab value={'true'} label={label(t('shared.categorized'), counts?.categorized)} />
    </Tabs>
  )
}

function TabsWithCounts() {
  const { bankAccounts } = useAppContext()
  const { dateFrom, dateTo } = useDateFilterParams()
  const { bankAccountIds: selectedBankAccountIds } = useBankAccountFilterParams()
  const { direction, amount } = useTransactionAmountParams()
  const { search } = useTransactionSearchParams()

  const bankAccountIds = useMemo(() => {
    return selectedBankAccountIds || bankAccounts.map((bankAccount) => bankAccount.id)
  }, [selectedBankAccountIds, bankAccounts])

  const counts = useTransactionTabCounts({ bankAccountIds, dateFrom, dateTo, direction, amount, search })
  return <TabsView counts={counts} />
}

export function TransactionTabs() {
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', pr: 4 }}>
      <Box sx={{ flexGrow: 1 }}>
        <Suspense fallback={<TabsView />}>
          <TabsWithCounts />
        </Suspense>
      </Box>
      <Suspense fallback={null}>
        <ExportTransactionsButton />
      </Suspense>
    </Box>
  )
}
