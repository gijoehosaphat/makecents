'use client'

import { useMemo } from 'react'
import { Alert, Box, Button, Typography } from '@mui/material'
import { useSuspenseQuery } from '@apollo/client/react'
import { useTranslations } from 'next-intl'
import { startOfMonth, subMonths } from 'date-fns'
import { Category } from '@/graphql/types'
import { GetPayrollCandidatesDocument, UpdateCategoryDocument } from '@/graphql/operations'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { useAppContext } from '../context/AppContextProvider'
import { Money } from '../shared/Money'

/** How many full months before the current one are searched for deposits that could be pay. */
const HISTORY_MONTHS = 6

/**
 * Shown while no category is marked as payroll: pay is what fills Ready to Assign, so this offers the largest
 * categorized deposits of recent months to mark.
 */
export function PayrollPrompt({ currency }: { currency: string }) {
  const t = useTranslations('common')
  const { bankAccounts } = useAppContext()
  const bankAccountIds = useMemo(() => bankAccounts.map((bankAccount) => bankAccount.id), [bankAccounts])
  const monthStart = useMemo(() => startOfMonth(new Date()), [])
  const candidates = useSuspenseQuery(GetPayrollCandidatesDocument, {
    variables: { bankAccountIds, dateFrom: subMonths(monthStart, HISTORY_MONTHS), dateTo: monthStart },
  })
  const [updateCategory] = useMutationWithToast(UpdateCategoryDocument, {
    refetchQueries: 'active',
    showServerMessage: true,
    errorMessage: t('budgets.payroll.markFailed'),
  })

  // Deposit categories that could be payroll, biggest first.
  const payrollCandidates = useMemo(() => {
    const totals = new Map<number, { category: Category; total: number }>()
    for (const transaction of candidates.data.allTransactions?.nodes ?? []) {
      const category = transaction.categoryByCategoryId as Category | null | undefined
      if (!category) continue
      const entry = totals.get(category.id) ?? { category, total: 0 }
      entry.total += Number(transaction.amount)
      totals.set(category.id, entry)
    }
    return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, 8)
  }, [candidates.data.allTransactions?.nodes])

  async function markPayroll(category: Category) {
    try {
      await updateCategory({ variables: { nodeId: category.nodeId, name: category.name, kind: 'payroll' } })
    } catch {
      // Reported by the mutation hook.
    }
  }

  return (
    <Alert severity={'info'} sx={{ mb: 2 }}>
      <Typography variant={'body2'}>{t('budgets.payroll.noPayroll')}</Typography>
      {payrollCandidates.length > 0 && (
        <>
          <Typography variant={'body2'} sx={{ mt: 1, mb: 1 }}>
            {t('budgets.payroll.candidates')}
          </Typography>
          {payrollCandidates.map(({ category, total }) => (
            <Box key={category.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ flex: 1 }}>{category.name}</Typography>
              <Money amountInCents={total} currency={currency} colored={false} />
              <Button size={'small'} onClick={() => markPayroll(category)}>
                {t('budgets.payroll.mark')}
              </Button>
            </Box>
          ))}
        </>
      )}
    </Alert>
  )
}
