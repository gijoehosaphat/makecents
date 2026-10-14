'use client'

import { formatMoneyCents, formatMoney } from '@/lib/formatMoney'
import { GetDailyCashFlowTransactionsDocument } from '@/graphql/operations'
import { skipToken, useSuspenseQuery } from '@apollo/client/react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material'
import { ExpandMore } from '@mui/icons-material'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { addDays, differenceInCalendarDays, eachDayOfInterval, format, startOfDay, sub } from 'date-fns'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useAppContext } from '../context/AppContextProvider'

const DEFAULT_CURRENCY = 'CAD'
const DAY_KEY = 'yyyy-MM-dd'

interface DayBin {
  key: string
  date: Date
  label: string
  positiveValue: number
  negativeValue: number
  /** Running net from the start of the range; null for days that haven't happened yet. */
  cumulative: number | null
  isFuture: boolean
}

interface Totals {
  deposits: number
  withdrawals: number
  net: number
  avgDailySpend: number
}

function sumTransactions(transactions: { amount?: string | number | null }[], elapsedDays: number): Totals {
  let deposits = 0
  let withdrawals = 0
  for (const transaction of transactions) {
    const amount = Number(transaction.amount)
    if (amount > 0) deposits += amount
    else withdrawals += amount
  }
  return {
    deposits,
    withdrawals,
    net: deposits + withdrawals,
    avgDailySpend: elapsedDays > 0 ? withdrawals / elapsedDays : 0,
  }
}

function SummaryTile({
  label,
  cents,
  previousCents,
  currency,
  higherIsBetter,
  colored,
  comparisonLabel,
}: {
  label: string
  cents: number
  previousCents?: number
  currency: string
  /** Spending is stored negative, so a bigger (less negative) number is always better. */
  higherIsBetter: boolean
  colored?: boolean
  comparisonLabel: string
}) {
  const theme = useTheme()
  const { hidden } = useAmountVisibility()
  const delta = previousCents === undefined ? undefined : cents - previousCents
  const improved = delta === undefined ? undefined : higherIsBetter ? delta > 0 : delta < 0
  const deltaColor =
    delta === 0 || improved === undefined
      ? theme.palette.text.secondary
      : improved
        ? theme.palette.money.positive
        : theme.palette.money.negative
  const valueColor = !colored
    ? 'inherit'
    : cents > 0
      ? theme.palette.money.positive
      : cents < 0
        ? theme.palette.money.negative
        : theme.palette.text.secondary

  return (
    <Box sx={{ minWidth: 160 }}>
      <Typography variant={'h1'} sx={{ fontSize: 28, color: valueColor }}>
        {formatMoneyCents(cents, currency, hidden)}
      </Typography>
      <Typography variant={'h6'} sx={{ textTransform: 'uppercase' }}>
        {label}
      </Typography>
      {delta !== undefined && (
        <Typography variant={'body2'} sx={{ color: deltaColor }}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '–'} {formatMoneyCents(Math.abs(delta), currency, hidden)}{' '}
          {comparisonLabel}
        </Typography>
      )}
    </Box>
  )
}

