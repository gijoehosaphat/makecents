'use client'

import { useState } from 'react'
import { CombinedGraphQLErrors } from '@apollo/client'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'
import { useTranslations } from 'next-intl'
import { AddAccountUserDocument } from '@/graphql/operations'

const MIN_PASSWORD_LENGTH = 8

export default function AddUserDialog({
  accountId,
  onAdded,
  onClose,
}: {
  accountId: number
  onAdded: () => void
  onClose: () => void
}) {
  const t = useTranslations('common')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [addAccountUser, { loading }] = useMutationWithToast(AddAccountUserDocument, { reportErrors: false })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('users.passwordTooShort', { length: MIN_PASSWORD_LENGTH }))
      return
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'))
      return
    }

    try {
      await addAccountUser({ variables: { accountId, email, password, name: name || null } })
    } catch (e) {
      setError(
        CombinedGraphQLErrors.is(e) && /already exists/.test(e.message) ? t('users.emailTaken') : t('users.addFailed'),
      )
      return
    }

    onAdded()
    onClose()
  }

  return (
    <Dialog open onClose={onClose} maxWidth={'xs'} fullWidth>
      <DialogTitle>{t('users.add')}</DialogTitle>
      <Box component={'form'} onSubmit={handleSubmit}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity={'error'}>{error}</Alert>}
          <TextField
            label={t('shared.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            sx={{ mt: 1 }}
          />
          <TextField
            label={t('auth.email')}
            type={'email'}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <TextField
            label={t('auth.password')}
            type={'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            helperText={t('users.passwordHint')}
            autoComplete={'new-password'}
            required
          />
          <TextField
            label={t('auth.confirmPassword')}
            type={'password'}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete={'new-password'}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('shared.cancel')}</Button>
          <Button type={'submit'} variant={'contained'} disabled={loading}>
            {t('users.add')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
