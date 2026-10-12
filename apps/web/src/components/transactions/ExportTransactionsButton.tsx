'use client'

import { Button } from '@mui/material'
import { FileDownload } from '@mui/icons-material'
import { useApolloClient } from '@apollo/client/react'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Transaction } from '@/graphql/types'
import { useAppContext } from '../context/AppContextProvider'
import { useBankAccountLabel } from '../shared/BankAccountLabel'
import { useCategories } from '@/lib/useCategories'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useBankAccountFilterParams } from '@/lib/useBankAccountFilterParams'
import { useTransactionFilterParams } from '@/lib/useTransactionFilterParams'
import { useTransactionAmountParams } from '@/lib/useTransactionAmountParams'
import { useTransactionSearchParams } from '@/lib/useTransactionSearchParams'
import { useTransactionSortParams } from '@/lib/useTransactionSortParams'
import { buildFilteredTransactionsRequest } from '@/lib/useFilteredTransactions'
import { buildTransactionsCsv } from '@/lib/transactionsCsv'

const PAGE_SIZE = 1000

/** Downloads every transaction matching the current filters (not just the visible page) as a CSV file. */
export function ExportTransactionsButton() {
  const t = useTranslations('common')
  const client = useApolloClient()
  const { bankAccounts } = useAppContext()
  const accountLabel = useBankAccountLabel()
  const { categories } = useCategories()
  const { dateFrom, dateTo } = useDateFilterParams()
  const { categorized, categoryIds } = useTransactionFilterParams()
  const { bankAccountIds: selectedBankAccountIds } = useBankAccountFilterParams()
  const { direction, amountMin, amountMax } = useTransactionAmountParams()
  const { search } = useTransactionSearchParams()
  const { sort } = useTransactionSortParams()
  const [exporting, setExporting] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleExport() {
    setExporting(true)
    setFailed(false)
    try {
      const bankAccountIds = selectedBankAccountIds || bankAccounts.map((bankAccount) => bankAccount.id)
      const transactions: Transaction[] = []

      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { document: query, variables } = buildFilteredTransactionsRequest({
          limit: PAGE_SIZE,
          offset,
          bankAccountIds,
          dateFrom,
          dateTo,
          categorized,
          categoryIds,
          direction,
          amountMin,
          amountMax,
          search,
          sort,
        })
        const result = await client.query({ query: query as any, variables: variables as any, fetchPolicy: 'network-only' })
        const data = result.data as {
          transactionSearch?: { nodes: Transaction[] } | null
          allTransactions?: { nodes: Transaction[] } | null
        }
        const nodes = (data?.transactionSearch ?? data?.allTransactions)?.nodes || []
        transactions.push(...nodes)
        if (nodes.length < PAGE_SIZE) {
          break
        }
      }

      const csv = buildTransactionsCsv(transactions, {
        accountLabel: (bankAccountId) => accountLabel(bankAccounts.find((account) => account.id === bankAccountId)),
        categoryName: (categoryId) => categories.find((category) => category.id === categoryId)?.name || '',
      })

      const range = dateFrom && dateTo ? `${format(dateFrom, 'yyyy-MM-dd')}_${format(dateTo, 'yyyy-MM-dd')}` : 'all'
      const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
      const link = createDownloadLink(url, `transactions-${range}.csv`)
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setFailed(true)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button
      size={'small'}
      startIcon={<FileDownload />}
      onClick={handleExport}
      disabled={exporting}
      color={failed ? 'error' : 'primary'}
    >
      {failed ? t('transactions.exportFailed') : exporting ? t('transactions.exporting') : t('transactions.exportCsv')}
    </Button>
  )
}

function createDownloadLink(url: string, filename: string) {
  const link = window.document.createElement('a')
  link.href = url
  link.download = filename
  return link
}
