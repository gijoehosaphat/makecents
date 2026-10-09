'use client'

import { useAppContext } from '@/components/context/AppContextProvider'
import { Box, Checkbox, FormControl, InputLabel, ListItemText, MenuItem, Select, SelectChangeEvent } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useBankAccountLabel } from '@/components/shared/BankAccountLabel'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

export function BankAccountFilter() {
  const t = useTranslations('common')
  const accountLabel = useBankAccountLabel()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { bankAccounts } = useAppContext()
  const [, startTransition] = useTransition()

  const [selected, setSelected] = useState<string[]>(
    searchParams?.get('bankAccountIds')?.split(',').filter(Boolean) || [],
  )

  useEffect(() => {
    setSelected(searchParams?.get('bankAccountIds')?.split(',').filter(Boolean) || [])
  }, [searchParams])

  function handleChange(event: SelectChangeEvent<string[]>) {
    const value = event.target.value
    const bankAccountIds = typeof value === 'string' ? value.split(',').filter(Boolean) : value

    let queryParams: string[] = []
    if (searchParams) {
      for (let [key, value] of searchParams.entries()) {
        if (key !== 'bankAccountIds' && key !== 'page') {
          queryParams.push(`${key}=${value}`)
        }
      }
    }
    if (bankAccountIds.length > 0) {
      queryParams.push(`bankAccountIds=${bankAccountIds.join(',')}`)
    }
    setTimeout(() => {
      startTransition(() => {
        router.push(`${pathname}?${queryParams.join('&')}`)
      })
    }, 1)
  }

  return (
    <Box ml={2}>
      <FormControl size={'small'}>
        <InputLabel>{t('dashboard.bankAccounts')}: </InputLabel>
        <Select
          multiple
          value={selected}
          label={t('dashboard.bankAccounts')}
          onChange={handleChange}
          renderValue={(selectedValues) =>
            selectedValues.length === 0
              ? t('shared.any')
              : bankAccounts
                  .filter((bankAccount) => selectedValues.includes(String(bankAccount.id)))
                  .map((bankAccount) => accountLabel(bankAccount))
                  .join(', ')
          }
          sx={{ minWidth: 200, maxWidth: 260 }}
        >
          {bankAccounts.map((bankAccount) => (
            <MenuItem key={bankAccount.nodeId} value={String(bankAccount.id)}>
              <Checkbox checked={selected.includes(String(bankAccount.id))} />
              <ListItemText primary={accountLabel(bankAccount)} />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  )
}
