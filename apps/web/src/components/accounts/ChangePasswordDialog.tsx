'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation } from '@apollo/client/react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'
import { useTranslations } from 'next-intl'
import { ChangeUserPasswordDocument } from '@/graphql/operations'

export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('common')
  const { data: session } = useSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [changeUserPassword, { loading }] = useMutation(ChangeUserPasswordDocument)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (newPassword !== confirmNewPassword) {
      setError(t('auth.passwordsDoNotMatch'))
      return
    }

    const response = await changeUserPassword({
      variables: {
        userId: Number(session?.user?.id),
        currentPassword,
        newPassword,
      },
    })

    if (!response?.data?.changeUserPassword?.boolean) {
      setError(t('auth.incorrectCurrentPassword'))
      return
    }

    setSuccess(true)
  }

  return (
    <Dialog open onClose={onClose} maxWidth={'xs'} fullWidth>
      <DialogTitle>{t('auth.changePassword')}</DialogTitle>
      <Box component={'form'} onSubmit={handleSubmit}>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity={'error'}>{error}</Alert>}
          {success && <Alert severity={'success'}>{t('auth.passwordChanged')}</Alert>}
          <TextField
            label={t('auth.currentPassword')}
            type={'password'}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            autoFocus
          />
          <TextField
            label={t('auth.newPassword')}
            type={'password'}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
          <TextField
            label={t('auth.confirmNewPassword')}
            type={'password'}
            value={confirmNewPassword}
            onChange={(event) => setConfirmNewPassword(event.target.value)}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('shared.cancel')}</Button>
          <Button type={'submit'} variant={'contained'} disabled={loading}>
            {t('auth.changePassword')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
