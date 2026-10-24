'use client'

import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Menu,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { useApolloClient, useQuery } from '@apollo/client/react'
import { useTranslations } from 'next-intl'
import { useSnackbar } from 'notistack'
import { format, getDate, getDaysInMonth, parseISO } from 'date-fns'
import { Transaction } from '@/graphql/types'
import { GetBudgetTransactionsDocument, MoveBudgetMoneyDocument } from '@/graphql/operations'
import { useBudgetPeriod } from '@/lib/useBudgetPeriod'
import { useCategories } from '@/lib/useCategories'
import { EnvelopeBudgetRow, useEnvelopeBudget } from '@/lib/useEnvelopeBudget'
import { coverSource, toMonthKey } from '@/lib/budgetMath'
import { formatMoneyCents, toCents } from '@/lib/formatMoney'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useAppContext } from '../context/AppContextProvider'
import CurrencyTextField from '../shared/CurrencyTextField'
import TransactionsPreview from '../shared/TransactionsPreview'
import { MoveMoneyDialog, MoveRequest } from './MoveMoneyDialog'
import { PayrollPrompt } from './PayrollPrompt'
import { UnbudgetedSpending } from './UnbudgetedSpending'

// Blue and vermillion (Okabe-Ito) stay distinguishable with the common kinds of colour blindness, unlike green and
// red. The fills keep white text on top of them at 4.5:1 or better.
const UNDER = '#0072B2'
const OVER = '#C85200'

/** How much of a budget's money (carryover + assigned) has been spent, with where an even spend would be by today. */
function SpendBar({ row, isCurrentMonth }: { row: EnvelopeBudgetRow; isCurrentMonth: boolean }) {
  const theme = useTheme()
  const t = useTranslations('common')
  const funded = row.carryover + row.assigned
  const spent = Math.max(0, -row.activity)
  const fraction = funded > 0 ? Math.min(1, spent / funded) : spent > 0 ? 1 : 0
  const today = new Date()
  const pace = isCurrentMonth && funded > 0 ? getDate(today) / getDaysInMonth(today) : null
  return (
    <Box sx={{ position: 'relative', height: 8, borderRadius: 4, backgroundColor: theme.palette.action.hover }}>
      <Box
        sx={{
          width: `${fraction * 100}%`,
          height: '100%',
          borderRadius: 4,
          backgroundColor: row.available < 0 ? OVER : UNDER,
        }}
      />
      {pace !== null && (
        <Tooltip title={t('budgets.pace')}>
          <Box
            sx={{
              position: 'absolute',
              top: -3,
              left: `${pace * 100}%`,
              height: 14,
              borderLeft: `2px dashed ${theme.palette.text.secondary}`,
            }}
          />
        </Tooltip>
      )}
    </Box>
  )
}

/** The assigned amount, edited in place: Enter or leaving the field saves, Escape cancels. */
function AssignedCell({
  row,
  currency,
  disabled,
  onAssign,
}: {
  row: EnvelopeBudgetRow
  currency: string
  disabled: boolean
  onAssign: (row: EnvelopeBudgetRow, amount: number) => Promise<void>
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(row.assigned)

  async function commit() {
    setEditing(false)
    if (value !== row.assigned) await onAssign(row, value)
  }

  if (editing) {
    return (
      <CurrencyTextField
        size={'small'}
        value={value / 100}
        defaultValue={value / 100}
        onValueChange={(amount) => setValue(toCents(amount))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') {
            setValue(row.assigned)
            setEditing(false)
          }
        }}
        sx={{ maxWidth: 160 }}
        autoFocus
      />
    )
  }
  return (
    <ButtonBase
      // Editing shows the real figure, so it is off while amounts are hidden.
      disabled={disabled || hidden}
      onClick={() => {
        setValue(row.assigned)
        setEditing(true)
      }}
      aria-label={t('budgets.editAssigned', { name: row.budget.name ?? '' })}
      sx={{ px: 1, py: 0.5, borderRadius: 1, '&:hover': { backgroundColor: 'action.hover' } }}
    >
      <Typography>{formatMoneyCents(row.assigned, currency, hidden)}</Typography>
    </ButtonBase>
  )
}

