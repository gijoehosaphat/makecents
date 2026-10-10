'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Alert, AlertTitle, Box, Button, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { useSuspenseQuery } from '@apollo/client/react'
import { useTranslations } from 'next-intl'
import { Category, Transaction } from '@/graphql/types'
import { useMutation } from '@apollo/client/react'
import { useSnackbar } from 'notistack'
import TransactionsPreview from '../shared/TransactionsPreview'
import { subMonths, startOfMonth } from 'date-fns'
import { useAppContext } from '../context/AppContextProvider'
import { useCategories } from '@/lib/useCategories'
import { Money } from '../shared/Money'
import { formatMoneyCents } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { expectedMonthlyIncome } from '@/lib/budgetMath'
import {
  GetBudgetPeriodTotalsDocument,
  GetPayrollCandidatesDocument,
  GetPayrollTransactionsDocument,
  UpdateCategoryDocument,
  GetPeriodWithdrawalsDocument,
} from '@/graphql/operations'

/** How many full months before the selected one are used to estimate income. */
const HISTORY_MONTHS = 6

function Row({
  label,
  caption,
  amountInCents,
  actual,
  actualLabel,
  actualCaption,
  currency,
  strong = false,
  colored = false,
}: {
  label: string
  caption?: string
  amountInCents: number
  /** The matching figure for the selected month, shown in the second column. */
  actual?: number
  actualLabel?: string
  actualCaption?: string
  currency: string
  strong?: boolean
  colored?: boolean
}) {
  const weight = strong ? 'bold' : undefined
  return (
    <TableRow sx={{ '& td': { verticalAlign: 'top' } }}>
      <TableCell>
        <Typography fontWeight={weight}>{label}</Typography>
        {caption && (
          <Typography variant={'caption'} color={'text.secondary'}>
            {caption}
          </Typography>
        )}
      </TableCell>
      <TableCell align={'right'}>
        <Typography fontWeight={weight}>
          <Money amountInCents={amountInCents} currency={currency} colored={colored} />
        </Typography>
      </TableCell>
      <TableCell>
        {actualLabel && (
          <>
            <Typography fontWeight={weight}>{actualLabel}</Typography>
            {actualCaption && (
              <Typography variant={'caption'} color={'text.secondary'}>
                {actualCaption}
              </Typography>
            )}
          </>
        )}
      </TableCell>
      <TableCell align={'right'}>
        {actual !== undefined && (
          <Typography fontWeight={weight}>
            <Money amountInCents={actual} currency={currency} colored={colored} />
          </Typography>
        )}
      </TableCell>
    </TableRow>
  )
}

/**
 * The monthly plan: expected income (the median monthly pay of each payroll category), the fixed and accruing
 * budgets set against it, and what is left over (the implied savings), next to how the selected month is actually
 * going. Only payroll categories feed the estimate, so a windfall counts towards what was actually saved but never
 * raises the amount available to budget.
 */
