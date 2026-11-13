'use client'

import { formatMoney, formatMoneyCents } from '@/lib/formatMoney'
import { GetDailyCashFlowTransactionsDocument } from '@/graphql/operations'
import { skipToken, useSuspenseQuery } from '@apollo/client/react'
import { Box, Divider, ToggleButton, ToggleButtonGroup, Typography, useTheme } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, differenceInCalendarDays, format, startOfDay, sub } from 'date-fns'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useAppContext } from '../context/AppContextProvider'

const DEFAULT_CURRENCY = 'CAD'

type Transaction = { posted?: string | null; amount?: string | number | null }

interface Point {
  index: number
  /** Date of this day in the selected period; undefined when the previous period is longer. */
  date?: Date
  previousDate?: Date
  /** Cumulative spend (positive cents); null for days that haven't happened yet or fall outside the period. */
  current: number | null
  previous: number | null
}

/** Cumulative spend per day from `start`, as positive cents. Withdrawals are stored negative. */
function cumulativeByDay(transactions: Transaction[], start: Date, days: number): number[] {
  const daily = new Array<number>(days).fill(0)
  for (const transaction of transactions) {
    if (!transaction.posted) continue
    const index = differenceInCalendarDays(new Date(transaction.posted), start)
    if (index < 0 || index >= days) continue
    daily[index] += -Number(transaction.amount)
  }
  let running = 0
  return daily.map((value) => (running += value))
}

