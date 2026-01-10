import React, { useState } from 'react'
import { Collapse, List } from '@mui/material'
import { ExpandLess, ExpandMore, BarChart, Category, Paid, CurrencyExchange } from '@mui/icons-material'
import { useTranslations } from 'next-intl'
import { MainMenuItem } from '../shared/MainMenuItem'
import { useAppContext } from '../context/AppContextProvider'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

export function ReportingList() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { currentAccountId } = useAppContext()
  const t = useTranslations('common')
  const [listOpen, setListOpen] = useState(true)

  let queryString = searchParams?.toString()
  if (queryString) {
    queryString = `?${queryString}`
  }

  return (
    <>
      <MainMenuItem
        onClick={() => {
          setListOpen(!listOpen)
        }}
        primary={t('reporting.title')}
        secondary={undefined}
        icon={<BarChart fontSize={'large'} />}
        selected={false}
        dense={false}
      >
        {listOpen ? <ExpandLess /> : <ExpandMore />}
      </MainMenuItem>
      <List dense={true} disablePadding={true}>
        <Collapse in={listOpen} timeout={'auto'} unmountOnExit sx={{ pl: 3 }}>
          <MainMenuItem
            onClick={() => {
              router.push(`/${currentAccountId}/dashboard/reporting/budgets${queryString}`)
            }}
            primary={t('reporting.budgetsTitle')}
            icon={<Paid fontSize={'large'} />}
            selected={pathname?.startsWith(`/${currentAccountId}/dashboard/reporting/budgets`) || false}
            dense={true}
          />
          <MainMenuItem
            onClick={() => {
              router.push(`/${currentAccountId}/dashboard/reporting/daily${queryString}`)
            }}
            primary={t('reporting.dailySpendingTitle')}
            icon={<CurrencyExchange fontSize={'large'} />}
            selected={pathname?.startsWith(`/${currentAccountId}/dashboard/reporting/daily`) || false}
            dense={true}
          />
          <MainMenuItem
            onClick={() => {
              router.push(`/${currentAccountId}/dashboard/reporting/category${queryString}`)
            }}
            primary={t('reporting.categorySpendingTitle')}
            icon={<Category fontSize={'large'} />}
            selected={pathname?.startsWith(`/${currentAccountId}/dashboard/reporting/category`) || false}
            dense={true}
          />
        </Collapse>
      </List>
    </>
  )
}
