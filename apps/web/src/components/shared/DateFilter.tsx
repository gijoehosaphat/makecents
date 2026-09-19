'use client'

import { useTransition } from 'react'
import { Box, Divider, FormControl, IconButton, MenuItem, Select, SelectChangeEvent, Typography } from '@mui/material'
import { NavigateBefore, NavigateNext } from '@mui/icons-material'
import { format, add, isFuture, endOfMonth, startOfMonth, endOfYear, startOfYear, endOfDay } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useDateFilterParams, DateFilterMode } from '@/lib/useDateFilterParams'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function DateFilter() {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { dateRange, dateFrom, dateTo } = useDateFilterParams()
  const [, startTransition] = useTransition()

  const buildBaseQueryParams = (excludeKeys: string[]) => {
    let queryParams: string[] = []
    if (searchParams) {
      for (let [key, value] of searchParams.entries()) {
        if (!excludeKeys.includes(key)) {
          queryParams.push(`${key}=${value}`)
        }
      }
    }
    return queryParams
  }

  const handleChange = (diff: number) => {
    if (dateRange === 'all' || !dateFrom || !dateTo) {
      return
    }

    const queryParams = buildBaseQueryParams(['dateFrom', 'dateTo', 'page'])

    if (dateRange === 'year') {
      queryParams.push(`dateFrom=${format(startOfYear(add(dateFrom, { years: diff })), 'yyyy-MM-dd')}`)
      queryParams.push(`dateTo=${format(endOfYear(endOfDay(add(dateTo, { years: diff }))), 'yyyy-MM-dd')}`)
    } else {
      queryParams.push(`dateFrom=${format(startOfMonth(add(dateFrom, { months: diff })), 'yyyy-MM-dd')}`)
      queryParams.push(`dateTo=${format(endOfMonth(endOfDay(add(dateTo, { months: diff }))), 'yyyy-MM-dd')}`)
    }

    startTransition(() => {
      router.push(`${pathname}?${queryParams.join('&')}`)
    })
  }

  const handleModeChange = (event: SelectChangeEvent) => {
    const newMode = event.target.value as DateFilterMode
    if (newMode === dateRange) {
      return
    }

    const queryParams = buildBaseQueryParams(['dateFrom', 'dateTo', 'dateRange', 'page'])
    const today = new Date()

    queryParams.push(`dateRange=${newMode}`)
    if (newMode === 'year') {
      queryParams.push(`dateFrom=${format(startOfYear(today), 'yyyy-MM-dd')}`)
      queryParams.push(`dateTo=${format(endOfYear(endOfDay(today)), 'yyyy-MM-dd')}`)
    } else if (newMode === 'month') {
      queryParams.push(`dateFrom=${format(startOfMonth(today), 'yyyy-MM-dd')}`)
      queryParams.push(`dateTo=${format(endOfMonth(endOfDay(today)), 'yyyy-MM-dd')}`)
    }

    startTransition(() => {
      router.push(`${pathname}?${queryParams.join('&')}`)
    })
  }

  const arrowsDisabled = dateRange === 'all' || !dateFrom || !dateTo
  const nextDisabled =
    arrowsDisabled || (dateFrom && isFuture(add(dateFrom, dateRange === 'year' ? { years: 1 } : { months: 1 })))

  const label =
    dateRange === 'all'
      ? t('dateFilter.allTime')
      : dateRange === 'year'
        ? format(dateTo as Date, 'yyyy')
        : format(dateTo as Date, 'MMMM, yyyy')

  return (
    <Box>
      <Box p={1} display={'flex'} flexDirection={'row'} justifyContent={'space-between'} alignItems={'center'}>
        <IconButton disabled={arrowsDisabled} onClick={() => handleChange(-1)}>
          <NavigateBefore />
        </IconButton>
        <FormControl variant={'standard'}>
          <Select
            value={dateRange}
            onChange={handleModeChange}
            disableUnderline
            renderValue={() => <Typography variant={'h4'}>{label}</Typography>}
            sx={{
              '.MuiSelect-select': {
                display: 'flex',
                alignItems: 'center',
                paddingRight: '24px !important',
              },
            }}
          >
            <MenuItem value={'all'}>{t('dateFilter.allTime')}</MenuItem>
            <MenuItem value={'year'}>{t('dateFilter.currentYear')}</MenuItem>
            <MenuItem value={'month'}>{t('dateFilter.currentMonth')}</MenuItem>
          </Select>
        </FormControl>
        <IconButton disabled={!!nextDisabled} onClick={() => handleChange(1)}>
          <NavigateNext />
        </IconButton>
      </Box>
      <Divider />
    </Box>
  )
}