/**
 * Envelope budgeting for the selected month: Ready to Assign, and each budget's assigned money, activity and what is
 * available. Assigned amounts are edited in place; available money can be moved between budgets, and an overspent
 * budget can be covered from another.
 */
export function EnvelopeBudget() {
  const t = useTranslations('common')
  const theme = useTheme()
  const { hidden } = useAmountVisibility()
  const { bankAccounts } = useAppContext()
  const currency = bankAccounts[0]?.currency || 'CAD'
  const { dateFrom, dateTo, isFallback } = useBudgetPeriod()
  const selectedMonth = toMonthKey(dateFrom)
  const { accountId, startMonth, month, rows, previousAssigned, cashOnHand, startingBalance, refetch } =
    useEnvelopeBudget(selectedMonth)
  // Load categories with the page: the transactions dialog's category editors need them, and suspending when the
  // dialog opens would blank the whole page (and leave the body scroll-locked).
  const { categories } = useCategories()
  const hasPayroll = categories.some((category) => category.isPayroll)

  const client = useApolloClient()
  const { enqueueSnackbar } = useSnackbar()
  const [moveBudgetMoney] = useMutationWithToast(MoveBudgetMoneyDocument, {
    showServerMessage: true,
    errorMessage: t('budgets.moveFailed'),
  })
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: EnvelopeBudgetRow } | null>(null)
  const [busy, setBusy] = useState(false)

  // The budget whose transactions are being reviewed, and the rows shown once they have loaded.
  const [review, setReview] = useState<{ categoryIds: number[]; nodeIds: string[] } | null>(null)
  const reviewVariables = { categoryIds: review?.categoryIds ?? [], dateFrom, dateTo }
  const reviewQuery = useQuery(GetBudgetTransactionsDocument, { variables: reviewVariables, skip: !review })

  const budgetedCategoryIds = useMemo(() => new Set(rows.flatMap((row) => row.categoryIds)), [rows])
  const isCurrentMonth = selectedMonth === toMonthKey(new Date())

  async function move(from: number | null, to: number | null, amount: number) {
    await moveBudgetMoney({
      variables: { accountId, month: selectedMonth, fromBudgetId: from, toBudgetId: to, amount: String(amount) },
    })
    await refetch()
  }

  /** Sets what is assigned to each budget this month, moving the difference to or from Ready to Assign. */
  async function assign(targets: { row: EnvelopeBudgetRow; amount: number }[]) {
    setBusy(true)
    try {
      for (const { row, amount } of targets) {
        const difference = amount - row.assigned
        if (difference === 0) continue
        await moveBudgetMoney({
          variables: {
            accountId,
            month: selectedMonth,
            fromBudgetId: difference > 0 ? null : row.budgetId,
            toBudgetId: difference > 0 ? row.budgetId : null,
            amount: String(Math.abs(difference)),
          },
        })
      }
    } catch {
      // Reported by the mutation hook; the refetch below shows what was saved.
    } finally {
      await refetch()
      setBusy(false)
    }
  }

  async function openReview(row: EnvelopeBudgetRow) {
    // A budget without categories has no transactions; there is nothing to ask the API for.
    if (row.categoryIds.length === 0) {
      setReview({ categoryIds: [], nodeIds: [] })
      return
    }
    try {
      const variables = { categoryIds: row.categoryIds, dateFrom, dateTo }
      const result = await client.query({
        query: GetBudgetTransactionsDocument,
        variables,
        fetchPolicy: 'network-only',
      })
      setReview({
        categoryIds: row.categoryIds,
        nodeIds: (result.data?.allTransactions?.nodes ?? []).map((transaction) => transaction.nodeId),
      })
    } catch (error) {
      console.error(error)
      enqueueSnackbar(t('budgets.transactionsFailed'), { variant: 'error' })
    }
  }

  function openMove(row: EnvelopeBudgetRow) {
    setMenu(null)
    setMoveRequest({ from: row.budgetId, to: null, amount: Math.max(0, row.available) })
  }

  function openCover(row: EnvelopeBudgetRow) {
    setMenu(null)
    setMoveRequest({ ...coverSource(row, rows, month?.readyToAssign ?? 0), to: row.budgetId, cover: true })
  }

  if (!month) {
    return (
      <Alert severity={'info'}>{t('budgets.beforeStart', { month: format(parseISO(startMonth), 'MMMM yyyy') })}</Alert>
    )
  }

  const overAssigned = month.readyToAssign < 0

  return (
    <>
      {isFallback && (
        <Alert severity={'info'} sx={{ mb: 2 }}>
          {t('budgets.monthOnlyNotice', { month: format(dateTo, 'MMMM yyyy') })}
        </Alert>
      )}
      {!hasPayroll && <PayrollPrompt currency={currency} />}

      <Paper variant={'outlined'} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 260 }}>
            <Typography variant={'h4'}>{t('budgets.readyToAssign')}</Typography>
            <Typography
              variant={'h1'}
              sx={{ color: overAssigned ? OVER : month.readyToAssign > 0 ? UNDER : undefined }}
            >
              {formatMoneyCents(month.readyToAssign, currency, hidden)}
            </Typography>
            <Typography variant={'body2'} color={'text.secondary'}>
              {t('budgets.readyToAssignCaption', {
                income: formatMoneyCents(month.income, currency, hidden),
                assigned: formatMoneyCents(month.assigned, currency, hidden),
              })}
            </Typography>
            {/* Ready to Assign carries the starting money forward; say where it began in the first month. */}
            {month.month === startMonth && cashOnHand !== null && (
              <Typography variant={'body2'} color={'text.secondary'}>
                {t('budgets.startedWith', {
                  amount: formatMoneyCents(startingBalance, currency, hidden),
                  cash: formatMoneyCents(cashOnHand, currency, hidden),
                })}
              </Typography>
            )}
            {month.overspentLastMonth > 0 && (
              <Typography variant={'body2'} color={'text.secondary'}>
                {t('budgets.overspentLastMonth', {
                  amount: formatMoneyCents(month.overspentLastMonth, currency, hidden),
                })}
              </Typography>
            )}
            {month.unbudgetedSpending > 0 && (
              <Typography variant={'body2'} color={'text.secondary'}>
                {t('budgets.unbudgetedSpending', {
                  amount: formatMoneyCents(month.unbudgetedSpending, currency, hidden),
                })}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant={'outlined'}
              size={'small'}
              disabled={busy}
              onClick={() => assign(rows.map((row) => ({ row, amount: Number(row.budget.amount) })))}
            >
              {t('budgets.assignPlanned')}
            </Button>
            <Button
              variant={'outlined'}
              size={'small'}
              disabled={busy || previousAssigned.size === 0}
              onClick={() => assign(rows.map((row) => ({ row, amount: previousAssigned.get(row.budgetId) ?? 0 })))}
            >
              {t('budgets.copyLastMonth')}
            </Button>
            <Button
              variant={'outlined'}
              size={'small'}
              disabled={busy || month.assigned === 0}
              onClick={() => assign(rows.map((row) => ({ row, amount: 0 })))}
            >
              {t('budgets.clearAssignments')}
            </Button>
          </Box>
        </Box>
        {overAssigned && (
          <Alert severity={'warning'} sx={{ mt: 2 }}>
            {t('budgets.overAssigned')}
          </Alert>
        )}
        {month.readyToAssign === 0 && rows.length > 0 && (
          <Alert severity={'success'} sx={{ mt: 2 }}>
            {t('budgets.allAssigned')}
          </Alert>
        )}
      </Paper>

      <UnbudgetedSpending
        dateFrom={dateFrom}
        dateTo={dateTo}
        budgetedCategoryIds={budgetedCategoryIds}
        currency={currency}
        onReviewed={() => refetch()}
      />

      {rows.length === 0 ? (
        <Typography color={'text.secondary'}>{t('budgets.noBudgetItems')}</Typography>
      ) : (
        <Table size={'small'} sx={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '28%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell>{t('budgets.budget')}</TableCell>
              <TableCell />
              <TableCell align={'right'}>{t('budgets.assigned')}</TableCell>
              <TableCell align={'right'}>{t('budgets.activity')}</TableCell>
              <TableCell align={'right'}>{t('budgets.available')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.budgetId} hover>
                <TableCell>
                  <Typography noWrap>{row.budget.name}</Typography>
                  {row.carryover !== 0 && (
                    <Typography variant={'caption'} color={'text.secondary'}>
                      {t('budgets.carryover', { amount: formatMoneyCents(row.carryover, currency, hidden) })}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <SpendBar row={row} isCurrentMonth={isCurrentMonth} />
                </TableCell>
                <TableCell align={'right'}>
                  <AssignedCell
                    key={`${row.budgetId}:${row.assigned}`}
                    row={row}
                    currency={currency}
                    disabled={busy}
                    onAssign={(assignedRow, amount) => assign([{ row: assignedRow, amount }])}
                  />
                </TableCell>
                <TableCell align={'right'}>
                  <Tooltip title={t('budgets.viewTransactions')}>
                    <ButtonBase
                      onClick={() => openReview(row)}
                      sx={{ px: 1, py: 0.5, borderRadius: 1, '&:hover': { backgroundColor: 'action.hover' } }}
                    >
                      <Typography color={'text.secondary'}>
                        {formatMoneyCents(row.activity, currency, hidden)}
                      </Typography>
                    </ButtonBase>
                  </Tooltip>
                </TableCell>
                <TableCell align={'right'}>
                  <Chip
                    label={formatMoneyCents(row.available, currency, hidden)}
                    onClick={(event) => setMenu({ anchor: event.currentTarget, row })}
                    sx={{
                      fontWeight: 600,
                      color: row.available === 0 ? theme.palette.text.secondary : '#fff',
                      backgroundColor: row.available < 0 ? OVER : row.available > 0 ? UNDER : undefined,
                      '&:hover': {
                        backgroundColor: row.available < 0 ? OVER : row.available > 0 ? UNDER : undefined,
                        opacity: 0.85,
                      },
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Menu anchorEl={menu?.anchor} open={menu !== null} onClose={() => setMenu(null)}>
        {/* Moving money shows the real figures, so it is off while amounts are hidden. */}
        {menu && menu.row.available < 0 && (
          <MenuItem disabled={hidden} onClick={() => openCover(menu.row)}>
            {t('budgets.coverOverspending')}
          </MenuItem>
        )}
        {menu && (
          <MenuItem disabled={hidden} onClick={() => openMove(menu.row)}>
            {t('budgets.moveMoney')}
          </MenuItem>
        )}
        {menu && (
          <MenuItem
            onClick={() => {
              setMenu(null)
              openReview(menu.row)
            }}
          >
            {t('budgets.viewTransactions')}
          </MenuItem>
        )}
      </Menu>

      {moveRequest && (
        <MoveMoneyDialog
          request={moveRequest}
          rows={rows}
          readyToAssign={month.readyToAssign}
          currency={currency}
          onMove={move}
          onClose={() => setMoveRequest(null)}
        />
      )}
      <TransactionsPreview
        nodeIds={review?.nodeIds ?? null}
        pool={(reviewQuery.data?.allTransactions?.nodes ?? []) as Transaction[]}
        refetchQuery={{ query: GetBudgetTransactionsDocument, variables: reviewVariables }}
        handleComplete={() => {
          setReview(null)
          refetch()
        }}
      />
    </>
  )
}
