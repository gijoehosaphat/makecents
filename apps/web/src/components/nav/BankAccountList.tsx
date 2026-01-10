import React, { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ListSubheader, Collapse, List } from '@mui/material'
import { AccountBalance, Wallet, Savings, CreditCard, ExpandLess, ExpandMore } from '@mui/icons-material'
import { useAppContext } from '@/components/context/AppContextProvider'
import { formatMoney } from '@/lib/formatMoney'
import { useTranslations } from 'next-intl'
import { MainMenuItem } from '../shared/MainMenuItem'

export function BankAccountList() {
  const pathname = usePathname()
  const { bankAccounts, currentAccountId } = useAppContext()
  const t = useTranslations('common')
  const router = useRouter()
  const searchParams = useSearchParams()
  const [listOpen, setListOpen] = useState(true)

  let totals: { [key: string]: number } = {}
  bankAccounts.forEach((bankAccount) => {
    if (bankAccount.currency && bankAccount.balance) {
      if (!totals[bankAccount.currency]) {
        totals[bankAccount.currency] = Number(bankAccount.balance)
      } else {
        totals[bankAccount.currency] += Number(bankAccount.balance)
      }
    }
  })
  let total: string[] = []
  Object.keys(totals).forEach((currency) => {
    total.push(formatMoney(totals[currency] / 100, currency || 'CAD'))
  })

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
        primary={t('dashboard.bankAccounts')}
        secondary={total.join(', ')}
        icon={<AccountBalance fontSize={'large'} />}
        selected={false}
        dense={false}
      >
        {listOpen ? <ExpandLess /> : <ExpandMore />}
      </MainMenuItem>
      <List dense={true} disablePadding={true}>
        <Collapse in={listOpen} timeout={'auto'} unmountOnExit sx={{ pl: 3 }}>
          {bankAccounts.map((bankAccount) => {
            let icon = <Wallet fontSize={'large'} />
            switch (bankAccount.type) {
              case 'CHECKING':
                icon = <Wallet fontSize={'large'} />
                break
              case 'SAVINGS':
                icon = <Savings fontSize={'large'} />
                break
              case 'CREDIT_CARD':
                icon = <CreditCard fontSize={'large'} />
                break
            }
            return (
              <MainMenuItem
                key={`${bankAccount.nodeId}`}
                onClick={() => {
                  router.push(`/${currentAccountId}/dashboard/bank-account/${bankAccount.id}${queryString}`)
                }}
                primary={bankAccount?.name || bankAccount?.type || ''}
                secondary={formatMoney(bankAccount.balance / 100, bankAccount?.currency || 'CAD')}
                icon={icon}
                selected={pathname === `/${currentAccountId}/dashboard/bank-account/${bankAccount.id}`}
                dense={true}
              />
            )
          })}
          {bankAccounts.length === 0 && <ListSubheader>{t('dashboard.noBankAccounts')}</ListSubheader>}
        </Collapse>
      </List>
    </>
  )
}
