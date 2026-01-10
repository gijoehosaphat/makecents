'use client'

import { useCategories } from '@/lib/useCategories'
import { Box, Divider, FormControl, InputLabel, MenuItem, Select, SelectChangeEvent, Typography } from '@mui/material'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export function TransactionFilter() {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [fields, setFields] = useState({
    categorized: searchParams?.get('categorized') || 'any',
    category: '-1',
  })
  const { categories } = useCategories()

  useEffect(() => {
    setFields({
      categorized: searchParams?.get('categorized') || 'any',
      category: searchParams?.get('category') || '-1',
    })
  }, [setFields, searchParams])

  function handleCategorizedChange(event: SelectChangeEvent) {
    const categorized = event.target.value as string
    let queryParams: string[] = []
    const categorizedParam = searchParams?.get('categorized') || 'any'
    if (categorizedParam !== categorized) {
      if (searchParams) {
        for (let [key, value] of searchParams?.entries()) {
          if (key !== 'categorized' && key !== 'page') {
            queryParams.push(`${key}=${value}`)
          }
        }
      }
      if (categorized !== 'any') {
        queryParams.push(`categorized=${categorized}`)
      }
      setTimeout(() => {
        router.push(`${pathname}?${queryParams.join('&')}`)
      }, 1)
    }
  }

  function handleCategoryChange(event: SelectChangeEvent) {
    const category = event.target.value as string
    let queryParams: string[] = []
    const categoryParam = searchParams?.get('category') || '-1'
    if (categoryParam !== category) {
      if (searchParams) {
        for (let [key, value] of searchParams?.entries()) {
          if (key !== 'category' && key !== 'page') {
            queryParams.push(`${key}=${value}`)
          }
        }
      }
      if (fields.categorized === 'any' && category !== '-1') {
        queryParams.push(`category=${category}`)
      }
      setTimeout(() => {
        router.push(`${pathname}?${queryParams.join('&')}`)
      }, 1)
    }
  }

  return (
    <Box>
      <Box p={4} display={'flex'} flexDirection={'row'} justifyContent={'flex-end'} alignItems={'center'}>
        <Typography>{t('shared.filter')}</Typography>
        <Box ml={2}>
          <FormControl size={'small'} sx={{ minWidth: 8 }}>
            <InputLabel>{t('shared.categorized')}: </InputLabel>
            <Select
              value={fields.categorized}
              label={'Category'}
              onChange={handleCategorizedChange}
              sx={{ minWidth: 140, maxWidth: 140 }}
              key={`category-${fields.categorized}`}
            >
              <MenuItem value={'any'}>{t('shared.any')}</MenuItem>
              <MenuItem value={'true'}>{t('shared.categorized')}</MenuItem>
              <MenuItem value={'false'}>{t('shared.uncategorized')}</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Box ml={2}>
          <FormControl size={'small'}>
            <InputLabel>{t('shared.category')}: </InputLabel>
            <Select
              value={fields.category}
              label={'Category'}
              onChange={handleCategoryChange}
              disabled={fields.categorized !== 'any'}
              sx={{ minWidth: 220, maxWidth: 220 }}
              key={`category-${fields.category}`}
            >
              <MenuItem value={'-1'}>None</MenuItem>
              {categories.map((category) => (
                <MenuItem key={category.nodeId} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Box>
      <Divider />
    </Box>
  )
}
