'use client'

import { Budget, Transaction } from '@/graphql/types'
import { Close } from '@mui/icons-material'
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useTranslations } from 'next-intl'
import { differenceInCalendarDays, differenceInMonths, format, getDaysInMonth } from 'date-fns'
import { formatMoney } from '@/lib/formatMoney'
import CategoryEditor from '../transactions/CategoryEditor'
import { BudgetItem } from '../reporting/Budgets'
import { useMemo } from 'react'
import { useDateFilterParams } from '@/lib/useDateFilterParams'

export default function BudgetDetails({
  open,
  budgetItem,
  handleComplete,
}: {
  open: boolean
  budgetItem: BudgetItem | null
  handleComplete: () => void
}) {
  const t = useTranslations('common')
  const { dateTo, dateFrom } = useDateFilterParams()

  //TODO: May need fake pagination to avoid rendering speed issues.

  const total = useMemo(() => {
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
    if (effectiveDate.getMonth() === dateTo.getMonth() && effectiveDate.getFullYear() === dateTo.getFullYear()) {
      //Same month..
      const diff = differenceInCalendarDays(dateTo, effectiveDate) + 1
      const daysInMonth = getDaysInMonth(effectiveDate)
      accruedAmount = Math.floor((amount / daysInMonth) * diff)
    } else {
      //Get accrued value of starting month
      const daysInEffectiveMonth = getDaysInMonth(effectiveDate)
      accruedAmount += Math.floor((amount / daysInEffectiveMonth) * (daysInEffectiveMonth - effectiveDate.getDate()))

      //Get accrued value of months in between
      const monthsDiff = differenceInMonths(dateTo, effectiveDate)
      accruedAmount += monthsDiff * amount
    }
    return transactionsTotal + startingAmount + accruedAmount
  }, [
    dateTo,
    budgetItem?.budgetTransactions,
    budgetItem?.budget.amount,
    budgetItem?.budget.startingAmount,
    budgetItem?.budget.effectiveDate,
  ])

  return (
    <Dialog open={open} maxWidth={'lg'}>
      <DialogTitle>{t('budgets.details')}</DialogTitle>
      <DialogContent>
        <TableContainer>
          <pre>${total / 100}</pre>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <IconButton onClick={handleComplete}>
          <Close />
        </IconButton>
      </DialogActions>
    </Dialog>
  )
}
