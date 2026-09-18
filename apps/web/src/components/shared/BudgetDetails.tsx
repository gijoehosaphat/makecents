'use client'

import { User } from '@/graphql/types'
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslations } from 'next-intl'
import {
  differenceInCalendarDays,
  differenceInMonths,
  getDaysInMonth,
} from 'date-fns'
import { formatMoney } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { BudgetItem } from '../reporting/Budgets'
import { useMemo, useState } from 'react'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import CurrencyTextField from './CurrencyTextField'
import SaveCancel from '../forms/SaveCancel'
import { DatePicker } from '@mui/x-date-pickers'
import {
  GetBudgetsByUserIdDocument,
  UpdateBudgetDocument,
} from '@/graphql/operations'
import { useMutation } from '@apollo/client/react'

interface Fields {
  name: string
  amount: number
  startingAmount: number | null
  effectiveDate: Date | null
  userId: number
}

export default function BudgetDetails({
  open,
  budgetItem,
  user,
  handleComplete,
}: {
  open: boolean
  budgetItem: BudgetItem | null
  user: User | null
  handleComplete: () => void
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const { dateTo } = useDateFilterParams()
  const [updateBudget] = useMutation(UpdateBudgetDocument, {
    refetchQueries: [
      {
        query: GetBudgetsByUserIdDocument,
        variables: {
          userId: Number(user?.id),
        },
      },
    ],
  })
  const [fields, setFields] = useState<Fields>({
    name: '',
    amount: budgetItem?.budget.amount || 0,
    startingAmount: budgetItem?.budget.startingAmount || 0,
    effectiveDate: budgetItem?.budget.effectiveDate
      ? new Date(budgetItem.budget.effectiveDate)
      : null,
    userId: user ? Number(user.id) : 0,
  })

  const total = useMemo(() => {
    if (fields.effectiveDate) {
      const effectiveDate = new Date(fields.effectiveDate)
      const amount = Number(fields.amount)
      const startingAmount = Number(fields.startingAmount)
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
    fields.amount,
    fields.startingAmount,
    fields.effectiveDate,
  ])

  function handleChange(field: string, value: string | number) {
    let newValue = value
    if (field === 'amount' || field === 'startingAmount') {
      newValue = Math.floor(Number(newValue) * 100)
    }
    setFields({
      ...fields,
      [field]: newValue,
    })
  }

  function handleDateChange(value: Date | null) {
    setFields({
      ...fields,
      effectiveDate: value,
    })
  }

  async function handleSave() {
    if (budgetItem) {
      await updateBudget({
        variables: {
          nodeId: budgetItem?.budget?.nodeId,
          name: fields.name || budgetItem?.budget?.name || '',
          amount: fields.amount || budgetItem?.budget?.amount,
          startingAmount: fields.startingAmount || 0,
          effectiveDate: fields.effectiveDate || null,
        },
      })
    }
    handleComplete()
  }

  function handleClose() {
    handleComplete()
  }

  return (
    <Dialog open={open} maxWidth={'lg'}>
      <DialogTitle>{t('budgets.details')}</DialogTitle>
      <DialogContent>
        {budgetItem && (
          <Box display={'flex'} flexDirection={'column'} sx={{ pt: 4 }}>
            <TextField
              label={t('forms.addName')}
              onChange={(event) =>
                handleChange('name', event.currentTarget.value)
              }
              size={'small'}
              placeholder={t('forms.namePlaceholder')}
              defaultValue={budgetItem.budget.name}
              sx={{ mb: 4 }}
            />
            <CurrencyTextField
              label={t('forms.addAmount')}
              onValueChange={(value) => handleChange('amount', value)}
              size={'small'}
              placeholder={t('forms.amountPlaceholder')}
              defaultValue={budgetItem.budget.amount / 100}
              value={fields.amount / 100}
              sx={{ mb: 4 }}
            />
            {/* <CategoryEditor budget={budget} budgetCategories={budget.budgetCategoriesByBudgetId?.nodes || []} /> */}
            <CurrencyTextField
              label={t('budgets.startingAmount')}
              onValueChange={(value) => handleChange('startingAmount', value)}
              size={'small'}
              placeholder={t('forms.amountPlaceholder')}
              defaultValue={budgetItem.budget.startingAmount / 100}
              value={fields.startingAmount ? fields.startingAmount / 100 : 0}
              sx={{ mb: 4 }}
            />
            <Box sx={{ input: { padding: '8px' } }}>
              <DatePicker
                value={new Date(fields.effectiveDate || new Date())}
                onChange={handleDateChange}
              />
            </Box>
            <Box
              display={'flex'}
              justifyContent={'space-between'}
              alignItems={'center'}
              mt={4}
            >
              <Typography>Total: </Typography>
              <Typography>{formatMoney(total / 100, 'CAD', hidden)}</Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <SaveCancel handleSave={handleSave} handleCancel={handleClose} />
      </DialogActions>
    </Dialog>
  )
}