export function BudgetPlan({
  dateFrom,
  dateTo,
  fixedBudgeted,
  accruingBudgeted,
  fundBalance,
  fixedSpend,
  fundSpend,
  budgetedCategoryIds,
  currency,
}: {
  dateFrom: Date
  dateTo: Date
  /** Monthly total of the fixed budgets. */
  fixedBudgeted: number
  /** Monthly total of the accruing budgets (funds), which are set aside every month whether or not they are spent. */
  accruingBudgeted: number
  /** Combined balance of every fund as of the end of the selected month. */
  fundBalance: number
  /** Money out of categories in fixed budgets this month, before refunds. */
  fixedSpend: number
  /** Money out of categories only in accruing budgets this month, before refunds. */
  fundSpend: number
  /** Every category that belongs to at least one budget. */
  budgetedCategoryIds: Set<number>
  currency: string
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const { bankAccounts, currentAccountId } = useAppContext()

  const bankAccountIds = useMemo(() => bankAccounts.map((bankAccount) => bankAccount.id), [bankAccounts])
  const monthStart = useMemo(() => startOfMonth(dateFrom), [dateFrom])
  const historyStart = useMemo(() => subMonths(monthStart, HISTORY_MONTHS), [monthStart])

  const month = useSuspenseQuery(GetBudgetPeriodTotalsDocument, { variables: { bankAccountIds, dateFrom, dateTo } })
  const withdrawals = useSuspenseQuery(GetPeriodWithdrawalsDocument, {
    variables: { bankAccountIds, dateFrom, dateTo },
  })
  const candidates = useSuspenseQuery(GetPayrollCandidatesDocument, {
    variables: { bankAccountIds, dateFrom: historyStart, dateTo: monthStart },
  })
  const { enqueueSnackbar } = useSnackbar()
  const [updateCategory] = useMutation(UpdateCategoryDocument, { refetchQueries: 'active' })
  // Load categories with the page: the transactions dialog's category editors need them, and suspending when the
  // dialog opens would blank the whole page (and leave the body scroll-locked).
  useCategories()
  const [preview, setPreview] = useState<string[] | null>(null)
  const payroll = useSuspenseQuery(GetPayrollTransactionsDocument, {
    variables: { bankAccountIds, dateFrom: historyStart, dateTo: monthStart },
  })

  const sum = (value: unknown) => Number(value ?? 0)

  const income = useMemo(
    () => expectedMonthlyIncome(payroll.data.allTransactions?.nodes ?? [], historyStart, HISTORY_MONTHS),
    [payroll.data.allTransactions?.nodes, historyStart],
  )
  const expectedIncome = income?.expected ?? 0
  const incomeSourceNames = useMemo(() => {
    const names = new Map<number, string>()
    for (const transaction of payroll.data.allTransactions?.nodes ?? []) {
      if (transaction.categoryByCategoryId) names.set(transaction.categoryByCategoryId.id, transaction.categoryByCategoryId.name ?? '')
    }
    return (income?.sources ?? []).map((source) => (source.categoryId == null ? '' : names.get(source.categoryId) ?? '')).filter(Boolean)
  }, [payroll.data.allTransactions?.nodes, income?.sources])

  // Deposit categories that could be payroll, biggest first, so the right ones can be marked explicitly.
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
      await updateCategory({
        variables: { nodeId: category.nodeId, name: category.name, regex: category.regex, kind: 'payroll' },
      })
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('budgets.plan.payrollMarkFailed'), { variant: 'error' })
    }
  }
  const totalBudgeted = fixedBudgeted + accruingBudgeted
  const impliedSavings = expectedIncome - totalBudgeted

  const deposits = sum(month.data.deposits?.aggregates?.sum?.amount)
  const totalSpending = -sum(month.data.withdrawals?.aggregates?.sum?.amount)
  // Total spending is what actually moved the account balances this month, including what was paid out of funds.
  const saved = deposits - totalSpending
  // Spending that no budget accounts for: transactions with no category, and categories that are in no budget.
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
  const unbudgetedSpending = unbudgetedCategories.reduce((total, category) => total + category.total, 0)

  const spendingCaption =
    [
      unbudgetedSpending > 0
        ? t('budgets.plan.unbudgeted', { amount: formatMoneyCents(unbudgetedSpending, currency, hidden) })
        : null,
      uncategorizedSpending > 0
        ? t('budgets.plan.uncategorized', { amount: formatMoneyCents(uncategorizedSpending, currency, hidden) })
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined

  return (
    <Paper variant={'outlined'} sx={{ p: 2 }}>
      {!income && (
        <Alert severity={'info'} sx={{ mb: 1 }}>
          <Typography variant={'body2'}>{t('budgets.plan.noPayroll')}</Typography>
          {payrollCandidates.length > 0 && (
            <>
              <Typography variant={'body2'} sx={{ mt: 1, mb: 1 }}>
                {t('budgets.plan.payrollCandidates')}
              </Typography>
              {payrollCandidates.map(({ category, total }) => (
                <Box key={category.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ flex: 1 }}>{category.name}</Typography>
                  <Money amountInCents={total} currency={currency} colored={false} />
                  <Button size={'small'} onClick={() => markPayroll(category)}>
                    {t('budgets.plan.markPayroll')}
                  </Button>
                </Box>
              ))}
            </>
          )}
        </Alert>
      )}
      <Table size={'small'} sx={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: '30%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '30%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <TableHead>
          <TableRow>
            <TableCell colSpan={2}>
              <Typography variant={'h4'}>{t('budgets.plan.title')}</Typography>
            </TableCell>
            <TableCell colSpan={2}>
              <Typography variant={'h4'}>{t('budgets.plan.thisMonth')}</Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <Row
            label={t('budgets.plan.expectedIncome')}
            caption={
              income
                ? [
                    t('budgets.plan.expectedIncomeBasis', { months: income.months }),
                    incomeSourceNames.length > 0
                      ? t('budgets.plan.expectedIncomeSources', { names: incomeSourceNames.join(', ') })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : undefined
            }
            amountInCents={expectedIncome}
            actualLabel={t('budgets.plan.deposits')}
            actual={deposits}
            currency={currency}
          />
          <Row
            label={t('budgets.plan.fixedBudgets')}
            amountInCents={-fixedBudgeted}
            actualLabel={t('budgets.plan.spentFromFixed')}
            actual={fixedSpend}
            currency={currency}
          />
          <Row
            label={t('budgets.plan.accruingBudgets')}
            caption={t('budgets.plan.accruingBudgetsCaption', {
              balance: formatMoneyCents(fundBalance, currency, hidden),
            })}
            amountInCents={-accruingBudgeted}
            actualLabel={t('budgets.plan.spentFromAccruing')}
            actual={fundSpend}
            currency={currency}
          />
          <Row
            label={t('budgets.plan.totalBudgeted')}
            amountInCents={-totalBudgeted}
            actualLabel={t('budgets.plan.spending')}
            actualCaption={spendingCaption}
            actual={totalSpending}
            currency={currency}
          />
          <Row
            label={impliedSavings < 0 ? t('budgets.plan.overAllocated') : t('budgets.plan.impliedSavings')}
            caption={impliedSavings < 0 ? undefined : t('budgets.plan.impliedSavingsCaption')}
            amountInCents={impliedSavings}
            actualLabel={t('budgets.plan.saved')}
            actual={saved}
            currency={currency}
            strong
            colored
          />
        </TableBody>
      </Table>
      {(uncategorized.length > 0 || unbudgetedCategories.length > 0) && (
        <Alert
          severity={'warning'}
          sx={{ mt: 2 }}
          action={
            unbudgetedCategories.length > 0 && (
              <Button color={'inherit'} size={'small'} component={Link} href={`/${currentAccountId}/dashboard/settings/budgets`}>
                {t('budgets.plan.openBudgetSettings')}
              </Button>
            )
          }
        >
          <AlertTitle>{t('budgets.plan.unaccountedTitle')}</AlertTitle>
          <Typography variant={'body2'} sx={{ mb: 1 }}>
            {t('budgets.plan.unaccountedHelp')}
          </Typography>
          {uncategorized.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ flex: 1 }}>
                {t('budgets.plan.uncategorizedCount', { count: uncategorized.length })}
              </Typography>
              <Money amountInCents={uncategorizedSpending} currency={currency} colored={false} />
              <Button size={'small'} onClick={() => setPreview(uncategorized.map((transaction) => transaction.nodeId))}>
                {t('budgets.plan.categorize')}
              </Button>
            </Box>
          )}
          {unbudgetedCategories.map((category) => (
            <Box key={category.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ flex: 1 }}>{category.name}</Typography>
              <Money amountInCents={category.total} currency={currency} colored={false} />
              <Button size={'small'} onClick={() => setPreview(category.transactions.map((transaction) => transaction.nodeId))}>
                {t('budgets.viewTransactions')}
              </Button>
            </Box>
          ))}
        </Alert>
      )}
      <TransactionsPreview
        nodeIds={preview}
        pool={(withdrawals.data.allTransactions?.nodes ?? []) as Transaction[]}
        refetchQuery={{ query: GetPeriodWithdrawalsDocument, variables: { bankAccountIds, dateFrom, dateTo } }}
        handleComplete={() => setPreview(null)}
      />
    </Paper>
  )
}
