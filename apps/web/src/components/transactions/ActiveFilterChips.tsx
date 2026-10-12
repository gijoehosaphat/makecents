'use client'

import { Box, Button, Chip } from '@mui/material'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { useAppContext } from '../context/AppContextProvider'
import { useBankAccountLabel } from '../shared/BankAccountLabel'
import { useCategories } from '@/lib/useCategories'
import { useBankAccountFilterParams } from '@/lib/useBankAccountFilterParams'
import { formatMoneyCents } from '@/lib/formatMoney'
import { useTransactionFilterParams } from '@/lib/useTransactionFilterParams'
import { useTransactionAmountParams } from '@/lib/useTransactionAmountParams'
import { useTransactionSearchParams } from '@/lib/useTransactionSearchParams'
import { updateSearchParamsUrl } from '@/lib/updateSearchParamsUrl'

const DEFAULT_CURRENCY = 'CAD'

/** Removable chips for every active search / account / category filter, plus a "Clear all" button. */
export function ActiveFilterChips() {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { bankAccounts } = useAppContext()
  const accountLabel = useBankAccountLabel()
  const { categories } = useCategories()
  const { search } = useTransactionSearchParams()
  const { bankAccountIds } = useBankAccountFilterParams()
  const { categoryIds } = useTransactionFilterParams()
  const { direction, amountMin, amountMax } = useTransactionAmountParams()
  const [, startTransition] = useTransition()

  function navigate(changes: Record<string, string | null>) {
    startTransition(() => {
      router.push(updateSearchParamsUrl(pathname, searchParams, changes))
    })
  }

  function without(ids: number[] | undefined, id: number) {
    const remaining = (ids || []).filter((existing) => existing !== id)
    return remaining.length > 0 ? remaining.join(',') : null
  }

  const chips: { key: string; label: string; onDelete: () => void }[] = []

  if (search.trim()) {
    chips.push({
      key: 'search',
      label: t('shared.searchChip', { term: search.trim() }),
      onDelete: () => navigate({ search: null }),
    })
  }
  if (direction) {
    chips.push({
      key: 'type',
      label: t(`transactions.${direction}`),
      onDelete: () => navigate({ type: null }),
    })
  }
  if (amountMin !== undefined) {
    chips.push({
      key: 'amountMin',
      label: t('shared.minAmountChip', { amount: formatMoneyCents(amountMin, DEFAULT_CURRENCY) }),
      onDelete: () => navigate({ amountMin: null }),
    })
  }
  if (amountMax !== undefined) {
    chips.push({
      key: 'amountMax',
      label: t('shared.maxAmountChip', { amount: formatMoneyCents(amountMax, DEFAULT_CURRENCY) }),
      onDelete: () => navigate({ amountMax: null }),
    })
  }
  for (const id of bankAccountIds || []) {
    const bankAccount = bankAccounts.find((account) => account.id === id)
    if (bankAccount) {
      chips.push({
        key: `account-${id}`,
        label: accountLabel(bankAccount),
        onDelete: () => navigate({ bankAccountIds: without(bankAccountIds, id) }),
      })
    }
  }
  for (const id of categoryIds || []) {
    const category = categories.find((existing) => existing.id === id)
    if (category) {
      chips.push({
        key: `category-${id}`,
        label: category.name || '',
        onDelete: () => navigate({ categoryIds: without(categoryIds, id) }),
      })
    }
  }

  if (chips.length === 0) {
    return null
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, px: 4, py: 1 }}>
      {chips.map((chip) => (
        <Chip key={chip.key} size={'small'} label={chip.label} onDelete={chip.onDelete} />
      ))}
      <Button
        size={'small'}
        onClick={() =>
          navigate({ search: null, bankAccountIds: null, categoryIds: null, type: null, amountMin: null, amountMax: null })
        }
      >
        {t('shared.clearAll')}
      </Button>
    </Box>
  )
}
