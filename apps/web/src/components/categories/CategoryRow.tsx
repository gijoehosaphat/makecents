'use client'

import { Category, User } from '@/graphql/types'
import { useMutation } from '@apollo/client/react'
import { MoreVert } from '@mui/icons-material'
import { IconButton, Menu, MenuItem, TableCell, TableRow, TextField, Typography } from '@mui/material'
import { format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import CategoryMatch from '@/components/categories/CategoryMatch'
import SaveCancel from '@/components/forms/SaveCancel'
import { CategoryGroupEditor } from './CategoryGroupEditor'
import { DeleteCategoryByIdDocument, GetCategoriesDocument, UpdateCategoryDocument } from '@/graphql/operations'

export default function CategoryRow({ category, user }: { category: Category | null; user: User | null }) {
  const [deleteCategoryById] = useMutation(DeleteCategoryByIdDocument, {
    refetchQueries: [
      {
        query: GetCategoriesDocument,
        variables: {
          userId: Number(user?.id),
        },
      },
    ],
  })
  const [updateCategory] = useMutation(UpdateCategoryDocument, {
    refetchQueries: [
      {
        query: GetCategoriesDocument,
        variables: {
          userId: Number(user?.id),
        },
      },
    ],
  })
  const t = useTranslations('common')
  const [fields, setFields] = useState({ name: '', regex: '', userId: Number(user?.id) })
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
    if (fields.name || fields.regex) {
      if (category?.nodeId) {
        await updateCategory({
          variables: {
            nodeId: category?.nodeId,
            name: fields.name || category?.name,
            regex: fields.regex || category?.regex,
          },
        })
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
            user={user}
            handleComplete={handleMatchComplete}
          />
        )}
      </>
    )
  } else {
    return null
  }
}
