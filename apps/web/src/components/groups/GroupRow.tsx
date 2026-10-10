'use client'

import { CustomCategoryGroup } from '@/graphql/types'
import { useMutation } from '@apollo/client/react'
import { MoreVert } from '@mui/icons-material'
import { Chip, IconButton, Menu, MenuItem, Select, TableCell, TableRow, TextField, Typography } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useSnackbar } from 'notistack'
import SaveCancel from '@/components/forms/SaveCancel'
import {
  DeleteCustomCategoryGroupDocument,
  GetCustomCategoryGroupsDocument,
  UpsertCustomCategoryGroupDocument,
} from '@/graphql/operations'

export default function GroupRow({ group, accountId }: { group: CustomCategoryGroup; accountId: number | null }) {
  const [deleteGroup] = useMutation(DeleteCustomCategoryGroupDocument, {
    refetchQueries: [
      {
        query: GetCustomCategoryGroupsDocument,
        variables: {
          accountId,
        },
      },
    ],
  })
  // A group's type changes which of its categories count as payroll, so everything on screen is refreshed.
  const [updateGroup] = useMutation(UpsertCustomCategoryGroupDocument, { refetchQueries: 'active' })
  const t = useTranslations('common')
  const { enqueueSnackbar } = useSnackbar()
  const [fields, setFields] = useState({ name: '', kind: '' })
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [isEditting, setIsEditting] = useState(false)

  const open = Boolean(anchorEl)

  function handleChange(field: string, value: string | number) {
    setFields({
      ...fields,
      [field]: value,
    })
  }

  function handleClick(event: React.MouseEvent<HTMLButtonElement>, group: CustomCategoryGroup) {
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
    if ((fields.name || fields.kind) && accountId) {
      try {
        await updateGroup({
          variables: {
            id: group?.id,
            name: fields.name || group.name || '',
            kind: fields.kind || group.kind,
            accountId,
          },
        })
      } catch (error) {
        // e.g. a payroll group cannot contain categories that are in a budget
        enqueueSnackbar(error instanceof Error ? error.message : t('groups.kind.saveFailed'), { variant: 'error' })
      }
    }
    handleClose()
  }

  function handleDelete() {
    deleteGroup({
      variables: {
        nodeId: group?.nodeId,
      },
    })
    handleClose()
  }

  return (
    <>
      <TableRow
        sx={() => ({
          '&:hover': {
            '.budget-row-hover': { visibility: 'visible' },
          },
        })}
        hover={true}
      >
        <TableCell size={'small'} sx={{ width: '20%' }}>
          {isEditting ? (
            <TextField
              label={t('forms.addName')}
              onChange={(event) => handleChange('name', event.currentTarget.value)}
              size={'small'}
              placeholder={t('forms.namePlaceholder')}
              defaultValue={group.name}
              sx={{ mr: 2 }}
            />
          ) : (
            <Typography variant={'body2'}>{group.name}</Typography>
          )}
        </TableCell>
        {/* <TableCell size={'small'} sx={{ width: '20%' }}>
          {isEditting ? (
            <CurrencyTextField
              label={t('forms.addAmount')}
              onValueChange={(value) => handleChange('amount', value)}
              size={'small'}
              placeholder={t('forms.amountPlaceholder')}
              defaultValue={budget.amount}
              sx={{ mr: 2 }}
            />
          ) : (
            <Typography variant={'body2'}>{formatMoneyCents(budget.amount, 'CAD')}</Typography>
          )}
        </TableCell> */}
        {/* <TableCell size={'small'} align={'left'}>
          <CategoryEditor budget={budget} budgetCategories={budget.budgetCategoriesByBudgetId?.nodes || []} />
        </TableCell> */}
        {/* <TableCell size={'small'} align={'right'} sx={{ width: '10%' }}>
          <Typography variant={'body2'}>{format(new Date(group.updatedAt), 'MMM dd, yyyy')}</Typography>
        </TableCell> */}
        <TableCell size={'small'} sx={{ width: '20%' }}>
          {isEditting ? (
            <Select
              size={'small'}
              value={fields.kind || group.kind}
              onChange={(event) => handleChange('kind', event.target.value)}
              aria-label={t('groups.kind.label')}
            >
              {['spending', 'payroll'].map((kind) => (
                <MenuItem key={kind} value={kind}>
                  {t(`groups.kind.${kind}`)}
                </MenuItem>
              ))}
            </Select>
          ) : (
            group.kind === 'payroll' && <Chip size={'small'} label={t('groups.kind.payroll')} />
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
                handleClick(event, group)
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
    </>
  )
}
