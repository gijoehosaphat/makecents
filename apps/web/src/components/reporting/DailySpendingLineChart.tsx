'use client'

import { formatMoney } from '@/lib/formatMoney'
import { useColors } from '@/lib/useColors'
import { Transaction } from '@/graphql/types'
import { Box, Divider, Typography, useTheme } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { differenceInCalendarDays } from 'date-fns'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useTransactions } from '@/lib/useTransactions'
import { useAppContext } from '../context/AppContextProvider'

export function DailySpendingLineChart() {
  const { bankAccounts } = useAppContext()
  const { dateFrom, dateTo } = useDateFilterParams()
  const { transactionsSansTransfers } = useTransactions({
    dateFrom,
    dateTo,
    bankAccountIds: bankAccounts.map((ba) => ba.id),
  })
  const { getColors } = useColors()
  const theme = useTheme()
  const t = useTranslations('common')

  const numDays = Math.abs(differenceInCalendarDays(dateFrom, dateTo)) + 1
  const colorGradient = getColors(numDays)

  const negativeTransactions = useMemo(() => {
    return transactionsSansTransfers.filter((transaction) => transaction.amount <= 0)
  }, [transactionsSansTransfers])

  const positiveTransactions = useMemo(() => {
    return transactionsSansTransfers.filter((transaction) => transaction.amount > 0)
  }, [transactionsSansTransfers])

  const transactionsByDay = useMemo(() => {
    return Array.from({ length: numDays }, (e, i: number) => {
      const day = i + 1
      const positiveDailyTransactions = positiveTransactions.filter(
        (transaction: Transaction) => new Date(transaction.posted).getDate() === day
      )
      const negativeDailyTransactions = negativeTransactions.filter(
        (transaction: Transaction) => new Date(transaction.posted).getDate() === day
      )
      const negativeValue = negativeDailyTransactions.reduce((partialSum, t) => partialSum + Number(t.amount), 0)
      const positiveValue = positiveDailyTransactions.reduce((partialSum, t) => partialSum + Number(t.amount), 0)
      return {
        label: `${day}`,
        negativeValue,
        positiveValue,
        color: colorGradient[i],
      }
    })
  }, [positiveTransactions, negativeTransactions, colorGradient, numDays])

  return (
    <>
      <Typography variant={'h2'} sx={{ mb: 2 }}>
        {t('reporting.dailySpendingTitle')}
      </Typography>
      <Divider />
      <Box sx={{ mt: 4, mb: 4, width: '100%', height: '50vh' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={transactionsByDay}
            margin={{
              top: 10,
              right: 30,
              left: 20,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={0.4} />
                <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={1} />
              </linearGradient>
              <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={theme.palette.secondary.main} stopOpacity={1} />
                <stop offset="95%" stopColor={theme.palette.secondary.main} stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray={'3 3'} stroke={theme.palette.text.primary} strokeOpacity={0.2} />
            <XAxis dataKey={'label'} tick={{ stroke: theme.palette.text.primary, strokeWidth: 1 }} />
            <YAxis
              tick={{ stroke: theme.palette.text.primary, strokeWidth: 1 }}
              tickFormatter={(tick) => {
                return String(formatMoney(tick / 100, 'CAD'))
              }}
            />
            <Tooltip
              formatter={(value, name, props) => {
                return [formatMoney(Number(value) / 100, 'CAD'), t('shared.total')]
              }}
              labelFormatter={(label: string) => `Day: ${label}`}
              contentStyle={{ backgroundColor: theme.palette.background.paper }}
              labelStyle={theme.typography.h3}
              itemStyle={{ color: theme.palette.text.primary }}
            />
            <Area
              type={'step'}
              dataKey={'positiveValue'}
              stroke={theme.palette.text.primary}
              strokeOpacity={0.3}
              fill={'url(#colorPositive)'}
            />
            <Area
              type={'step'}
              dataKey={'negativeValue'}
              stroke={theme.palette.text.primary}
              strokeOpacity={0.3}
              fill={'url(#colorNegative)'}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </>
  )
}
