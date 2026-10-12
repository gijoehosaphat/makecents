'use client'

import { updateSearchParamsUrl } from '@/lib/updateSearchParamsUrl'
import { useTransition } from 'react'
import { Box, Divider, FormControl, IconButton, MenuItem, Select, SelectChangeEvent, Typography } from '@mui/material'
import { NavigateBefore, NavigateNext } from '@mui/icons-material'
import { DatePicker } from '@mui/x-date-pickers'
import { format, add, isValid, isFuture, endOfMonth, startOfMonth, endOfYear, startOfYear, endOfDay } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useDateFilterParams, DateFilterMode } from '@/lib/useDateFilterParams'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function DateFilter({ allowCustom }: { allowCustom?: boolean }) {
  const t = useTranslations('common')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { dateRange, dateFrom, dateTo } = useDateFilterParams()
  const [, startTransition] = useTransition()

  const handleChange = (diff: number) => {
    if (dateRange === 'all' || !dateFrom || !dateTo) {
      return
    }

    const changes: Record<string, string> =
      dateRange === 'year'
        ? {
            dateFrom: format(startOfYear(add(dateFrom, { years: diff })), 'yyyy-MM-dd'),
            dateTo: format(endOfYear(endOfDay(add(dateTo, { years: diff }))), 'yyyy-MM-dd'),
          }
        : {
            dateFrom: format(startOfMonth(add(dateFrom, { months: diff })), 'yyyy-MM-dd'),
            dateTo: format(endOfMonth(endOfDay(add(dateTo, { months: diff }))), 'yyyy-MM-dd'),
          }

    startTransition(() => {
      router.push(updateSearchParamsUrl(pathname, searchParams, changes))
    })
  }

  const handleModeChange = (event: SelectChangeEvent) => {
    const newMode = event.target.value as DateFilterMode
    if (newMode === dateRange) {
      return
    }

    const today = new Date()
    const changes: Record<string, string | null> = { dateRange: newMode, dateFrom: null, dateTo: null }
    if (newMode === 'year') {
      changes.dateFrom = format(startOfYear(today), 'yyyy-MM-dd')
      changes.dateTo = format(endOfYear(endOfDay(today)), 'yyyy-MM-dd')
    } else if (newMode === 'custom') {
      // Start from whatever range is showing now so switching to custom doesn't jump around.
      changes.dateFrom = format(dateFrom ?? startOfMonth(today), 'yyyy-MM-dd')
      changes.dateTo = format(dateTo ?? endOfMonth(endOfDay(today)), 'yyyy-MM-dd')
    } else if (newMode === 'month') {
      changes.dateFrom = format(startOfMonth(today), 'yyyy-MM-dd')
      changes.dateTo = format(endOfMonth(endOfDay(today)), 'yyyy-MM-dd')
    }

    startTransition(() => {
      router.push(updateSearchParamsUrl(pathname, searchParams, changes))
    })
  }

  const handleCustomDateChange = (key: 'dateFrom' | 'dateTo', value: Date | null) => {
    if (!value || !isValid(value)) {
      return
    }
    startTransition(() => {
      router.push(updateSearchParamsUrl(pathname, searchParams, { dateRange: 'custom', [key]: format(value, 'yyyy-MM-dd') }))
    })
  }

  const arrowsDisabled = dateRange === 'all' || dateRange === 'custom' || !dateFrom || !dateTo
  const nextDisabled =
    arrowsDisabled || (dateFrom && isFuture(add(dateFrom, dateRange === 'year' ? { years: 1 } : { months: 1 })))

  const label =
    dateRange === 'all'
      ? t('dateFilter.allTime')
      : dateRange === 'custom'
        ? t('dateFilter.customRange')
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
            {(allowCustom || dateRange === 'custom') && (
              <MenuItem value={'custom'}>{t('dateFilter.customRange')}</MenuItem>
            )}
          </Select>
        </FormControl>
        {dateRange === 'custom' && dateFrom && dateTo && (
          <Box display={'flex'} alignItems={'center'} gap={1} ml={1}>
            <DatePicker
              value={dateFrom}
              maxDate={dateTo}
              onChange={(value) => handleCustomDateChange('dateFrom', value)}
              slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
            />
            <Typography>–</Typography>
            <DatePicker
              value={dateTo}
              minDate={dateFrom}
              onChange={(value) => handleCustomDateChange('dateTo', value)}
              slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
            />
          </Box>
        )}
        <IconButton disabled={!!nextDisabled} onClick={() => handleChange(1)}>
          <NavigateNext />
        </IconButton>
      </Box>
      <Divider />
    </Box>
  )
}
