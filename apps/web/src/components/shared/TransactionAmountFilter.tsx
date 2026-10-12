'use client'

import { Box, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { updateSearchParamsUrl } from '@/lib/updateSearchParamsUrl'

type AmountKey = 'amountMin' | 'amountMax'

/** Withdrawals / deposits toggle plus min and max amount (absolute value) inputs. */
export function TransactionAmountFilter() {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const type = searchParams?.get('type') || 'any'
  const [min, setMin] = useState(searchParams?.get('amountMin') || '')
  const [max, setMax] = useState(searchParams?.get('amountMax') || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    setMin(searchParams?.get('amountMin') || '')
    setMax(searchParams?.get('amountMax') || '')
  }, [searchParams])

  function navigate(changes: Record<string, string | null>) {
    startTransition(() => {
      router.push(updateSearchParamsUrl(pathname, searchParams, changes))
    })
  }

  function handleAmountChange(key: AmountKey, value: string) {
    if (key === 'amountMin') {
      setMin(value)
    } else {
      setMax(value)
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      const amount = Number(value)
      navigate({ [key]: value.trim() !== '' && Number.isFinite(amount) && amount >= 0 ? String(amount) : null })
    }, 400)
  }

  return (
    <Box ml={2} display={'flex'} alignItems={'center'} gap={1}>
      <ToggleButtonGroup
        exclusive
        size={'small'}
        value={type}
        onChange={(event, value: string | null) => value && navigate({ type: value === 'any' ? null : value })}
      >
        <ToggleButton value={'any'}>{t('shared.any')}</ToggleButton>
        <ToggleButton value={'withdrawals'}>{t('transactions.withdrawals')}</ToggleButton>
        <ToggleButton value={'deposits'}>{t('transactions.deposits')}</ToggleButton>
      </ToggleButtonGroup>
      <TextField
        size={'small'}
        type={'number'}
        label={t('shared.minAmount')}
        value={min}
        onChange={(event) => handleAmountChange('amountMin', event.target.value)}
        slotProps={{ htmlInput: { min: 0, step: 'any' } }}
        sx={{ width: 120 }}
      />
      <TextField
        size={'small'}
        type={'number'}
        label={t('shared.maxAmount')}
        value={max}
        onChange={(event) => handleAmountChange('amountMax', event.target.value)}
        slotProps={{ htmlInput: { min: 0, step: 'any' } }}
        sx={{ width: 120 }}
      />
    </Box>
  )
}
