'use client'

import { formatMoney, formatMoneyCents } from '@/lib/formatMoney'
import { GetDailyCashFlowTransactionsDocument, GetTransactionsSumDocument } from '@/graphql/operations'
import { skipToken, useSuspenseQuery } from '@apollo/client/react'
import { Box, Divider, MenuItem, TextField, Typography, useTheme } from '@mui/material'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { addDays, differenceInCalendarDays, format, max as maxDate, startOfDay } from 'date-fns'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useAppContext } from '../context/AppContextProvider'
import { useBankAccountLabel } from '../shared/BankAccountLabel'

const DEFAULT_CURRENCY = 'CAD'

interface Point {
  index: number
  date: Date
  /** Balance at the end of the day, in cents; null for days that haven't happened yet. */
  balance: number | null
}

export function BalanceLineChart() {
  const { bankAccounts } = useAppContext()
  const { hidden } = useAmountVisibility()
  const { dateFrom, dateTo } = useDateFilterParams()
  const accountLabel = useBankAccountLabel()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const today = useMemo(() => startOfDay(new Date()), [])
  const theme = useTheme()
  const t = useTranslations('common')

  // Open accounts first; closed ones are still selectable for looking back.
  const sortedBankAccounts = useMemo(
    () => [...bankAccounts.filter((ba) => !ba.closed), ...bankAccounts.filter((ba) => ba.closed)],
    [bankAccounts],
  )
  const bankAccountIdParam = Number(searchParams?.get('bankAccountId'))
  const bankAccount = sortedBankAccounts.find((ba) => ba.id === bankAccountIdParam) ?? sortedBankAccounts[0]
  const currency = bankAccount?.currency || DEFAULT_CURRENCY

  function selectBankAccount(id: number) {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('bankAccountId', String(id))
    router.replace(`${pathname}?${params.toString()}`)
  }

  const { data } = useSuspenseQuery(
    GetDailyCashFlowTransactionsDocument,
    bankAccount
      ? {
          variables: {
            filter: {
              bankAccountId: { equalTo: bankAccount.id },
              // No bounds for the "all" range.
              ...(dateFrom && dateTo ? { posted: { greaterThanOrEqualTo: dateFrom, lessThan: dateTo } } : {}),
            },
          },
        }
      : skipToken,
  )
  // Everything after the period, to work back from the account's current balance to the period's closing one.
  const { data: afterData } = useSuspenseQuery(
    GetTransactionsSumDocument,
    bankAccount && dateTo
      ? {
          variables: {
            filter: { bankAccountId: { equalTo: bankAccount.id }, posted: { greaterThanOrEqualTo: dateTo } },
          },
        }
      : skipToken,
  )
  const transactions = useMemo(() => data?.allTransactions?.nodes ?? [], [data])
  const sumAfter = Number(afterData?.allTransactions?.aggregates?.sum?.amount ?? 0)

  const rangeStart = useMemo(() => {
    if (dateFrom) return startOfDay(dateFrom)
    // "All" range: from the account's first transaction.
    const times = transactions.map((tx) => new Date(tx.posted).getTime())
    return times.length ? startOfDay(new Date(Math.min(...times))) : undefined
  }, [dateFrom, transactions])
  const rangeEnd = useMemo(() => {
    if (dateTo) return startOfDay(dateTo)
    // "All" range: up to today, or the last transaction if one is dated later.
    const times = transactions.map((tx) => new Date(tx.posted).getTime())
    return times.length ? maxDate([today, startOfDay(new Date(Math.max(...times)))]) : undefined
  }, [dateTo, transactions, today])
  const totalDays = rangeStart && rangeEnd ? Math.max(0, differenceInCalendarDays(rangeEnd, rangeStart) + 1) : 0
  // Days of the range that have already happened.
  const elapsedDays = rangeStart ? Math.max(0, Math.min(totalDays, differenceInCalendarDays(today, rangeStart) + 1)) : 0

  // End-of-day balances, worked backwards from the balance at the end of the period.
  const { balances, opening } = useMemo(() => {
    if (!bankAccount || !rangeStart) return { balances: [] as number[], opening: undefined }
    const daily = new Array<number>(totalDays).fill(0)
    for (const transaction of transactions) {
      if (!transaction.posted) continue
      const index = differenceInCalendarDays(new Date(transaction.posted), rangeStart)
      if (index < 0 || index >= totalDays) continue
      daily[index] += Number(transaction.amount)
    }
    const balances = new Array<number>(totalDays)
    let running = Number(bankAccount.balance ?? 0) - sumAfter
    for (let index = totalDays - 1; index >= 0; index--) {
      balances[index] = running
      running -= daily[index]
    }
    return { balances, opening: running }
  }, [bankAccount, rangeStart, totalDays, transactions, sumAfter])

  const points = useMemo<Point[]>(
    () =>
      rangeStart
        ? balances.map((balance, index) => ({
            index,
            date: addDays(rangeStart, index),
            balance: index < elapsedDays ? balance : null,
          }))
        : [],
    [balances, rangeStart, elapsedDays],
  )

  const shown = balances.slice(0, elapsedDays)
  const closing = shown.length > 0 ? shown[shown.length - 1] : undefined
  const isCurrent = elapsedDays < totalDays || !dateTo || dateTo >= today
  const change = closing !== undefined && opening !== undefined ? closing - opening : undefined
  const lowest = shown.length > 0 ? Math.min(...shown) : undefined
  const highest = shown.length > 0 ? Math.max(...shown) : undefined

  const shortRange = totalDays <= 31
  const todayIndex = elapsedDays > 0 && elapsedDays < totalDays ? elapsedDays - 1 : undefined
  const lineColor = theme.palette.secondary.main
  const changeColor =
    change === undefined || change === 0
      ? theme.palette.text.secondary
      : change > 0
        ? theme.palette.money.positive
        : theme.palette.money.negative

  function formatTick(index: number) {
    const date = points[index]?.date
    return date ? format(date, shortRange ? 'd' : 'MMM d') : ''
  }

  const stats = [
    { label: t('reporting.lowest'), value: lowest },
    { label: t('reporting.highest'), value: highest },
  ]

  return (
    <>
      <Typography variant={'h2'} sx={{ mb: 2 }}>
        {t('reporting.balanceTitle')}
      </Typography>
      {sortedBankAccounts.length === 0 || !bankAccount ? (
        <Box sx={{ p: 10, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Typography variant={'subtitle1'}>{t('dashboard.noBankAccounts')}</Typography>
        </Box>
      ) : (
        <>
          <TextField
            select
            size="small"
            label={t('transactions.bankAccount')}
            value={bankAccount.id}
            onChange={(event) => selectBankAccount(Number(event.target.value))}
            sx={{ mb: 2, minWidth: 260 }}
          >
            {sortedBankAccounts.map((ba) => (
              <MenuItem key={ba.id} value={ba.id}>
                {ba.closed ? `${accountLabel(ba)} (${t('dashboard.closed')})` : accountLabel(ba)}
              </MenuItem>
            ))}
          </TextField>
          <Divider />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 6, rowGap: 3, py: 3 }}>
            <Box sx={{ minWidth: 160 }}>
              <Typography variant={'h1'} sx={{ fontSize: 28 }}>
                {formatMoneyCents(closing ?? opening ?? Number(bankAccount.balance ?? 0), currency, hidden)}
              </Typography>
              <Typography variant={'h6'} sx={{ textTransform: 'uppercase' }}>
                {isCurrent ? t('reporting.currentBalance') : t('reporting.closingBalance')}
              </Typography>
              {change !== undefined && opening !== undefined && (
                <Typography variant={'body2'} sx={{ color: changeColor }}>
                  {change > 0 ? '▲' : change < 0 ? '▼' : '–'} {formatMoneyCents(Math.abs(change), currency, hidden)}
                  {' · '}
                  {t('reporting.openingBalance', { amount: formatMoneyCents(opening, currency, hidden) })}
                </Typography>
              )}
            </Box>
            {stats.map(
              (stat) =>
                stat.value !== undefined && (
                  <Box key={stat.label} sx={{ minWidth: 160 }}>
                    <Typography variant={'h1'} sx={{ fontSize: 28, color: 'text.secondary' }}>
                      {formatMoneyCents(stat.value, currency, hidden)}
                    </Typography>
                    <Typography variant={'h6'} sx={{ textTransform: 'uppercase' }}>
                      {stat.label}
                    </Typography>
                  </Box>
                ),
            )}
          </Box>
          <Divider />
          {points.length === 0 || elapsedDays === 0 ? (
            <Box sx={{ p: 10, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Typography variant={'subtitle1'}>{t('reporting.noActivity')}</Typography>
            </Box>
          ) : (
            <Box
              sx={{ mt: 3, mb: 4, width: '100%', height: 'clamp(300px, 50vh, 600px)' }}
              role="img"
              aria-label={t('reporting.balanceChartLabel')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={points} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                  <defs>
                    {/* Fades from 20% at the line down to transparent at the bottom of the chart. */}
                    <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                  {/* Fit the axis to the balances rather than starting at zero, so day-to-day movement shows. */}
                  <YAxis
                    hide={hidden}
                    domain={['auto', 'auto']}
                    tick={{ fill: theme.palette.text.primary }}
                    tickFormatter={(tick) => String(formatMoney(tick / 100, currency, hidden))}
                  />
                  {lowest !== undefined && highest !== undefined && lowest < 0 && highest > 0 && (
                    <ReferenceLine y={0} stroke={theme.palette.text.primary} strokeOpacity={0.6} />
                  )}
                  {todayIndex !== undefined && (
                    <ReferenceLine
                      x={todayIndex}
                      stroke={theme.palette.text.primary}
                      strokeDasharray="4 4"
                      label={{
                        value: t('reporting.today'),
                        fill: theme.palette.text.primary,
                        position: 'insideTopLeft',
                      }}
                    />
                  )}
                  <Tooltip
                    content={({ active, payload }) => {
                      const point = active ? (payload?.[0]?.payload as Point | undefined) : undefined
                      if (!point || point.balance === null) return null
                      return (
                        <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', p: 1.5 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                            <Typography variant="body2" sx={{ color: lineColor }}>
                              {format(point.date, 'EEE, MMM d, yyyy')}
                            </Typography>
                            <Typography variant="body2">
                              {formatMoney(point.balance / 100, currency, hidden)}
                            </Typography>
                          </Box>
                        </Box>
                      )
                    }}
                  />
                  <Area
                    type={'monotone'}
                    dataKey={'balance'}
                    name={t('reporting.balanceTitle')}
                    stroke={lineColor}
                    strokeWidth={3}
                    fill={'url(#balanceFill)'}
                    baseValue={'dataMin'}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
          )}
        </>
      )}
    </>
  )
}
