'use client'

import { useTransactionsGroupedByBudgets } from '@/lib/useTransactionsGroupedByBudgets'
import {
  Box,
  Button,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { useTranslations } from 'next-intl'
import { Money } from '../shared/Money'
import { formatMoneyCents } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { useMemo, useRef, useState } from 'react'
import { useMutation, useSuspenseQuery } from '@apollo/client/react'
import {
  GetAllBudgetReconsiliationsDocument,
  GetAllBudgetReconsiliations,
  GetBudgetsByUserIdDocument,
  GetTransactionAggregatesByBankAccountDocument,
  GetTransactionAggregatesByBankAccount,
  UpsertBudgetReconsiliationDocument,
} from '@/graphql/operations'
import { useAppContext } from '../context/AppContextProvider'
import {
  Budget,
  BudgetReconsiliation,
  Query,
  Transaction,
} from '@/graphql/types'
import { useHover } from 'usehooks-ts'
import TransactionsPreview from '../shared/TransactionsPreview'
import { MoreVert } from '@mui/icons-material'
import BudgetDetails from '../shared/BudgetDetails'
import {
  differenceInCalendarDays,
  differenceInMonths,
  getDaysInMonth,
} from 'date-fns'

const MIN = 0
const MAX = 150

export interface BudgetItem {
  budget: Budget
  budgetReconsiliation?: BudgetReconsiliation
  transactionsSum: number
  transactions: Transaction[]
  budgetTransactions: Transaction[]
}

function BudgetItem({
  budgetItem,
  onReconsileClick,
  onViewTransactionsClick,
  onBudgetDetailsClick,
}: {
  budgetItem: BudgetItem
  onReconsileClick: () => void
  onViewTransactionsClick: () => void
  onBudgetDetailsClick: () => void
}) {
  const theme = useTheme()
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const { dateTo } = useDateFilterParams()
  const { bankAccounts } = useAppContext()
  const hoverRef = useRef<HTMLElement>(null)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const isHover = useHover(hoverRef as React.RefObject<HTMLElement>)
  const normalize = (value: number) => ((value - MIN) * 100) / (MAX - MIN)
  const currentAmount = budgetItem.transactionsSum
  const maxAmount =
    budgetItem.budgetReconsiliation?.amount || budgetItem.budget.amount
  const progress = Math.min(MAX, (currentAmount / maxAmount) * 100)

  const percentage = Math.min(99, Math.max(0.5, normalize(progress)))
  const color =
    progress > 100 ? theme.palette.money.negative : theme.palette.money.positive

  const total = useMemo(() => {
    if (budgetItem?.budget.effectiveDate) {
      const effectiveDate = new Date(budgetItem?.budget.effectiveDate)
      const amount = Number(budgetItem?.budget.amount)
      const startingAmount = Number(budgetItem?.budget.startingAmount)
      const transactionsTotal =
        budgetItem?.budgetTransactions.reduce((partialSum, transaction) => {
          const date = new Date(transaction.posted)

          if (date.getTime() >= effectiveDate.getTime()) {
            return partialSum + Number(transaction.amount)
          } else {
            return partialSum
          }
        }, 0) || 0

      // Calculate total based on budget and effectiveDate and currentDate
      // from effectiveDate to today
      let accruedAmount = 0
      if (
        effectiveDate.getMonth() === dateTo.getMonth() &&
        effectiveDate.getFullYear() === dateTo.getFullYear()
      ) {
        //Same month..
        const diff = differenceInCalendarDays(dateTo, effectiveDate) + 1
        const daysInMonth = getDaysInMonth(effectiveDate)
        accruedAmount = Math.floor((amount / daysInMonth) * diff)
      } else {
        //Get accrued value of starting month
        const daysInEffectiveMonth = getDaysInMonth(effectiveDate)
        accruedAmount += Math.floor(
          (amount / daysInEffectiveMonth) *
            (daysInEffectiveMonth - effectiveDate.getDate()),
        )

        //Get accrued value of months in between
        const monthsDiff = differenceInMonths(dateTo, effectiveDate)
        accruedAmount += monthsDiff * amount
      }
      return transactionsTotal + startingAmount + accruedAmount
    } else {
      return 0
    }
  }, [
    dateTo,
    budgetItem?.budgetTransactions,
    budgetItem?.budget.amount,
    budgetItem?.budget.startingAmount,
    budgetItem?.budget.effectiveDate,
  ])

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
        <Grid size={8} sx={{ pt: 4, pb: 4 }}>
          <Box sx={{ position: 'relative', ml: 2, mr: 20 }}>
            <Box
              sx={{ borderRadius: 2, overflow: 'hidden', position: 'relative' }}
            >
              {/* <LinearProgress variant="determinate" value={normalise(progress)} sx={{ height: 20 }} /> */}
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
              <Typography>{formatMoneyCents(currentAmount, 'CAD', hidden)}</Typography>
            </Box>
            <Box
              sx={{
                top: 0,
                left: `${Math.max(percentage + 1, normalize(101))}%`,
                position: 'absolute',
              }}
            >
              <Typography>{formatMoneyCents(maxAmount, 'CAD', hidden)}</Typography>
            </Box>
          </Box>
        </Grid>
        <Grid size={1} sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            onClick={handleOpenUserMenu}
            sx={{ visibility: isHover ? 'visible' : 'hidden' }}
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
            {!budgetItem.budget.effectiveDate && (
              <MenuItem
                onClick={() => {
                  handleCloseUserMenu()
                  onReconsileClick()
                }}
              >
                <Typography>{t('budgets.reconsile')}</Typography>
              </MenuItem>
            )}
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
        <Grid size={1} sx={{ display: 'flex', alignItems: 'center' }}>
          {budgetItem.budget.effectiveDate && bankAccounts[0].currency && (
            <Money
              amountInCents={total}
              currency={bankAccounts[0].currency}
              colored={false}
            />
          )}
        </Grid>
      </Grid>
    </Box>
  )
}

