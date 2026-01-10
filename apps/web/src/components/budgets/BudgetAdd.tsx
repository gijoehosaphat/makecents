'use client'

import { User } from '@/graphql/types'
import { useMutation } from '@apollo/client/react'
import { Add } from '@mui/icons-material'
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Fab, TextField } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import SaveCancel from '@/components/forms/SaveCancel'
import CurrencyTextField from '../shared/CurrencyTextField'
import { CreateBudgetDocument, GetBudgetsByUserIdDocument } from '@/graphql/operations'

export default function BudgetAdd({ user }: { user: User }) {
  const t = useTranslations('common')
  const [fields, setFields] = useState({ name: '', amount: 0, userId: Number(user.id) })
  const [isEditting, setIsEditting] = useState(false)
  const [createBudget] = useMutation(CreateBudgetDocument, {
    refetchQueries: [
      {
        query: GetBudgetsByUserIdDocument,
        variables: {
          userId: Number(user?.id),
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

  async function handleAddBudget() {
    if (fields.name) {
      await createBudget({
        variables: {
          name: fields.name,
          amount: fields.amount * 100,
          userId: fields.userId,
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
        <DialogTitle>{t('budgets.addBudget')}</DialogTitle>
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
            <CurrencyTextField
              label={t('forms.addAmount')}
              onValueChange={(value) => handleChange('amount', value)}
              size={'small'}
              placeholder={t('forms.amountPlaceholder')}
              sx={{ mb: 4 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <SaveCancel handleSave={handleAddBudget} handleCancel={handleClose} />
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
        {t('budgets.addBudget')}
      </Fab>
    </>
  )
}
