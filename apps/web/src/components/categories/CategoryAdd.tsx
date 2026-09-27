'use client'

import { useMutation } from '@apollo/client/react'
import { Add } from '@mui/icons-material'
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Fab, TextField } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import SaveCancel from '@/components/forms/SaveCancel'
import { CreateCategoryDocument, GetCategoriesDocument } from '@/graphql/operations'

export default function CategoryAdd({ accountId }: { accountId: number }) {
  const [createCategory] = useMutation(CreateCategoryDocument, {
    refetchQueries: [
      {
        query: GetCategoriesDocument,
        variables: {
          accountId,
        },
      },
    ],
  })
  const t = useTranslations('common')
  const [fields, setFields] = useState({ name: '', regex: '' })
  const [isEditting, setIsEditting] = useState(false)

  function handleChange(field: string, value: string) {
    setFields({
      ...fields,
      [field]: value,
    })
  }

  async function handleAddCategory() {
    if (fields.name) {
      await createCategory({ variables: { ...fields, accountId } })
      handleClose()
    }
  }

  function handleActionButton() {
    setIsEditting(true)
  }

  function handleClose() {
    setIsEditting(false)
  }

  return (
    <>
      <Dialog open={isEditting}>
        <DialogTitle>{t('categories.addCategory')}</DialogTitle>
        <DialogContent>
          <Box
            component={'form'}
            noValidate
            autoComplete={'off'}
            sx={{ mt: 2, display: 'flex', flexDirection: 'column' }}
          >
            <TextField
              label={t('forms.addName')}
              onChange={(event) => handleChange('name', event.currentTarget.value)}
              size={'small'}
              placeholder={t('categories.namePlaceholder')}
              sx={{ mb: 4 }}
            />
            <TextField
              label={t('forms.addRegex')}
              onChange={(event) => handleChange('regex', event.currentTarget.value)}
              size={'small'}
              placeholder={t('forms.regexPlaceholder')}
              sx={{ mb: 4 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <SaveCancel handleSave={handleAddCategory} handleCancel={handleClose} />
        </DialogActions>
      </Dialog>
      <Fab
        variant={'extended'}
        color={'primary'}
        aria-label={'add'}
        onClick={handleActionButton}
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
      >
        <Add />
        {t('categories.addCategory')}
      </Fab>
    </>
  )
}