export function Budgets() {
  const t = useTranslations('common')
  const { transactionsGroupedByBudget } = useTransactionsGroupedByBudgets()
  const { user, bankAccounts } = useAppContext()
  const { dateTo, dateFrom } = useDateFilterParams()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [previewTransactions, setPreviewTransactions] = useState<Transaction[]>(
    [],
  )
  const [selectedBudgetItem, setSelectedBudgetItem] =
    useState<BudgetItem | null>(null)

  const query = useSuspenseQuery<Query>(GetBudgetsByUserIdDocument, {
    variables: {
      userId: Number(user?.id),
    },
  })

  const aggregates = useSuspenseQuery<GetTransactionAggregatesByBankAccount>(
    GetTransactionAggregatesByBankAccountDocument,
    {
      variables: {
        bankAccountIds: bankAccounts.map((bankAccount) => bankAccount.id),
        dateFrom,
        dateTo,
      },
    },
  )

  const reconsiliationsQuery = useSuspenseQuery<GetAllBudgetReconsiliations>(
    GetAllBudgetReconsiliationsDocument,
    {
      variables: {
        budgetIds: query?.data?.allBudgets?.nodes.map((budget) => budget.id),
        month: dateTo.getMonth() + 1,
        year: dateTo.getFullYear(),
      },
      skip: query?.data?.allBudgets?.nodes?.length === 0,
    },
  )

  const [upsertBudgetReconsiliation] = useMutation(
    UpsertBudgetReconsiliationDocument,
    {
      refetchQueries: [
        {
          query: GetAllBudgetReconsiliationsDocument,
          variables: {
            budgetIds: query?.data?.allBudgets?.nodes.map(
              (budget) => budget.id,
            ),
            month: dateTo.getMonth() + 1,
            year: dateTo.getFullYear(),
          },
        },
      ],
    },
  )

  const budgets: Budget[] = useMemo(() => {
    return [...(query?.data?.allBudgets?.nodes || [])]?.sort(
      (a: Budget, b: Budget) => {
        if ((a.name || '') > (b.name || '')) return 1
        if ((a.name || '') < (b.name || '')) return -1
        return 0
      },
    )
  }, [query?.data?.allBudgets?.nodes])

  const reconsiliations = useMemo(() => {
    return (reconsiliationsQuery?.data?.allBudgetReconsiliations?.nodes ||
      []) as BudgetReconsiliation[]
  }, [reconsiliationsQuery?.data?.allBudgetReconsiliations?.nodes])

  const depositTotal: number = useMemo(() => {
    return Number(aggregates?.data?.deposits?.aggregates?.sum?.amount)
  }, [aggregates?.data?.deposits?.aggregates?.sum?.amount])

  const totalBudgeted = useMemo(() => {
    return budgets.reduce((partialSum, b) => {
      const reconsiliation =
        reconsiliations.find((rec) => rec.budgetId === b.id) || undefined
      return partialSum + Number(reconsiliation?.amount || b.amount)
    }, 0)
  }, [budgets, reconsiliations])

  const budgetItems = useMemo(() => {
    return transactionsGroupedByBudget
      .map((group) => {
        const doesAccrue = !!group.budget.effectiveDate
        const filteredTransactions = group.transactions.filter(
          (transaction) => {
            const timestamp = new Date(transaction.posted).getTime()
            return (
              timestamp > dateFrom.getTime() && timestamp < dateTo.getTime()
            )
          },
        )
        const budgetTransactions = doesAccrue
          ? group.transactions.filter((transaction) => {
              const timestamp = new Date(transaction.posted).getTime()
              return (
                timestamp > new Date(group.budget.effectiveDate).getTime() &&
                timestamp < dateTo.getTime()
              )
            })
          : []
        const transactionsSum = filteredTransactions.reduce(
          (partialSum, t) => partialSum + -Number(t.amount),
          0,
        )
        const budgetReconsiliation =
          reconsiliations.find(
            (reconsiliation) => reconsiliation.budgetId === group.budget.id,
          ) || undefined
        return {
          budget: group.budget,
          budgetReconsiliation,
          transactionsSum,
          transactions: filteredTransactions,
          budgetTransactions,
        }
      })
      .sort((a: BudgetItem, b: BudgetItem) => {
        if ((a.budget.name || '') > (b.budget.name || '')) return 1
        if ((a.budget.name || '') < (b.budget.name || '')) return -1
        return 0
      }) as BudgetItem[]
  }, [transactionsGroupedByBudget, reconsiliations, dateFrom, dateTo])

  const overallTotal = useMemo(() => {
    return budgetItems.reduce(
      (partialSum, bi) => partialSum + Number(bi.transactionsSum),
      0,
    )
  }, [budgetItems])

  function handleBudgetItemClick(budgetItem: BudgetItem) {
    setSelectedBudgetItem(budgetItem)
    setDetailsOpen(true)
  }

  function handleBudgetItemClose() {
    setDetailsOpen(false)
    setSelectedBudgetItem(null)
  }

  function handlePreviewTransactionsClick(budgetItem: BudgetItem) {
    setPreviewTransactions(budgetItem.transactions)
    setPreviewOpen(true)
  }

  function handlePreviewTransactionsClose() {
    setPreviewOpen(false)
    setPreviewTransactions([])
  }

  async function handleReconsiliation(budgetItem: BudgetItem) {
    await upsertBudgetReconsiliation({
      variables: {
        budgetId: budgetItem.budget.id,
        amount: budgetItem.transactionsSum,
        month: dateTo.getMonth() + 1,
        year: dateTo.getFullYear(),
        id: budgetItem.budgetReconsiliation?.id || undefined,
      },
    })
  }

  const bankAccount = useMemo(
    () => (bankAccounts?.[0] ? bankAccounts[0] : null),
    [bankAccounts],
  )

  return (
    <>
      <Grid container>
        <Grid
          size={3}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography>Budgeted: </Typography>
          {bankAccount?.currency && (
            <Typography variant={'h2'}>
              <Money
                amountInCents={totalBudgeted}
                currency={bankAccount.currency}
                colored={true}
              />
            </Typography>
          )}
        </Grid>
        <Grid
          size={3}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography>Deposits: </Typography>
          {bankAccount?.currency && (
            <Typography variant={'h2'}>
              <Money
                amountInCents={depositTotal}
                currency={bankAccount.currency}
                colored={true}
              />
            </Typography>
          )}
        </Grid>
        <Grid
          size={3}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography>Withdrawals: </Typography>
          {bankAccount?.currency && (
            <Typography variant={'h2'}>
              <Money
                amountInCents={overallTotal}
                currency={bankAccount.currency}
                colored={true}
              />
            </Typography>
          )}
        </Grid>
        <Grid
          size={3}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography>Difference: </Typography>
          {bankAccount?.currency && (
            <Typography variant={'h2'}>
              <Money
                amountInCents={depositTotal - overallTotal}
                currency={bankAccount.currency}
                colored={true}
              />
            </Typography>
          )}
        </Grid>
      </Grid>
      <Divider sx={{ mb: 4, mt: 4 }} />
      <Typography variant={'h1'}>{t('budgets.budgetItems')}</Typography>
      {budgetItems.filter((budgetItem) => !budgetItem.budget.effectiveDate)
        .length === 0 && <p>No budget items</p>}
      {budgetItems
        .filter((budgetItem) => !budgetItem.budget.effectiveDate)
        .map((budgetItem) => {
          return (
            <BudgetItem
              key={`${budgetItem.budget.id}`}
              budgetItem={budgetItem}
              onReconsileClick={() => handleReconsiliation(budgetItem)}
              onViewTransactionsClick={() =>
                handlePreviewTransactionsClick(budgetItem)
              }
              onBudgetDetailsClick={() => handleBudgetItemClick(budgetItem)}
            />
          )
        })}
      <Divider sx={{ mb: 4, mt: 4 }} />
      <Typography variant={'h1'}>{t('budgets.accruingBudgets')}</Typography>
      {budgetItems.filter((budgetItem) => !!budgetItem.budget.effectiveDate)
        .length === 0 && <p>No budget items</p>}
      {budgetItems
        .filter((budgetItem) => !!budgetItem.budget.effectiveDate)
        .map((budgetItem) => {
          return (
            <BudgetItem
              key={`${budgetItem.budget.id}`}
              budgetItem={budgetItem}
              onReconsileClick={() => handleReconsiliation(budgetItem)}
              onViewTransactionsClick={() =>
                handlePreviewTransactionsClick(budgetItem)
              }
              onBudgetDetailsClick={() => handleBudgetItemClick(budgetItem)}
            />
          )
        })}
      {selectedBudgetItem && (
        <BudgetDetails
          open={detailsOpen}
          budgetItem={selectedBudgetItem}
          user={user}
          handleComplete={handleBudgetItemClose}
        />
      )}
      <TransactionsPreview
        open={previewOpen}
        transactions={previewTransactions}
        handleComplete={handlePreviewTransactionsClose}
      />
    </>
  )
}
