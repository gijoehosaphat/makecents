'use client'

import { updateSearchParamsUrl } from '@/lib/updateSearchParamsUrl'
import { useCategories } from '@/lib/useCategories'
import {
  Box,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
} from '@mui/material'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'

export function TransactionFilter({
  children,
  hideCategorized,
}: {
  children?: React.ReactNode
  /** Hides the categorized dropdown when the page offers its own tabs for it. */
  hideCategorized?: boolean
}) {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Optimistic so each control shows the new choice straight away, while the results for it load.
  const [categorized, setCategorized] = useOptimistic(searchParams?.get('categorized') || 'any')
  const [autoOnly, setAutoOnly] = useOptimistic(searchParams?.get('auto') === 'true')
  const [selectedCategoryIds, setSelectedCategoryIds] = useOptimistic(
    searchParams?.get('categoryIds')?.split(',').filter(Boolean) || [],
  )
  const { categories } = useCategories()
  const [, startTransition] = useTransition()

  function handleCategorizedChange(event: SelectChangeEvent) {
    const categorized = event.target.value as string
    const categorizedParam = searchParams?.get('categorized') || 'any'
    if (categorizedParam !== categorized) {
      const url = updateSearchParamsUrl(pathname, searchParams, {
        categorized: categorized === 'any' ? null : categorized,
      })
      startTransition(() => {
        setCategorized(categorized)
        router.push(url)
      })
    }
  }

  function handleAutoChange(checked: boolean) {
    const url = updateSearchParamsUrl(pathname, searchParams, { auto: checked ? 'true' : null })
    startTransition(() => {
      setAutoOnly(checked)
      router.push(url)
    })
  }

  function handleCategoryChange(event: SelectChangeEvent<string[]>) {
    const value = event.target.value
    const categoryIds = typeof value === 'string' ? value.split(',').filter(Boolean) : value

    const url = updateSearchParamsUrl(pathname, searchParams, { categoryIds: categoryIds.join(',') })
    startTransition(() => {
      setSelectedCategoryIds(categoryIds)
      router.push(url)
    })
  }

  return (
    <Box>
      <Box
        p={4}
        display={'flex'}
        flexDirection={'row'}
        flexWrap={'wrap'}
        rowGap={2}
        justifyContent={'flex-end'}
        alignItems={'center'}
      >
        <Typography>{t('shared.filter')}</Typography>
        {!hideCategorized && (
          <Box ml={2}>
            <FormControl size={'small'} sx={{ minWidth: 8 }}>
              <InputLabel>{t('shared.categorized')}: </InputLabel>
              <Select
                value={categorized}
                label={t('shared.categorized')}
                onChange={handleCategorizedChange}
                sx={{ minWidth: 140, maxWidth: 140 }}
              >
                <MenuItem value={'any'}>{t('shared.any')}</MenuItem>
                <MenuItem value={'true'}>{t('shared.categorized')}</MenuItem>
                <MenuItem value={'false'}>{t('shared.uncategorized')}</MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}
        <Box ml={2}>
          <FormControl size={'small'}>
            <InputLabel>{t('shared.category')}: </InputLabel>
            <Select
              multiple
              value={selectedCategoryIds}
              label={t('shared.category')}
              onChange={handleCategoryChange}
              disabled={categorized === 'false'}
              renderValue={(selectedValues) =>
                selectedValues.length === 0
                  ? t('shared.any')
                  : categories
                      .filter((category) => selectedValues.includes(String(category.id)))
                      .map((category) => category.name)
                      .join(', ')
              }
              sx={{ minWidth: 220, maxWidth: 220 }}
            >
              {categories.map((category) => (
                <MenuItem key={category.nodeId} value={String(category.id)}>
                  <Checkbox checked={selectedCategoryIds.includes(String(category.id))} />
                  <ListItemText primary={category.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box ml={2}>
          <FormControlLabel
            control={<Checkbox checked={autoOnly} onChange={(event) => handleAutoChange(event.target.checked)} />}
            label={t('shared.autoCategorizedOnly')}
          />
        </Box>
        {children}
      </Box>
      <Divider />
    </Box>
  )
}
