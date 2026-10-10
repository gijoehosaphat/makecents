'use client'

import { Category } from '@/graphql/types'
import { useMutation } from '@apollo/client/react'
import { MoreVert } from '@mui/icons-material'
import { Chip, IconButton, Menu, MenuItem, Select, TableCell, TableRow, TextField, Typography } from '@mui/material'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useSnackbar } from 'notistack'
import CategoryMatch from '@/components/categories/CategoryMatch'
import SaveCancel from '@/components/forms/SaveCancel'
import { CategoryGroupEditor } from './CategoryGroupEditor'
import { DeleteCategoryByIdDocument, GetCategoriesDocument, UpdateCategoryDocument } from '@/graphql/operations'

export default function CategoryRow({ category, accountId }: { category: Category | null; accountId: number | null }) {
  const [deleteCategoryById] = useMutation(DeleteCategoryByIdDocument, {
    refetchQueries: [
      {
        query: GetCategoriesDocument,
        variables: {
          accountId: Number(accountId),
        },
      },
    ],
  })
  const [updateCategory] = useMutation(UpdateCategoryDocument, {
    refetchQueries: [
      {
        query: GetCategoriesDocument,
        variables: {
          accountId: Number(accountId),
        },
      },
    ],
  })
  const t = useTranslations('common')
  const { enqueueSnackbar } = useSnackbar()
  const [fields, setFields] = useState({ name: '', regex: '', kind: '' })
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedCategory, setSelectedCategory] = useState<null | Category>(null)
  const [isEditting, setIsEditting] = useState(false)
  const [isFindOpen, setIsFindOpen] = useState(false)

  const open = Boolean(anchorEl)

  function handleChange(field: string, value: string) {
    setFields({
      ...fields,
      [field]: value,
    })
  }

  function handleClick(event: React.MouseEvent<HTMLButtonElement>, category: Category) {
    setAnchorEl(event.currentTarget)
    setSelectedCategory(category)
  }

  function handleClose() {
    setIsEditting(false)
    setIsFindOpen(false)
    setAnchorEl(null)
    setSelectedCategory(null)
  }

  function handleEdit() {
    setIsEditting(true)
    setAnchorEl(null)
  }

  async function handleSave() {
    if (fields.name || fields.regex || fields.kind) {
      if (category?.nodeId) {
        try {
          await updateCategory({
            variables: {
              nodeId: category?.nodeId,
              name: fields.name || category?.name,
              regex: fields.regex || category?.regex,
              kind: fields.kind || category?.kind,
            },
          })
        } catch (error) {
          // e.g. a payroll category cannot belong to a budget
          enqueueSnackbar(error instanceof Error ? error.message : t('categories.kind.saveFailed'), { variant: 'error' })
        }
      }
    }
    handleClose()
  }

  function handleFind() {
    setIsFindOpen(true)
  }

  function handleDelete() {
    if (selectedCategory?.id) {
      deleteCategoryById({
        variables: {
          id: selectedCategory?.id,
        },
      })
    }
    handleClose()
  }

  function handleMatchComplete() {
    handleClose()
  }

  if (category) {
    return (
      <>
        <TableRow>
          <TableCell size={'small'} sx={{ width: '20%' }}>
            {isEditting ? (
              <TextField
                label={t('forms.addName')}
                onChange={(event) => handleChange('name', event.currentTarget.value)}
                size={'small'}
                placeholder={t('forms.namePlaceholder')}
                defaultValue={category.name}
                sx={{ mr: 2 }}
              />
            ) : (
              <Typography variant={'body2'}>{category.name}</Typography>
            )}
          </TableCell>
          <TableCell size={'small'}>
            {isEditting ? (
              <TextField
                label={t('forms.addRegex')}
                onChange={(event) => handleChange('regex', event.currentTarget.value)}
                size={'small'}
                placeholder={t('forms.regexPlaceholder')}
                defaultValue={category.regex}
                sx={{ mr: 2 }}
              />
            ) : (
              <Typography variant={'body2'}>/{category.regex || t('categories.noRegex')}/gmi</Typography>
            )}
          </TableCell>
          <TableCell size={'small'} sx={{ width: '15%' }}>
            {isEditting ? (
              <Select
                size={'small'}
                value={fields.kind || category.kind}
                onChange={(event) => handleChange('kind', event.target.value)}
                aria-label={t('categories.kind.label')}
              >
                {['spending', 'payroll'].map((kind) => (
                  <MenuItem key={kind} value={kind}>
                    {t(`categories.kind.${kind}`)}
                  </MenuItem>
                ))}
              </Select>
            ) : (
              category.isPayroll && (
                <Chip
                  size={'small'}
                  label={category.kind === 'payroll' ? t('categories.kind.payroll') : t('categories.kind.payrollViaGroup')}
                />
              )
            )}
          </TableCell>
          <TableCell size={'small'} align={'right'} sx={{ width: '15%' }}>
            <Typography variant={'body2'}>{format(new Date(category.updatedAt), 'MMM dd, yyyy')}</Typography>
          </TableCell>
          <TableCell size={'small'} align={'right'} sx={{ width: '15%' }}>
            <CategoryGroupEditor category={category} />
          </TableCell>
          <TableCell size={'small'} align={'right'} sx={{ width: '10%' }}>
            {isEditting ? (
              <>
                <SaveCancel handleSave={handleSave} handleCancel={handleClose} />
              </>
            ) : (
              <IconButton
                onClick={(event) => {
                  handleClick(event, category)
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
          <MenuItem onClick={handleFind}>{t('categories.findTransactions')}</MenuItem>
          <MenuItem onClick={handleDelete}>{t('shared.delete')}</MenuItem>
        </Menu>
        {selectedCategory && (
          <CategoryMatch
            open={isFindOpen}
            category={selectedCategory}
            handleComplete={handleMatchComplete}
          />
        )}
      </>
    )
  } else {
    return null
  }
}
