'use client'

import { useMemo } from 'react'
import { Alert, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { useSuspenseQuery } from '@apollo/client/react'
import { useTranslations } from 'next-intl'
import { subMonths, startOfMonth } from 'date-fns'
import { useAppContext } from '../context/AppContextProvider'
import { Money } from '../shared/Money'
import { formatMoneyCents } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { expectedMonthlyIncome } from '@/lib/budgetMath'
import {
  GetBudgetPeriodTotalsDocument,
  GetPayrollTransactionsDocument,
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
  currency: string
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const { bankAccounts } = useAppContext()

  const bankAccountIds = useMemo(() => bankAccounts.map((bankAccount) => bankAccount.id), [bankAccounts])
  const monthStart = useMemo(() => startOfMonth(dateFrom), [dateFrom])
  const historyStart = useMemo(() => subMonths(monthStart, HISTORY_MONTHS), [monthStart])

  const month = useSuspenseQuery(GetBudgetPeriodTotalsDocument, { variables: { bankAccountIds, dateFrom, dateTo } })
  const payroll = useSuspenseQuery(GetPayrollTransactionsDocument, {
    variables: { bankAccountIds, dateFrom: historyStart, dateTo: monthStart },
  })

  const sum = (value: unknown) => Number(value ?? 0)

  const income = useMemo(
    () => expectedMonthlyIncome(payroll.data.allTransactions?.nodes ?? [], historyStart, HISTORY_MONTHS),
    [payroll.data.allTransactions?.nodes, historyStart],
  )
  const expectedIncome = income?.expected ?? 0
  const totalBudgeted = fixedBudgeted + accruingBudgeted
  const impliedSavings = expectedIncome - totalBudgeted

  const deposits = sum(month.data.deposits?.aggregates?.sum?.amount)
  const totalSpending = -sum(month.data.withdrawals?.aggregates?.sum?.amount)
  // Total spending is what actually moved the account balances this month, including what was paid out of funds.
  const saved = deposits - totalSpending
  const outsideBudgets = Math.max(0, totalSpending - fixedSpend - fundSpend)

  const spendingCaption =
    [
      outsideBudgets > 0
        ? t('budgets.plan.unbudgeted', { amount: formatMoneyCents(outsideBudgets, currency, hidden) })
        : null,
      fundSpend > 0 ? t('budgets.plan.paidFromFunds', { amount: formatMoneyCents(fundSpend, currency, hidden) }) : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined

  return (
    <Paper variant={'outlined'} sx={{ p: 2 }}>
      {!income && (
        <Alert severity={'info'} sx={{ mb: 1 }}>
          {t('budgets.plan.noPayroll')}
        </Alert>
      )}
      <Table size={'small'}>
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
            caption={income ? t('budgets.plan.expectedIncomeBasis', { months: income.months }) : undefined}
            amountInCents={expectedIncome}
            actualLabel={t('budgets.plan.deposits')}
            actual={deposits}
            currency={currency}
          />
          <Row label={t('budgets.plan.fixedBudgets')} amountInCents={-fixedBudgeted} currency={currency} />
          <Row
            label={t('budgets.plan.accruingBudgets')}
            caption={t('budgets.plan.accruingBudgetsCaption', {
              balance: formatMoneyCents(fundBalance, currency, hidden),
            })}
            amountInCents={-accruingBudgeted}
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
    </Paper>
  )
}
