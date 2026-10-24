'use client'

import { Budget, Category } from '@/graphql/types'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { MoreVert } from '@mui/icons-material'
import { IconButton, Menu, MenuItem, TableCell, TableRow, TextField, Typography, lighten } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import SaveCancel from '@/components/forms/SaveCancel'
import CurrencyTextField from '../shared/CurrencyTextField'
import { formatMoneyCents, toCents } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import CategoryEditor from './CategoryEditor'
import ConfirmDialog from '../shared/ConfirmDialog'
import { DeleteBudgetDocument, GetBudgetsByAccountIdDocument, UpdateBudgetDocument } from '@/graphql/operations'

interface Fields {
  name: string
  amount: number
}

export default function BudgetRow({ budget, accountId }: { budget: Budget; accountId: number | null }) {
  const [deleteBudget] = useMutationWithToast(DeleteBudgetDocument, {
    refetchQueries: [
      {
        query: GetBudgetsByAccountIdDocument,
        variables: {
          accountId: Number(accountId),
        },
      },
    ],
  })
  const [updateBudget] = useMutationWithToast(UpdateBudgetDocument, {
    refetchQueries: [
      {
        query: GetBudgetsByAccountIdDocument,
        variables: {
          accountId: Number(accountId),
        },
      },
    ],
  })
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const [fields, setFields] = useState<Fields>({
    name: '',
    amount: budget.amount,
  })
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [isEditting, setIsEditting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const open = Boolean(anchorEl)

  function handleChange(field: string, value: string | number) {
    let newValue = value
    if (field === 'amount') {
      newValue = toCents(Number(newValue))
    }
    setFields({
      ...fields,
      [field]: newValue,
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
    // The amount starts as the saved one, so zero (a budget only spent from its balance) can be saved too.
    await updateBudget({
      variables: {
        nodeId: budget?.nodeId,
        name: fields.name || budget?.name || '',
        amount: fields.amount ?? budget?.amount,
      },
    })
    handleClose()
  }

  // Deleting rewrites past months, so it is confirmed first (see budgets.confirmDelete).
  function handleDelete() {
    setConfirmingDelete(true)
    setAnchorEl(null)
  }

  function handleConfirmDelete() {
    setConfirmingDelete(false)
    deleteBudget({
      variables: {
        nodeId: budget?.nodeId,
      },
    })
    handleClose()
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
              label={t('budgets.plannedAmount')}
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
      <ConfirmDialog
        open={confirmingDelete}
        title={t('budgets.confirmDeleteTitle', { name: budget.name ?? '' })}
        message={t('budgets.confirmDelete')}
        confirmLabel={t('shared.delete')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  )
}
