'use client'

import { useTransactionsGroupedByBudgets } from '@/lib/useTransactionsGroupedByBudgets'
import { Alert, Box, Divider, Grid, IconButton, Menu, MenuItem, Tooltip, Typography, useTheme } from '@mui/material'
import { useTranslations } from 'next-intl'
import { formatMoneyCents } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useBudgetPeriod } from '@/lib/useBudgetPeriod'
import { useMemo, useRef, useState } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import { GetBudgetsByAccountIdDocument, GetTransactionsGroupedByBudgetDocument } from '@/graphql/operations'
import { useAppContext } from '../context/AppContextProvider'
import { Budget, Query, Transaction } from '@/graphql/types'
import { useHover } from 'usehooks-ts'
import { useCategories } from '@/lib/useCategories'
import TransactionsPreview from '../shared/TransactionsPreview'
import { MoreVert } from '@mui/icons-material'
import BudgetDetails from '../shared/BudgetDetails'
import { BudgetPlan } from './BudgetPlan'
import { format, getDate, getDaysInMonth, isSameMonth } from 'date-fns'
import { availableBalance, isWithin, spendProgress, spentInPeriod } from '@/lib/budgetMath'

const MIN = 0
const MAX = 150

export interface BudgetItem {
  budget: Budget
  /** What the budget allows this month. */
  budgeted: number
  transactionsSum: number
  /** Accruing budgets only: the balance available as of the end of the selected month. */
  available: number | null
  /** Budget-relative amount still unspent (negative when over): `available` for accruing budgets, else budgeted - spent. */
  remaining: number
  transactions: Transaction[]
  /** Accruing budgets only: every transaction in the budget's categories, for balance calculations. */
  budgetTransactions: Transaction[]
}

function BudgetItem({
  budgetItem,
  onViewTransactionsClick,
  onBudgetDetailsClick,
}: {
  budgetItem: BudgetItem
  onViewTransactionsClick: () => void
  onBudgetDetailsClick: () => void
}) {
  const theme = useTheme()
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const { dateTo } = useBudgetPeriod()
  const { bankAccounts } = useAppContext()
  const currency = bankAccounts[0]?.currency || 'CAD'
  const hoverRef = useRef<HTMLElement>(null)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const isHover = useHover(hoverRef as React.RefObject<HTMLElement>)
  const normalize = (value: number) => ((value - MIN) * 100) / (MAX - MIN)
  const isAccruing = !!budgetItem.budget.effectiveDate
  const currentAmount = budgetItem.transactionsSum
  const maxAmount = budgetItem.budgeted
  const progress = Math.max(0, Math.min(MAX, spendProgress(currentAmount, maxAmount)))

  const percentage = Math.min(99, Math.max(0.5, normalize(progress)))
  // Going over a category is information, not failure: the plan as a whole decides whether the month is on track,
  // so over-budget items are amber and red is kept for the plan.
  const color = progress > 100 ? theme.palette.warning.main : theme.palette.money.positive

  // Where an even spend would be by today, so a bar can be read as ahead of or behind pace. Only meaningful for a
  // monthly budget while its month is under way.
  const today = new Date()
  const paceFraction = !isAccruing && maxAmount > 0 && isSameMonth(dateTo, today) ? getDate(today) / getDaysInMonth(today) : null
  const pacePercentage = paceFraction === null ? null : normalize(paceFraction * 100)
  const remainingCaption = isAccruing
    ? t('budgets.available')
    : budgetItem.remaining < 0
      ? t('budgets.over')
      : t('budgets.left')

  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleCloseUserMenu = () => {
    setAnchorEl(null)
  }

  return (
    <Box
      sx={{
        backgroundColor:
          isHover || anchorEl !== null ? theme.palette.hover.paper : 'none',
      }}
      ref={hoverRef}
    >
      <Grid container spacing={0}>
        <Grid
          size={2}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <Typography>{budgetItem.budget.name}</Typography>
        </Grid>
        <Grid size={7} sx={{ pt: 4, pb: 4 }}>
          <Box sx={{ position: 'relative', ml: 2, mr: 20 }}>
            <Box
              sx={{ borderRadius: 2, overflow: 'hidden', position: 'relative' }}
            >
              <Box
                sx={{ width: '100%', display: 'flex', flexDirection: 'row' }}
              >
                <Box
                  sx={{
                    width: `${percentage}%`,
                    height: 20,
                    background: `linear-gradient(90deg, ${theme.palette.background.paper} 0%, ${color} 100%)`,
                  }}
                ></Box>
                <Box
                  sx={{
                    width: `${100 - percentage}%`,
                    height: 20,
                    backgroundColor: theme.palette.background.paper,
                  }}
                ></Box>
              </Box>
            </Box>
            {pacePercentage !== null && (
              <Tooltip title={t('budgets.pace')}>
                <Box
                  sx={{
                    width: 0,
                    height: 20,
                    top: 0,
                    left: `${pacePercentage}%`,
                    position: 'absolute',
                    borderLeft: `2px dashed ${theme.palette.text.secondary}`,
                  }}
                />
              </Tooltip>
            )}
            <Box
              sx={{
                width: 2,
                height: 20,
                top: 0,
                left: `${normalize(100)}%`,
                position: 'absolute',
                backgroundColor: theme.palette.grey[400],
              }}
            />
            <Box
              sx={{
                width: 3,
                height: 26,
                top: -3,
                left: `${percentage}%`,
                position: 'absolute',
                backgroundColor: theme.palette.text.primary,
                borderRadius: 2,
                outline: `5px solid ${theme.palette.secondary.main}55`,
              }}
            />
            <Box
              sx={{
                top: 0,
                right: percentage < 5 ? null : `${101 - percentage}%`,
                left: percentage < 5 ? `${percentage + 1}%` : null,
                position: 'absolute',
              }}
            >
              <Typography>{formatMoneyCents(currentAmount, currency, hidden)}</Typography>
            </Box>
            <Box
              sx={{
                top: 0,
                left: `${Math.max(percentage + 1, normalize(101))}%`,
                position: 'absolute',
              }}
            >
              <Typography>{formatMoneyCents(maxAmount, currency, hidden)}</Typography>
            </Box>
          </Box>
        </Grid>
        <Grid size={2} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Typography
            variant={'h4'}
            sx={{ color: budgetItem.remaining < 0 ? theme.palette.warning.main : theme.palette.money.positive }}
          >
            {formatMoneyCents(isAccruing ? budgetItem.remaining : Math.abs(budgetItem.remaining), currency, hidden)}
          </Typography>
          <Typography variant={'caption'} color={'text.secondary'}>
            {remainingCaption}
          </Typography>
        </Grid>
        <Grid size={1} sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            onClick={handleOpenUserMenu}
            sx={{ opacity: isHover || anchorEl !== null ? 1 : 0.4 }}
          >
            <MoreVert />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(anchorEl)}
            onClose={handleCloseUserMenu}
          >
            <MenuItem
              onClick={() => {
                handleCloseUserMenu()
                onViewTransactionsClick()
              }}
            >
              <Typography>{t('budgets.viewTransactions')}</Typography>
            </MenuItem>
            {budgetItem.budget.effectiveDate && (
              <MenuItem
                onClick={() => {
                  handleCloseUserMenu()
                  onBudgetDetailsClick()
                }}
              >
                <Typography>{t('budgets.viewBudgetDetails')}</Typography>
              </MenuItem>
            )}
          </Menu>
        </Grid>
      </Grid>
    </Box>
  )
}