export function SpendingLineChart() {
  const { bankAccounts } = useAppContext()
  const { hidden } = useAmountVisibility()
  const { dateRange, dateFrom, dateTo } = useDateFilterParams()
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null)
  const today = useMemo(() => startOfDay(new Date()), [])
  const theme = useTheme()
  const t = useTranslations('common')

  // Amounts in different currencies can't be added together, so chart one currency at a time.
  const currencies = useMemo(
    () =>
      Array.from(new Set(bankAccounts.map((ba) => ba.currency || DEFAULT_CURRENCY))).sort((a, b) => a.localeCompare(b)),
    [bankAccounts],
  )
  const currency =
    selectedCurrency && currencies.includes(selectedCurrency)
      ? selectedCurrency
      : currencies.includes(DEFAULT_CURRENCY)
        ? DEFAULT_CURRENCY
        : (currencies[0] ?? DEFAULT_CURRENCY)
  const bankAccountIds = useMemo(
    () => bankAccounts.filter((ba) => (ba.currency || DEFAULT_CURRENCY) === currency).map((ba) => ba.id),
    [bankAccounts, currency],
  )

  // Spending: money going out, excluding transfers between accounts.
  const baseFilter = useMemo(
    () => ({
      bankAccountId: { in: bankAccountIds },
      amount: { lessThan: '0' },
      transferByTransactionSourceIdExists: false,
      transferByTransactionTargetIdExists: false,
    }),
    [bankAccountIds],
  )

  const { data } = useSuspenseQuery(GetDailyCashFlowTransactionsDocument, {
    variables: {
      filter: {
        ...baseFilter,
        // No bounds for the "all" range.
        ...(dateFrom && dateTo ? { posted: { greaterThanOrEqualTo: dateFrom, lessThan: dateTo } } : {}),
      },
    },
  })
  const transactions = useMemo(() => data.allTransactions?.nodes ?? [], [data])

  const rangeStart = useMemo(() => {
    if (dateFrom) return startOfDay(dateFrom)
    // "All" range: span from the first transaction to the last.
    const times = transactions.map((tx) => new Date(tx.posted).getTime())
    return times.length ? startOfDay(new Date(Math.min(...times))) : undefined
  }, [dateFrom, transactions])
  const rangeEnd = useMemo(() => {
    if (dateTo) return startOfDay(dateTo)
    const times = transactions.map((tx) => new Date(tx.posted).getTime())
    return times.length ? startOfDay(new Date(Math.max(...times))) : undefined
  }, [dateTo, transactions])
  const totalDays = rangeStart && rangeEnd ? Math.max(0, differenceInCalendarDays(rangeEnd, rangeStart) + 1) : 0
  // Days of the range that have already happened.
  const elapsedDays = rangeStart ? Math.max(0, Math.min(totalDays, differenceInCalendarDays(today, rangeStart) + 1)) : 0

  // The whole period immediately before the selected one, so you can see where it ended up.
  const previousRange = useMemo(() => {
    if (!dateFrom || !dateTo) return undefined
    const from =
      dateRange === 'month'
        ? sub(dateFrom, { months: 1 })
        : dateRange === 'year'
          ? sub(dateFrom, { years: 1 })
          : addDays(dateFrom, -totalDays)
    const to = startOfDay(dateFrom)
    return { from, to, days: differenceInCalendarDays(to, from) }
  }, [dateRange, dateFrom, dateTo, totalDays])

  const { data: previousData } = useSuspenseQuery(
    GetDailyCashFlowTransactionsDocument,
    previousRange
      ? {
          variables: {
            filter: { ...baseFilter, posted: { greaterThanOrEqualTo: previousRange.from, lessThan: previousRange.to } },
          },
        }
      : skipToken,
  )

  const current = useMemo(
    () => (rangeStart ? cumulativeByDay(transactions, rangeStart, totalDays) : []),
    [transactions, rangeStart, totalDays],
  )
  const previous = useMemo(
    () =>
      previousRange
        ? cumulativeByDay(previousData?.allTransactions?.nodes ?? [], previousRange.from, previousRange.days)
        : [],
    [previousRange, previousData],
  )

  // Days are aligned by their position in the period (day 1 with day 1), so months of different lengths line up.
  const points = useMemo<Point[]>(() => {
    const length = Math.max(totalDays, previous.length)
    return Array.from({ length }, (_, index) => ({
      index,
      date: rangeStart && index < totalDays ? addDays(rangeStart, index) : undefined,
      previousDate: previousRange && index < previousRange.days ? addDays(previousRange.from, index) : undefined,
      current: index < elapsedDays ? current[index] : null,
      previous: index < previous.length ? previous[index] : null,
    }))
  }, [totalDays, previous, rangeStart, previousRange, elapsedDays, current])

  const spent = elapsedDays > 0 ? current[elapsedDays - 1] : 0
  // Compare like-for-like: last period at the same point, or its full total once this period is over.
  const previousAtThisPoint =
    previous.length > 0
      ? previous[Math.min(elapsedDays >= totalDays ? previous.length : elapsedDays, previous.length) - 1]
      : undefined
  const previousTotal = previous.length > 0 ? previous[previous.length - 1] : undefined
  const delta = previousAtThisPoint === undefined || elapsedDays === 0 ? undefined : spent - previousAtThisPoint

  const labels =
    dateRange === 'month'
      ? { current: t('reporting.thisMonth'), previous: t('reporting.lastMonth'), vs: t('reporting.vsLastMonth') }
      : dateRange === 'year'
        ? { current: t('reporting.thisYear'), previous: t('reporting.lastYear'), vs: t('reporting.vsLastYear') }
        : {
            current: t('reporting.thisPeriod'),
            previous: t('reporting.previousPeriod'),
            vs: t('reporting.vsPreviousPeriod'),
          }
  const shortRange = totalDays <= 31
  const todayIndex = elapsedDays > 0 && elapsedDays < totalDays ? elapsedDays - 1 : undefined
  const deltaColor =
    delta === undefined || delta === 0
      ? theme.palette.text.secondary
      : delta < 0
        ? theme.palette.money.positive
        : theme.palette.money.negative
  const currentColor = theme.palette.secondary.main
  const previousColor = theme.palette.text.secondary

  function formatTick(index: number) {
    const date = points[index]?.date ?? points[index]?.previousDate
    return date ? format(date, shortRange ? 'd' : 'MMM d') : ''
  }

  return (
    <>
      <Typography variant={'h2'} sx={{ mb: 2 }}>
        {t('reporting.spendingTitle')}
      </Typography>
      {currencies.length > 1 && (
        <ToggleButtonGroup
          exclusive
          size="small"
          value={currency}
          onChange={(_, value: string | null) => value && setSelectedCurrency(value)}
          sx={{ mb: 2 }}
        >
          {currencies.map((c) => (
            <ToggleButton key={c} value={c}>
              {c}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
      <Divider />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 6, rowGap: 3, py: 3 }}>
        <Box sx={{ minWidth: 160 }}>
          <Typography variant={'h1'} sx={{ fontSize: 28 }}>
            {formatMoneyCents(spent, currency, hidden)}
          </Typography>
          <Typography variant={'h6'} sx={{ textTransform: 'uppercase' }}>
            {t('reporting.spent')}
          </Typography>
          {delta !== undefined && (
            <Typography variant={'body2'} sx={{ color: deltaColor }}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '–'} {formatMoneyCents(Math.abs(delta), currency, hidden)}{' '}
              {labels.vs}
            </Typography>
          )}
        </Box>
        {previousTotal !== undefined && (
          <Box sx={{ minWidth: 160 }}>
            <Typography variant={'h1'} sx={{ fontSize: 28, color: 'text.secondary' }}>
              {formatMoneyCents(previousTotal, currency, hidden)}
            </Typography>
            <Typography variant={'h6'} sx={{ textTransform: 'uppercase' }}>
              {t('reporting.periodTotal', { period: labels.previous })}
            </Typography>
          </Box>
        )}
      </Box>
      <Divider />
      {transactions.length === 0 && previous.length === 0 ? (
        <Box sx={{ p: 10, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Typography variant={'subtitle1'}>{t('reporting.noActivity')}</Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, mt: 3 }}>
            {[
              { label: labels.current, color: currentColor, dashed: false },
              ...(previousRange ? [{ label: labels.previous, color: previousColor, dashed: true }] : []),
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{ width: 16, height: 0, borderTop: `2px ${item.dashed ? 'dashed' : 'solid'} ${item.color}` }}
                />
                <Typography variant="body2">{item.label}</Typography>
              </Box>
            ))}
          </Box>
          <Box
            sx={{ mt: 2, mb: 4, width: '100%', height: 'clamp(300px, 50vh, 600px)' }}
            role="img"
            aria-label={t('reporting.spendingChartLabel')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray={'3 3'} stroke={theme.palette.text.primary} strokeOpacity={0.2} />
                <XAxis
                  dataKey={'index'}
                  type={'number'}
                  domain={[0, Math.max(0, points.length - 1)]}
                  allowDecimals={false}
                  minTickGap={16}
                  tick={{ fill: theme.palette.text.primary }}
                  tickFormatter={formatTick}
                />
                <YAxis
                  hide={hidden}
                  tick={{ fill: theme.palette.text.primary }}
                  tickFormatter={(tick) => String(formatMoney(tick / 100, currency, hidden))}
                />
                {todayIndex !== undefined && (
                  <ReferenceLine
                    x={todayIndex}
                    stroke={theme.palette.text.primary}
                    strokeDasharray="4 4"
                    label={{ value: t('reporting.today'), fill: theme.palette.text.primary, position: 'insideTopLeft' }}
                  />
                )}
                <Tooltip
                  content={({ active, payload }) => {
                    const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined
                    if (!point) return null
                    const rows = [
                      ...(point.date && point.current !== null
                        ? [{ label: labels.current, date: point.date, value: point.current, color: currentColor }]
                        : []),
                      ...(point.previousDate && point.previous !== null
                        ? [
                            {
                              label: labels.previous,
                              date: point.previousDate,
                              value: point.previous,
                              color: previousColor,
                            },
                          ]
                        : []),
                    ]
                    if (rows.length === 0) return null
                    return (
                      <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', p: 1.5 }}>
                        {rows.map((row) => (
                          <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                            <Typography variant="body2" sx={{ color: row.color }}>
                              {row.label} · {format(row.date, 'EEE, MMM d, yyyy')}
                            </Typography>
                            <Typography variant="body2">{formatMoney(row.value / 100, currency, hidden)}</Typography>
                          </Box>
                        ))}
                      </Box>
                    )
                  }}
                />
                {previousRange && (
                  <Line
                    type={'monotone'}
                    dataKey={'previous'}
                    name={labels.previous}
                    stroke={previousColor}
                    strokeOpacity={0.6}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                <Line
                  type={'monotone'}
                  dataKey={'current'}
                  name={labels.current}
                  stroke={currentColor}
                  strokeWidth={3}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </>
      )}
    </>
  )
}
