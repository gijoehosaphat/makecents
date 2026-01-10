'use client'

import { useEffect, useState } from 'react'
import { IconButton, Box, Divider, Typography } from '@mui/material'
import { NavigateBefore, NavigateNext } from '@mui/icons-material'
import { format, add, isFuture, endOfMonth, startOfMonth, endOfDay } from 'date-fns'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function DateFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { dateFrom, dateTo } = useDateFilterParams()

  const handleChange = (diff: number) => {
    let queryParams: string[] = []
    if (searchParams) {
      for (let [key, value] of searchParams?.entries()) {
        if (key !== 'dateFrom' && key !== 'dateTo' && key !== 'page') {
          queryParams.push(`${key}=${value}`)
        }
      }
    }
    queryParams.push(`dateFrom=${format(startOfMonth(add(dateFrom, { months: diff })), 'yyyy-MM-dd')}`)
    queryParams.push(`dateTo=${format(endOfMonth(endOfDay(add(dateTo, { months: diff }))), 'yyyy-MM-dd')}`)
    router.push(`${pathname}?${queryParams.join('&')}`)
  }

  const nextDisabled = isFuture(add(dateFrom, { months: 1 }))

  return (
    <Box>
      <Box p={1} display={'flex'} flexDirection={'row'} justifyContent={'space-between'} alignItems={'center'}>
        <IconButton
          onClick={() => {
            handleChange(-1)
          }}
        >
          <NavigateBefore />
        </IconButton>
        <Typography variant={'h4'}>{format(dateTo, 'MMMM, yyyy')}</Typography>
        <IconButton
          disabled={nextDisabled}
          onClick={() => {
            handleChange(1)
          }}
        >
          <NavigateNext />
        </IconButton>
      </Box>
      <Divider />
    </Box>
  )
}
