'use client'

import { updateSearchParamsUrl } from '@/lib/updateSearchParamsUrl'
import { Box, InputAdornment, TextField } from '@mui/material'
import { Search } from '@mui/icons-material'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

export function TransactionSearchFilter() {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [value, setValue] = useState(searchParams?.get('search') || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    setValue(searchParams?.get('search') || '')
  }, [searchParams])

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const search = event.target.value
    setValue(search)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      const url = updateSearchParamsUrl(pathname, searchParams, { search: search.trim() })
      startTransition(() => {
        router.push(url)
      })
    }, 300)
  }

  return (
    <Box ml={2}>
      <TextField
        size={'small'}
        placeholder={t('transactions.searchPlaceholder')}
        value={value}
        onChange={handleChange}
        sx={{ minWidth: 220 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position={'start'}>
                <Search fontSize={'small'} />
              </InputAdornment>
            ),
          },
        }}
      />
    </Box>
  )
}