function compareBudgetItems(a: BudgetItem, b: BudgetItem) {
  return (a.budget.name || '').localeCompare(b.budget.name || '')
}

export function Budgets() {
  const t = useTranslations('common')
  const { transactionsGroupedByBudget } = useTransactionsGroupedByBudgets()
  // Load categories with the page: the transactions dialog's category editors need them, and suspending when the
  // dialog opens would blank the whole page (and leave the body scroll-locked).
  useCategories()
  const { currentAccountId, bankAccounts } = useAppContext()
  const { dateTo, dateFrom, isFallback } = useBudgetPeriod()
    const [detailsOpen, setDetailsOpen] = useState(false)
  const [previewNodeIds, setPreviewNodeIds] = useState<string[] | null>(null)
  const [selectedBudgetItem, setSelectedBudgetItem] = useState<BudgetItem | null>(null)

  const query = useSuspenseQuery<Query>(GetBudgetsByAccountIdDocument, {
    variables: {
      accountId: Number(currentAccountId),
    },
  })

  const budgetItems: BudgetItem[] = useMemo(() => {
    return transactionsGroupedByBudget
      .map((group) => {
        const isAccruing = !!group.budget.effectiveDate
        const transactions = group.transactions.filter((transaction) => isWithin(transaction.posted, dateFrom, dateTo))
        const transactionsSum = spentInPeriod(transactions, dateFrom, dateTo)
        const budgeted = Number(group.budget.amount)
        const available = isAccruing
          ? availableBalance(
              { ...group.budget, effectiveDate: group.budget.effectiveDate },
              group.transactions,
              dateTo,
            )
          : null
        return {
          budget: group.budget,
          budgeted,
          transactionsSum,
          available,
          remaining: available ?? budgeted - transactionsSum,
          transactions,
          budgetTransactions: isAccruing ? group.transactions : [],
        }
      })
      .sort(compareBudgetItems)
  }, [transactionsGroupedByBudget, dateFrom, dateTo])

  const fixedItems = useMemo(() => budgetItems.filter((item) => !item.budget.effectiveDate), [budgetItems])
  const accruingItems = useMemo(() => budgetItems.filter((item) => !!item.budget.effectiveDate), [budgetItems])

  // Both kinds are money chosen in advance: fixed budgets are spent within the month, while accruing budgets (funds)
  // are set aside every month and spent from their balance later.
  const fixedBudgeted = useMemo(() => fixedItems.reduce((sum, item) => sum + item.budgeted, 0), [fixedItems])
  const accruingBudgeted = useMemo(() => accruingItems.reduce((sum, item) => sum + item.budgeted, 0), [accruingItems])
  const fundBalance = useMemo(() => accruingItems.reduce((sum, item) => sum + (item.available ?? 0), 0), [accruingItems])

  // Money that left each kind of budget this month, counting a transaction once even if its category is in more
  // than one budget (a category in a fixed budget counts as fixed). Transfers between the user's own accounts are
  // left out, as they are from total spending, and refunds are not netted off: these are compared with gross total
  // spending.
  const { fixedSpend, fundSpend } = useMemo(() => {
    const outflow = (items: BudgetItem[], seen: Set<number>) => {
      let total = 0
      for (const item of items) {
        for (const transaction of item.transactions) {
          const amount = Number(transaction.amount)
          const isTransfer = Number(transaction.transferCount ?? 0) > 0
          if (amount < 0 && !isTransfer && !seen.has(transaction.id)) {
            seen.add(transaction.id)
            total -= amount
          }
        }
      }
      return total
    }
    const seen = new Set<number>()
    const fixed = outflow(fixedItems, seen)
    return { fixedSpend: fixed, fundSpend: outflow(accruingItems, seen) }
  }, [fixedItems, accruingItems])

  const budgetedCategoryIds = useMemo(
    () =>
      new Set(
        transactionsGroupedByBudget.flatMap((group) =>
          (group.budget.budgetCategoriesByBudgetId?.nodes ?? []).map((budgetCategory) => budgetCategory.categoryId),
        ),
      ),
    [transactionsGroupedByBudget],
  )

  function handleBudgetItemClick(budgetItem: BudgetItem) {
    setSelectedBudgetItem(budgetItem)
    setDetailsOpen(true)
  }

  function handleBudgetItemClose() {
    setDetailsOpen(false)
    setSelectedBudgetItem(null)
  }

  function handlePreviewTransactionsClick(budgetItem: BudgetItem) {
    setPreviewNodeIds(budgetItem.transactions.map((transaction) => transaction.nodeId))
  }

  function handlePreviewTransactionsClose() {
    setPreviewNodeIds(null)
  }

  const previewPool = useMemo(
    () => transactionsGroupedByBudget.flatMap((group) => group.transactions),
    [transactionsGroupedByBudget],
  )

  const currency = bankAccounts?.[0]?.currency

  function renderItems(items: BudgetItem[]) {
    if (items.length === 0) return <Typography color={'text.secondary'}>{t('budgets.noBudgetItems')}</Typography>
    return items.map((budgetItem) => (
      <BudgetItem
        key={`${budgetItem.budget.id}`}
        budgetItem={budgetItem}
        onViewTransactionsClick={() => handlePreviewTransactionsClick(budgetItem)}
        onBudgetDetailsClick={() => handleBudgetItemClick(budgetItem)}
      />
    ))
  }

  return (
    <>
      {isFallback && (
        <Alert severity={'info'} sx={{ mb: 2 }}>
          {t('budgets.monthOnlyNotice', { month: format(dateTo, 'MMMM yyyy') })}
        </Alert>
      )}
      {currency && (
        <BudgetPlan
          dateFrom={dateFrom}
          dateTo={dateTo}
          fixedBudgeted={fixedBudgeted}
          accruingBudgeted={accruingBudgeted}
          fundBalance={fundBalance}
          fixedSpend={fixedSpend}
          fundSpend={fundSpend}
          budgetedCategoryIds={budgetedCategoryIds}
          currency={currency}
        />
      )}
      <Divider sx={{ mb: 4, mt: 4 }} />
      <Typography variant={'h1'}>{t('budgets.budgetItems')}</Typography>
      {renderItems(fixedItems)}
      <Divider sx={{ mb: 4, mt: 4 }} />
      <Typography variant={'h1'}>{t('budgets.accruingBudgets')}</Typography>
      {renderItems(accruingItems)}
      {selectedBudgetItem && (
        <BudgetDetails
          open={detailsOpen}
          budgetItem={selectedBudgetItem}
          accountId={currentAccountId}
          handleComplete={handleBudgetItemClose}
        />
      )}
      <TransactionsPreview
        nodeIds={previewNodeIds}
        pool={previewPool}
        refetchQuery={{ query: GetTransactionsGroupedByBudgetDocument, variables: { accountId: currentAccountId || 0 } }}
        handleComplete={handlePreviewTransactionsClose}
      />
    </>
  )
}