export function DailySpendingLineChart() {
  const { bankAccounts, currentAccountId } = useAppContext()
  const { hidden } = useAmountVisibility()
  const { dateRange, dateFrom, dateTo } = useDateFilterParams()
  const router = useRouter()
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null)
  const today = useMemo(() => startOfDay(new Date()), [])

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

  const baseFilter = useMemo(
    () => ({
      bankAccountId: { in: bankAccountIds },
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
  const theme = useTheme()
  const t = useTranslations('common')

  const transactions = useMemo(() => data.allTransactions?.nodes ?? [], [data])

  const rangeStart = useMemo(() => {
    if (dateFrom) return startOfDay(dateFrom)
    // "All" range: span from the first transaction.
    const times = transactions.map((tx) => new Date(tx.posted).getTime())
    return times.length ? startOfDay(new Date(Math.min(...times))) : undefined
  }, [dateFrom, transactions])
  const rangeEnd = useMemo(() => {
    if (dateTo) return startOfDay(dateTo)
    const times = transactions.map((tx) => new Date(tx.posted).getTime())
    return times.length ? startOfDay(new Date(Math.max(...times))) : undefined
  }, [dateTo, transactions])

  // Days of the range that have already happened. A month in progress is compared like-for-like.
  const elapsedDays = useMemo(() => {
    if (!rangeStart || !rangeEnd) return 0
    const total = differenceInCalendarDays(rangeEnd, rangeStart) + 1
    return Math.max(0, Math.min(total, differenceInCalendarDays(today, rangeStart) + 1))
  }, [rangeStart, rangeEnd, today])

  // The period immediately before the selected one, truncated to the same number of elapsed days.
  const previousRange = useMemo(() => {
    if (!dateFrom || !dateTo || elapsedDays === 0) return undefined
    const totalDays = differenceInCalendarDays(startOfDay(dateTo), startOfDay(dateFrom)) + 1
    const from =
      dateRange === 'month'
        ? sub(dateFrom, { months: 1 })
        : dateRange === 'year'
          ? sub(dateFrom, { years: 1 })
          : addDays(dateFrom, -totalDays)
    return { from, to: addDays(from, elapsedDays) }
  }, [dateRange, dateFrom, dateTo, elapsedDays])

  const { data: previousData } = useSuspenseQuery(
    GetDailyCashFlowTransactionsDocument,
    previousRange
      ? {
          variables: {
            filter: {
              ...baseFilter,
              posted: { greaterThanOrEqualTo: previousRange.from, lessThan: previousRange.to },
            },
          },
        }
      : skipToken,
  )

  const totals = useMemo(() => sumTransactions(transactions, elapsedDays), [transactions, elapsedDays])
  const previousTotals = useMemo(
    () => (previousRange ? sumTransactions(previousData?.allTransactions?.nodes ?? [], elapsedDays) : undefined),
    [previousRange, previousData, elapsedDays],
  )

  const days = useMemo<DayBin[]>(() => {
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return []
    const shortRange = differenceInCalendarDays(rangeEnd, rangeStart) < 31
    const bins: DayBin[] = eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map((date) => ({
      key: format(date, DAY_KEY),
      date,
      label: format(date, shortRange ? 'd' : 'MMM d'),
      positiveValue: 0,
      negativeValue: 0,
      cumulative: 0,
      isFuture: date > today,
    }))
    const byKey = new Map(bins.map((bin) => [bin.key, bin]))
    for (const transaction of transactions) {
      const day = byKey.get(format(new Date(transaction.posted), DAY_KEY))
      if (!day) continue
      const amount = Number(transaction.amount)
      if (amount > 0) day.positiveValue += amount
      else day.negativeValue += amount
    }
    let running = 0
    for (const bin of bins) {
      running += bin.positiveValue + bin.negativeValue
      bin.cumulative = bin.isFuture ? null : running
    }
    return bins
  }, [transactions, rangeStart, rangeEnd, today])

  const todayKey = format(today, DAY_KEY)
  const showToday = days.some((day) => day.key === todayKey)
  const futureDays = days.filter((day) => day.isFuture)
  const comparisonLabel = t(
    dateRange === 'month'
      ? 'reporting.vsLastMonth'
      : dateRange === 'year'
        ? 'reporting.vsLastYear'
        : 'reporting.vsPreviousPeriod',
  )

  function openDay(day: DayBin) {
    const params = new URLSearchParams({ dateRange: 'custom', dateFrom: day.key, dateTo: day.key })
    if (bankAccountIds.length > 0) params.set('bankAccountIds', bankAccountIds.join(','))
    router.push(`/${currentAccountId}/dashboard/search?${params.toString()}`)
  }

  return (
    <>
      <Typography variant={'h2'} sx={{ mb: 2 }}>
        {t('reporting.dailySpendingTitle')}
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
        <SummaryTile
          label={t('shared.net')}
          cents={totals.net}
          previousCents={previousTotals?.net}
          currency={currency}
          higherIsBetter
          colored
          comparisonLabel={comparisonLabel}
        />
        <SummaryTile
          label={t('transactions.deposits')}
          cents={totals.deposits}
          previousCents={previousTotals?.deposits}
          currency={currency}
          higherIsBetter
          comparisonLabel={comparisonLabel}
        />
        <SummaryTile
          label={t('transactions.withdrawals')}
          cents={totals.withdrawals}
          previousCents={previousTotals?.withdrawals}
          currency={currency}
          higherIsBetter
          comparisonLabel={comparisonLabel}
        />
        <SummaryTile
          label={t('reporting.avgDailySpend')}
          cents={totals.avgDailySpend}
          previousCents={previousTotals?.avgDailySpend}
          currency={currency}
          higherIsBetter
          comparisonLabel={comparisonLabel}
        />
      </Box>
      <Divider />
      {transactions.length === 0 ? (
        <Box sx={{ p: 10, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Typography variant={'subtitle1'}>{t('reporting.noActivity')}</Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, mt: 3 }}>
            {[
              { label: t('transactions.deposits'), color: theme.palette.primary.main, line: false },
              { label: t('transactions.withdrawals'), color: theme.palette.secondary.main, line: false },
              { label: t('reporting.runningNet'), color: theme.palette.text.primary, line: true },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: item.line ? 16 : 12,
                    height: item.line ? 2 : 12,
                    bgcolor: item.color,
                  }}
                />
                <Typography variant="body2">{item.label}</Typography>
              </Box>
            ))}
          </Box>
          <Box
            sx={{ mt: 2, mb: 4, width: '100%', height: 'clamp(300px, 50vh, 600px)' }}
            role="img"
            aria-label={t('reporting.chartLabel')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={days}
                style={{ cursor: 'pointer' }}
                onClick={(state) => {
                  const day = days[Number(state?.activeIndex)]
                  if (day && !day.isFuture) openDay(day)
                }}
                margin={{
                  top: 10,
                  right: 20,
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
                <XAxis
                  dataKey={'key'}
                  minTickGap={16}
                  tick={{ fill: theme.palette.text.primary }}
                  tickFormatter={(key: string) => days.find((day) => day.key === key)?.label ?? key}
                />
                <YAxis
                  yAxisId="daily"
                  hide={hidden}
                  tick={{ fill: theme.palette.text.primary }}
                  tickFormatter={(tick) => String(formatMoney(tick / 100, currency, hidden))}
                />
                <YAxis
                  yAxisId="running"
                  hide={hidden}
                  orientation="right"
                  tick={{ fill: theme.palette.text.primary }}
                  tickFormatter={(tick) => String(formatMoney(tick / 100, currency, hidden))}
                />
                {futureDays.length > 0 && (
                  <ReferenceArea
                    yAxisId="daily"
                    x1={futureDays[0].key}
                    x2={futureDays[futureDays.length - 1].key}
                    fill={theme.palette.text.primary}
                    fillOpacity={0.08}
                    ifOverflow="visible"
                  />
                )}
                {showToday && (
                  <ReferenceLine
                    yAxisId="daily"
                    x={todayKey}
                    stroke={theme.palette.text.primary}
                    strokeDasharray="4 4"
                    label={{ value: t('reporting.today'), fill: theme.palette.text.primary, position: 'insideTopLeft' }}
                  />
                )}
                <Tooltip
                  content={({ active, payload }) => {
                    const day = active ? (payload?.[0]?.payload as DayBin | undefined) : undefined
                    if (!day) return null
                    const rows = [
                      [t('transactions.deposits'), day.positiveValue],
                      [t('transactions.withdrawals'), day.negativeValue],
                      [t('shared.net'), day.positiveValue + day.negativeValue],
                      ...(day.cumulative === null ? [] : [[t('reporting.runningNet'), day.cumulative] as const]),
                    ] as const
                    return (
                      <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', p: 1.5 }}>
                        <Typography variant="h3" sx={{ mb: 0.5 }}>
                          {format(day.date, 'EEE, MMM d, yyyy')}
                        </Typography>
                        {rows.map(([label, value]) => (
                          <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                            <Typography variant="body2">{label}</Typography>
                            <Typography variant="body2">{formatMoney(value / 100, currency, hidden)}</Typography>
                          </Box>
                        ))}
                        {!day.isFuture && (
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {t('reporting.clickToView')}
                          </Typography>
                        )}
                      </Box>
                    )
                  }}
                />
                <Area
                  yAxisId="daily"
                  type={'step'}
                  dataKey={'positiveValue'}
                  name={t('transactions.deposits')}
                  stroke={theme.palette.text.primary}
                  strokeOpacity={0.3}
                  fill={'url(#colorPositive)'}
                />
                <Area
                  yAxisId="daily"
                  type={'step'}
                  dataKey={'negativeValue'}
                  name={t('transactions.withdrawals')}
                  stroke={theme.palette.text.primary}
                  strokeOpacity={0.3}
                  fill={'url(#colorNegative)'}
                />
                <Line
                  yAxisId="running"
                  type={'monotone'}
                  dataKey={'cumulative'}
                  name={t('reporting.runningNet')}
                  stroke={theme.palette.text.primary}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Box>
          <Accordion disableGutters variant="outlined">
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography>{t('reporting.viewAsTable')}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ maxHeight: 400, overflow: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('shared.date')}</TableCell>
                    <TableCell align="right">{t('transactions.deposits')}</TableCell>
                    <TableCell align="right">{t('transactions.withdrawals')}</TableCell>
                    <TableCell align="right">{t('shared.net')}</TableCell>
                    <TableCell align="right">{t('reporting.runningNet')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {days
                    .filter((day) => !day.isFuture)
                    .map((day) => (
                      <TableRow key={day.key}>
                        <TableCell>{format(day.date, 'EEE, MMM d, yyyy')}</TableCell>
                        <TableCell align="right">{formatMoneyCents(day.positiveValue, currency, hidden)}</TableCell>
                        <TableCell align="right">{formatMoneyCents(day.negativeValue, currency, hidden)}</TableCell>
                        <TableCell align="right">
                          {formatMoneyCents(day.positiveValue + day.negativeValue, currency, hidden)}
                        </TableCell>
                        <TableCell align="right">{formatMoneyCents(day.cumulative ?? 0, currency, hidden)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </AccordionDetails>
          </Accordion>
        </>
      )}
    </>
  )
}
