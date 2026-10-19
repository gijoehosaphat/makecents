'use client'

import { updateSearchParamsUrl } from '@/lib/updateSearchParamsUrl'
import { useAppContext } from '@/components/context/AppContextProvider'
import {
  Box,
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  SelectChangeEvent,
} from '@mui/material'
import { useTranslations } from 'next-intl'
import { useBankAccountLabel } from '@/components/shared/BankAccountLabel'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'

export function BankAccountFilter() {
  const t = useTranslations('common')
  const accountLabel = useBankAccountLabel()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { bankAccounts } = useAppContext()
  const [, startTransition] = useTransition()

  // Shows the new selection straight away, while the results for it load.
  const [selected, setSelected] = useOptimistic(searchParams?.get('bankAccountIds')?.split(',').filter(Boolean) || [])

  function handleChange(event: SelectChangeEvent<string[]>) {
    const value = event.target.value
    const bankAccountIds = typeof value === 'string' ? value.split(',').filter(Boolean) : value

    const url = updateSearchParamsUrl(pathname, searchParams, { bankAccountIds: bankAccountIds.join(',') })
    startTransition(() => {
      setSelected(bankAccountIds)
      router.push(url)
    })
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
