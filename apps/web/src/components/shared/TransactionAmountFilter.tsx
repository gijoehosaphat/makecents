'use client'

import { Box, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'
import { updateSearchParamsUrl } from '@/lib/updateSearchParamsUrl'
import { useDebouncedSearchParam } from '@/lib/useDebouncedSearchParam'

// The amount param is a positive number of dollars; anything else clears it.
function toAmountParam(value: string) {
  const amount = Number(value)
  return value.trim() !== '' && Number.isFinite(amount) && amount > 0 ? String(amount) : null
}

/** Withdrawals / deposits toggle plus an exact amount (absolute value) input. */
export function TransactionAmountFilter() {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [type, setType] = useOptimistic(searchParams?.get('type') || 'any')
  const [amount, setAmount] = useDebouncedSearchParam('amount', { delay: 400, toParam: toAmountParam })

  function handleTypeChange(value: string) {
    startTransition(() => {
      setType(value)
      router.push(updateSearchParamsUrl(pathname, searchParams, { type: value === 'any' ? null : value }))
    })
  }

  return (
    <Box ml={2} display={'flex'} alignItems={'center'} gap={1}>
      <ToggleButtonGroup
        exclusive
        size={'small'}
        value={type}
        onChange={(event, value: string | null) => value && handleTypeChange(value)}
      >
        <ToggleButton value={'any'}>{t('shared.any')}</ToggleButton>
        <ToggleButton value={'withdrawals'}>{t('transactions.withdrawals')}</ToggleButton>
        <ToggleButton value={'deposits'}>{t('transactions.deposits')}</ToggleButton>
      </ToggleButtonGroup>
      <TextField
        size={'small'}
        type={'number'}
        label={t('shared.amount')}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        slotProps={{ htmlInput: { min: 0, step: 'any' } }}
        sx={{ width: 120 }}
      />
    </Box>
  )
}
