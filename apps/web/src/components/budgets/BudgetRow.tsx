'use client'

import { Budget, Category, User } from '@/graphql/types'
import { useMutation } from '@apollo/client/react'
import { MoreVert } from '@mui/icons-material'
import {
  Box,
  FormControlLabel,
  FormGroup,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  TableCell,
  TableRow,
  TextField,
  Typography,
  lighten,
} from '@mui/material'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import CategoryMatch from '@/components/categories/CategoryMatch'
import SaveCancel from '@/components/forms/SaveCancel'
import CurrencyTextField from '../shared/CurrencyTextField'
import { formatMoney, formatMoneyCents } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import CategoryEditor from './CategoryEditor'
import { DeleteBudgetDocument, GetBudgetsByUserIdDocument, UpdateBudgetDocument } from '@/graphql/operations'
import { DatePicker } from '@mui/x-date-pickers'
import { parse } from 'date-fns'

interface Fields {
  name: string
  amount: number
  startingAmount: number | null
  effectiveDate: Date | null
  userId: number
}

export default function BudgetRow({ budget, user }: { budget: Budget; user: User | null }) {
  const [deleteBudget] = useMutation(DeleteBudgetDocument, {
    refetchQueries: [
      {
        query: GetBudgetsByUserIdDocument,
        variables: {
          userId: Number(user?.id),
        },
      },
    ],
  })
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
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const [isSavingsBudget, setIsSavingsBudget] = useState(!!budget.effectiveDate)
  const [fields, setFields] = useState<Fields>({
    name: '',
    amount: budget.amount,
    startingAmount: budget.startingAmount,
    effectiveDate: budget.effectiveDate,
    userId: Number(user?.id),
  })
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [isEditting, setIsEditting] = useState(false)

  const open = Boolean(anchorEl)

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

  function handleClick(event: React.MouseEvent<HTMLButtonElement>, budget: Budget) {
    setAnchorEl(event.currentTarget)
  }

  function handleClose() {
    setIsEditting(false)
    setAnchorEl(null)
  }

  function handleEdit() {
    setIsEditting(true)
    setAnchorEl(null)
  }

  async function handleSave() {
    if (fields.name || fields.amount) {
      await updateBudget({
        variables: {
          nodeId: budget?.nodeId,
          name: fields.name || budget?.name || '',
          amount: fields.amount || budget?.amount,
          startingAmount: isSavingsBudget === true ? fields.startingAmount || budget?.startingAmount || null : null,
          effectiveDate: isSavingsBudget === true ? fields.effectiveDate || null : null,
        },
      })
    }
    handleClose()
  }

  function handleDelete() {
    deleteBudget({
      variables: {
        nodeId: budget?.nodeId,
      },
    })
    handleClose()
  }

  function handleIsSavingsBudget() {
    setIsSavingsBudget(!isSavingsBudget)
  }

  return (
    <>
      <TableRow
        sx={(theme) => ({
          '&:hover': {
            '.budget-row-hover': { visibility: 'visible' },
          },
          backgroundColor: lighten(theme.palette.background.default, isEditting ? 0.05 : 0),
        })}
        hover={true}
      >
        <TableCell size={'small'} sx={{ width: '15%' }}>
          {isEditting ? (
            <TextField
              label={t('forms.addName')}
              onChange={(event) => handleChange('name', event.currentTarget.value)}
              size={'small'}
              placeholder={t('forms.namePlaceholder')}
              defaultValue={budget.name}
              sx={{ mr: 2 }}
            />
          ) : (
            <Typography variant={'body2'}>{budget.name}</Typography>
          )}
        </TableCell>
        <TableCell size={'small'} sx={{ width: '10%' }}>
          {isEditting ? (
            <CurrencyTextField
              label={t('forms.addAmount')}
              onValueChange={(value) => handleChange('amount', value)}
              size={'small'}
              placeholder={t('forms.amountPlaceholder')}
              defaultValue={budget.amount / 100}
              value={fields.amount / 100}
              sx={{ mr: 2 }}
            />
          ) : (
            <Typography variant={'body2'}>{formatMoneyCents(budget.amount, 'CAD', hidden)}</Typography>
          )}
        </TableCell>
        <TableCell size={'small'} align={'left'}>
          <CategoryEditor budget={budget} budgetCategories={budget.budgetCategoriesByBudgetId?.nodes || []} />
        </TableCell>
        <TableCell size={'small'} sx={{ width: '15%' }}>
          {isEditting && isSavingsBudget && (
            <CurrencyTextField
              label={t('budgets.startingAmount')}
              onValueChange={(value) => handleChange('startingAmount', value)}
              size={'small'}
              placeholder={t('forms.amountPlaceholder')}
              defaultValue={budget.startingAmount / 100}
              value={fields.startingAmount ? fields.startingAmount / 100 : 0}
              sx={{ mr: 2 }}
            />
          )}
          {!isEditting && isSavingsBudget && (
            <Typography variant={'body2'}>{formatMoneyCents(budget.startingAmount, 'CAD', hidden)}</Typography>
          )}
        </TableCell>
        <TableCell size={'small'} align={'right'} sx={{ width: '15%' }}>
          {isEditting && isSavingsBudget && (
            <Box sx={{ input: { padding: '8px' } }}>
              <DatePicker value={new Date(fields.effectiveDate || new Date())} onChange={handleDateChange} />
            </Box>
          )}
          {!isEditting && isSavingsBudget && budget.effectiveDate && (
            <Typography variant={'body2'}>{format(new Date(budget.effectiveDate), 'MMM dd, yyyy')}</Typography>
          )}
        </TableCell>
        <TableCell size={'small'} align={'right'} sx={{ width: '10%' }}>
          {isEditting ? (
            <>
              <SaveCancel handleSave={handleSave} handleCancel={handleClose} />
            </>
          ) : (
            <IconButton
              onClick={(event) => {
                handleClick(event, budget)
              }}
            >
              <MoreVert />
            </IconButton>
          )}
        </TableCell>
      </TableRow>
      {isEditting && (
        <TableRow sx={(theme) => ({ backgroundColor: lighten(theme.palette.background.default, 0.05) })}>
          <TableCell colSpan={6}>
            <FormGroup>
              <FormControlLabel
                control={<Switch checked={isSavingsBudget} onChange={handleIsSavingsBudget} size={'small'} />}
                label={t('budgets.accrue')}
              />
            </FormGroup>
          </TableCell>
        </TableRow>
      )}
      <Menu
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'basic-button',
        }}
      >
        <MenuItem onClick={handleEdit}>{t('shared.edit')}</MenuItem>
        <MenuItem onClick={handleDelete}>{t('shared.delete')}</MenuItem>
      </Menu>
    </>
  )
}
