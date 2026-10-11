'use client'

import { formatMoney } from '@/lib/formatMoney'
import { useColors } from '@/lib/useColors'
import { GetDailyCashFlowTransactionsDocument } from '@/graphql/operations'
import { useSuspenseQuery } from '@apollo/client/react'
import { Box, Divider, Typography, useTheme } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { differenceInCalendarDays, startOfMonth, endOfMonth, endOfDay } from 'date-fns'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useAppContext } from '../context/AppContextProvider'
import { useAmountVisibility } from '../context/AmountVisibilityContext'

export function DailySpendingLineChart() {
  const { bankAccounts } = useAppContext()
  const { hidden } = useAmountVisibility()
  const { dateFrom: rawDateFrom, dateTo: rawDateTo, dateRange } = useDateFilterParams()
  const today = useMemo(() => new Date(), [])
  // This chart bins transactions by day-of-month, so it only makes sense for a single month.
  const dateFrom = dateRange === 'month' && rawDateFrom ? rawDateFrom : startOfMonth(today)
  const dateTo = dateRange === 'month' && rawDateTo ? rawDateTo : endOfMonth(endOfDay(today))
  const bankAccountIds = useMemo(() => bankAccounts.map((ba) => ba.id), [bankAccounts])
  const { data } = useSuspenseQuery(GetDailyCashFlowTransactionsDocument, {
    variables: {
      filter: {
        bankAccountId: { in: bankAccountIds },
        posted: { greaterThanOrEqualTo: dateFrom, lessThan: dateTo },
        transferByTransactionSourceIdExists: false,
        transferByTransactionTargetIdExists: false,
      },
    },
  })
  const { getColors } = useColors()
  const theme = useTheme()
  const t = useTranslations('common')

  const numDays = Math.abs(differenceInCalendarDays(dateFrom, dateTo)) + 1
  const colorGradient = getColors(numDays)

  const transactionsByDay = useMemo(() => {
    const days = Array.from({ length: numDays }, (e, i: number) => ({
      label: `${i + 1}`,
      negativeValue: 0,
      positiveValue: 0,
      color: colorGradient[i],
    }))
    for (const transaction of data.allTransactions?.nodes ?? []) {
      const day = days[new Date(transaction.posted).getDate() - 1]
      if (!day) continue
      const amount = Number(transaction.amount)
      if (amount > 0) day.positiveValue += amount
      else day.negativeValue += amount
    }
    return days
  }, [data, colorGradient, numDays])

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
                <stop
                  offset="5%"
                  stopColor={theme.palette.primary.main}
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor={theme.palette.primary.main}
                  stopOpacity={1}
                />
              </linearGradient>
              <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={theme.palette.secondary.main}
                  stopOpacity={1}
                />
                <stop
                  offset="95%"
                  stopColor={theme.palette.secondary.main}
                  stopOpacity={0.4}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray={'3 3'}
              stroke={theme.palette.text.primary}
              strokeOpacity={0.2}
            />
            <XAxis
              dataKey={'label'}
              tick={{ stroke: theme.palette.text.primary, strokeWidth: 1 }}
            />
            <YAxis
              tick={{ stroke: theme.palette.text.primary, strokeWidth: 1 }}
              tickFormatter={(tick) => {
                return String(formatMoney(tick / 100, 'CAD', hidden))
              }}
            />
            <Tooltip
              formatter={(value, name, props) => {
                return [
                  formatMoney(Number(value) / 100, 'CAD', hidden),
                  t('shared.total'),
                ]
              }}
              // labelFormatter={(label: string) => `Day: ${label}`}
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
