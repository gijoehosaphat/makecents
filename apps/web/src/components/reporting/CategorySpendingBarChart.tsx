'use client'

import { formatMoney } from '@/lib/formatMoney'
import { Box, Divider, Typography, useTheme } from '@mui/material'
import { useTranslations } from 'next-intl'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useAppContext } from '../context/AppContextProvider'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useTransactions } from '@/lib/useTransactions'
import { Category, CategoryGroup, Transaction } from '@/graphql/types'
import { useMemo } from 'react'
import { useCategories } from '@/lib/useCategories'
import { useCategoryGroups } from '@/lib/useCategoryGroups'
import { groupBy } from '@/lib/groupBy'

interface TransactionsByCategory {
  category: Category
  transactions: Transaction[]
}

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

function CategoryBarChart({ title, data }: { title: string; data: ChartData[] }) {
  const t = useTranslations('common')
  const theme = useTheme()

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
              left: 70,
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
              tick={<CustomizedAxisTick />}
              dataKey={'label'}
              stroke={theme.palette.text.primary}
              strokeOpacity={0.8}
            />
            <CartesianGrid strokeDasharray={'3 3'} stroke={theme.palette.text.primary} strokeOpacity={0.2} />
            <Tooltip
              cursor={{ fill: theme.palette.background.paper }}
              formatter={(value, name, props) => {
                return [formatMoney(Math.abs(Number(value)) / 100, 'CAD'), t('shared.total')]
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
                return formatMoney(Math.abs(tick) / 100, 'CAD')
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
  const { transactionsSansTransfers } = useTransactions({
    dateFrom,
    dateTo,
    bankAccountIds: bankAccounts.map((ba) => ba.id),
    // excludeSplitTransactions: false,
  })
  const { categories } = useCategories()
  const { categoryGroups } = useCategoryGroups()

  const transactionsByCategory: TransactionsByCategory[] = useMemo(() => {
    return categories?.map((category) => {
      return {
        category,
        transactions: transactionsSansTransfers.filter((t) => t.categoryId === category.id),
      }
    })
  }, [categories, transactionsSansTransfers])

  const data = useMemo(() => {
    return transactionsByCategory
      .map((tbc) => {
        return {
          label: tbc.category.name || '',
          value: Math.abs(tbc.transactions.reduce((partialSum, t) => partialSum + Number(t.amount), 0)),
          category: tbc.category,
        }
      })
      .sort((a, b) => {
        if (a.label > b.label) return -1
        if (a.label < b.label) return 1
        return 0
      })
  }, [transactionsByCategory])

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

  return (
    <>
      <CategoryBarChart title={t('reporting.categorySpendingTitle')} data={spending} />
      {chartData.map((cd) => (
        <CategoryBarChart key={cd.group} title={cd.group} data={cd.data} />
      ))}
    </>
  )
}
