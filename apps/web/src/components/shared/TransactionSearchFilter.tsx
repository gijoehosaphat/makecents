'use client'

import { Box, InputAdornment, TextField } from '@mui/material'
import { Search } from '@mui/icons-material'
import { useTranslations } from 'next-intl'
import { useDebouncedSearchParam } from '@/lib/useDebouncedSearchParam'

export function TransactionSearchFilter() {
  const t = useTranslations('common')
  const [value, setValue] = useDebouncedSearchParam('search', {
    delay: 300,
    toParam: (search) => search.trim() || null,
  })

  return (
    <Box ml={2}>
      <TextField
        size={'small'}
        placeholder={t('transactions.searchPlaceholder')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
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
