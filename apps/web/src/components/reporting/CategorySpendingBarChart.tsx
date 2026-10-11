'use client'

import { formatMoney } from '@/lib/formatMoney'
import { Box, Divider, Typography, useTheme } from '@mui/material'
import { useTranslations } from 'next-intl'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useAppContext } from '../context/AppContextProvider'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { GetCategoryTotalsDocument } from '@/graphql/operations'
import { useSuspenseQuery } from '@apollo/client/react'
import { Category, CategoryGroup } from '@/graphql/types'
import { useMemo } from 'react'
import { useCategories } from '@/lib/useCategories'
import { useCategoryGroups } from '@/lib/useCategoryGroups'
import { groupBy } from '@/lib/groupBy'

interface ChartData {
  value: number
  label: string
  category: Category
}

function CustomizedAxisTick({
  x,
  y,
  stroke,
  payload,
}: {
  x?: number
  y?: number
  stroke?: number
  payload?: { label: string; value: number }
}) {
  const theme = useTheme()
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={4} textAnchor="end" fill={theme.palette.text.primary}>
        {payload?.value}
      </text>
    </g>
  )
}

function measureLabelWidth(labels: string[], font: string) {
  const ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (!ctx) return Math.max(0, ...labels.map((l) => l.length * 8))
  ctx.font = font
  return Math.max(0, ...labels.map((l) => ctx.measureText(l).width))
}

function CategoryBarChart({ title, data, yAxisWidth }: { title: string; data: ChartData[]; yAxisWidth: number }) {
  const t = useTranslations('common')
  const theme = useTheme()
  const { hidden } = useAmountVisibility()

  return (
    <>
      <Typography variant={'h2'} sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Divider />
      <Box sx={{ mt: 4, mb: 4, width: '100%', height: `${data.length * 35 + 40}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{
              top: 0,
              right: 10,
              left: 0,
              bottom: 10,
            }}
            barSize={10}
            layout={'vertical'}
          >
            <defs>
              <linearGradient id="colorPositive" x1="0" y1="0" x2="1" y2="0">
                <stop offset="5%" stopColor={theme.palette.primary.main} stopOpacity={1} />
                <stop offset="95%" stopColor={theme.palette.primary.main} stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="colorNegative" x1="0" y1="0" x2="1" y2="0">
                <stop offset="5%" stopColor={theme.palette.secondary.main} stopOpacity={0.4} />
                <stop offset="95%" stopColor={theme.palette.secondary.main} stopOpacity={1} />
              </linearGradient>
            </defs>
            <YAxis
              type={'category'}
              width={yAxisWidth}
              tick={<CustomizedAxisTick />}
              dataKey={'label'}
              stroke={theme.palette.text.primary}
              strokeOpacity={0.8}
            />
            <CartesianGrid strokeDasharray={'3 3'} stroke={theme.palette.text.primary} strokeOpacity={0.2} />
            <Tooltip
              cursor={{ fill: theme.palette.background.paper }}
              formatter={(value, name, props) => {
                return [formatMoney(Math.abs(Number(value)) / 100, 'CAD', hidden), t('shared.total')]
              }}
              contentStyle={{ backgroundColor: theme.palette.background.paper }}
              labelStyle={theme.typography.h3}
              itemStyle={{ color: theme.palette.text.primary }}
            />
            <Bar
              dataKey={'value'}
              background={{ fill: 'url(#colorPositive)', opacity: 0.2 }}
              stroke={theme.palette.text.primary}
              strokeOpacity={0.3}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={'url(#colorNegative)'} />
              ))}
            </Bar>
            <XAxis
              type={'number'}
              tick={{ stroke: theme.palette.text.primary, strokeWidth: 1 }}
              tickFormatter={(tick) => {
                return formatMoney(Math.abs(tick) / 100, 'CAD', hidden)
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </>
  )
}

export function CategorySpendingBarChart() {
  const t = useTranslations('common')
  const { bankAccounts } = useAppContext()
  const { dateFrom, dateTo } = useDateFilterParams()
  const bankAccountIds = useMemo(() => bankAccounts.map((ba) => ba.id), [bankAccounts])
  const { data: totalsData } = useSuspenseQuery(GetCategoryTotalsDocument, {
    variables: {
      filter: {
        bankAccountId: { in: bankAccountIds },
        // Uncategorized rows would group under a null key, which the schema's non-null `keys` can't return.
        categoryId: { isNull: false },
        ...(dateFrom !== undefined && dateTo !== undefined
          ? { posted: { greaterThanOrEqualTo: dateFrom, lessThan: dateTo } }
          : {}),
        transferByTransactionSourceIdExists: false,
        transferByTransactionTargetIdExists: false,
      },
    },
  })
  const { categories } = useCategories()
  const { categoryGroups } = useCategoryGroups()

  const data = useMemo(() => {
    const totals = new Map<string, number>()
    for (const group of totalsData.allTransactions?.groupedAggregates ?? []) {
      const categoryId = group.keys?.[0]
      if (categoryId == null) continue
      totals.set(categoryId, Number(group.sum?.amount ?? 0))
    }
    return (categories ?? [])
      .map((category) => ({
        label: category.name || '',
        value: Math.abs(totals.get(String(category.id)) ?? 0),
        category,
      }))
      .sort((a, b) => {
        if (a.label > b.label) return -1
        if (a.label < b.label) return 1
        return 0
      })
  }, [categories, totalsData])

  const ids = categoryGroups.map((cg) => cg.categoryId)
  const spending: ChartData[] = data.filter((cd) => !ids.includes(cd.category.id))

  const categoryGroupsByGroup = groupBy(
    categoryGroups,
    (cg: CategoryGroup) => cg.customCategoryGroupByCustomCategoryGroupId?.name || ''
  )

  const chartData = Object.keys(categoryGroupsByGroup).map((key) => {
    const cgCategoryIds = categoryGroupsByGroup[key].map((cg) => cg.categoryId)
    return {
      group: key,
      data: data.filter((cd) => cgCategoryIds.includes(cd.category.id)),
    }
  })

  // Shared across all groupings so every chart's plot area lines up.
  const fontFamily = useTheme().typography.fontFamily
  const yAxisWidth =
    Math.ceil(
      measureLabelWidth(
        [...spending, ...chartData.flatMap((cd) => cd.data)].map((d) => d.label),
        `16px ${fontFamily}`
      )
    ) + 16

  return (
    <>
      <CategoryBarChart title={t('reporting.categorySpendingTitle')} data={spending} yAxisWidth={yAxisWidth} />
      {chartData.map((cd) => (
        <CategoryBarChart key={cd.group} title={cd.group} data={cd.data} yAxisWidth={yAxisWidth} />
      ))}
    </>
  )
}
