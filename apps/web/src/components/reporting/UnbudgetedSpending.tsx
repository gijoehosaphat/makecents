'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Alert, AlertTitle, Box, Button, Typography } from '@mui/material'
import { useSuspenseQuery } from '@apollo/client/react'
import { useTranslations } from 'next-intl'
import { Transaction } from '@/graphql/types'
import { GetPeriodWithdrawalsDocument } from '@/graphql/operations'
import { useAppContext } from '../context/AppContextProvider'
import { Money } from '../shared/Money'
import TransactionsPreview from '../shared/TransactionsPreview'

/**
 * Spending in the month that no budget covers (uncategorized, or in a category outside every budget). It came out of
 * Ready to Assign, so it is listed for categorizing or for adding its categories to a budget.
 */
export function UnbudgetedSpending({
  dateFrom,
  dateTo,
  budgetedCategoryIds,
  currency,
  onReviewed,
}: {
  dateFrom: Date
  dateTo: Date
  budgetedCategoryIds: Set<number>
  currency: string
  /** Called when the transactions dialog closes, since recategorizing changes the budget figures. */
  onReviewed: () => void
}) {
  const t = useTranslations('common')
  const { bankAccounts, currentAccountId } = useAppContext()
  const bankAccountIds = useMemo(() => bankAccounts.map((bankAccount) => bankAccount.id), [bankAccounts])
  const withdrawals = useSuspenseQuery(GetPeriodWithdrawalsDocument, {
    variables: { bankAccountIds, dateFrom, dateTo },
  })
  const [preview, setPreview] = useState<string[] | null>(null)

  const { uncategorized, unbudgetedCategories } = useMemo(() => {
    const uncategorized: Transaction[] = []
    const byCategory = new Map<number, { id: number; name: string; total: number; transactions: Transaction[] }>()
    for (const transaction of (withdrawals.data.allTransactions?.nodes ?? []) as Transaction[]) {
      if (transaction.categoryId == null) {
        uncategorized.push(transaction)
      } else if (!transaction.categoryByCategoryId?.isPayroll && !budgetedCategoryIds.has(transaction.categoryId)) {
        const entry = byCategory.get(transaction.categoryId) ?? {
          id: transaction.categoryId,
          name: transaction.categoryByCategoryId?.name ?? '',
          total: 0,
          transactions: [],
        }
        entry.total -= Number(transaction.amount)
        entry.transactions.push(transaction)
        byCategory.set(transaction.categoryId, entry)
      }
    }
    return {
      uncategorized,
      unbudgetedCategories: [...byCategory.values()].sort((a, b) => b.total - a.total),
    }
  }, [withdrawals.data.allTransactions?.nodes, budgetedCategoryIds])
  const uncategorizedSpending = uncategorized.reduce((total, transaction) => total - Number(transaction.amount), 0)

  if (uncategorized.length === 0 && unbudgetedCategories.length === 0) return null

  return (
    <>
      <Alert
        severity={'warning'}
        sx={{ mt: 2 }}
        action={
          unbudgetedCategories.length > 0 && (
            <Button
              color={'inherit'}
              size={'small'}
              component={Link}
              href={`/${currentAccountId}/dashboard/settings/budgets`}
            >
              {t('budgets.unaccounted.openBudgetSettings')}
            </Button>
          )
        }
      >
        <AlertTitle>{t('budgets.unaccounted.title')}</AlertTitle>
        <Typography variant={'body2'} sx={{ mb: 1 }}>
          {t('budgets.unaccounted.help')}
        </Typography>
        {uncategorized.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ flex: 1 }}>
              {t('budgets.unaccounted.uncategorizedCount', { count: uncategorized.length })}
            </Typography>
            <Money amountInCents={uncategorizedSpending} currency={currency} colored={false} />
            <Button size={'small'} onClick={() => setPreview(uncategorized.map((transaction) => transaction.nodeId))}>
              {t('budgets.unaccounted.categorize')}
            </Button>
          </Box>
        )}
        {unbudgetedCategories.map((category) => (
          <Box key={category.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ flex: 1 }}>{category.name}</Typography>
            <Money amountInCents={category.total} currency={currency} colored={false} />
            <Button
              size={'small'}
              onClick={() => setPreview(category.transactions.map((transaction) => transaction.nodeId))}
            >
              {t('budgets.viewTransactions')}
            </Button>
          </Box>
        ))}
      </Alert>
      <TransactionsPreview
        nodeIds={preview}
        pool={(withdrawals.data.allTransactions?.nodes ?? []) as Transaction[]}
        refetchQuery={{ query: GetPeriodWithdrawalsDocument, variables: { bankAccountIds, dateFrom, dateTo } }}
        handleComplete={() => {
          setPreview(null)
          onReviewed()
        }}
      />
    </>
  )
}
