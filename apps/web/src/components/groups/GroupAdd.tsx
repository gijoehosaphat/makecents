'use client'

import { useMutation } from '@apollo/client/react'
import { Add } from '@mui/icons-material'
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Fab, TextField } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import SaveCancel from '@/components/forms/SaveCancel'
import { GetCustomCategoryGroupsDocument, UpsertCustomCategoryGroupDocument } from '@/graphql/operations'

export default function GroupAdd({ accountId }: { accountId: number }) {
  const t = useTranslations('common')
  const [fields, setFields] = useState({ name: '' })
  const [isEditting, setIsEditting] = useState(false)
  const [createGroup] = useMutation(UpsertCustomCategoryGroupDocument, {
    refetchQueries: [
      {
        query: GetCustomCategoryGroupsDocument,
        variables: {
          accountId,
        },
      },
    ],
  })

  function handleChange(field: string, value: string | number) {
    setFields({
      ...fields,
      [field]: value,
    })
  }

  async function handleAddGroup() {
    if (fields.name) {
      await createGroup({
        variables: {
          ...fields,
          accountId,
        },
      })
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
        <DialogTitle>{t('groups.addGroup')}</DialogTitle>
        <DialogContent>
          <Box
            component={'form'}
            noValidate
            autoComplete={'off'}
            sx={{ pt: 2, display: 'flex', flexDirection: 'column' }}
          >
            <TextField
              label={t('forms.addName')}
              onChange={(event) => handleChange('name', event.currentTarget.value)}
              size={'small'}
              placeholder={t('forms.namePlaceholder')}
              sx={{ mb: 4 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <SaveCancel handleSave={handleAddGroup} handleCancel={handleClose} />
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
        {t('groups.addGroup')}
      </Fab>
    </>
  )
}
