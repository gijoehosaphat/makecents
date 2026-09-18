'use client'

import { signIn } from 'next-auth/react'
import { Alert, Box, Button, Link as MuiLink, TextField } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import Link from 'next/link'

export default function SignIn() {
  const t = useTranslations('common')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(false)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setSubmitting(false)

    if (result?.error) {
      setError(true)
    } else {
      window.location.href = '/'
    }
  }

  return (
    <Box component={'form'} onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: 320 }}>
      {error && <Alert severity={'error'}>{t('auth.invalidCredentials')}</Alert>}
      <TextField
        label={t('auth.email')}
        type={'email'}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        autoFocus
      />
      <TextField
        label={t('auth.password')}
        type={'password'}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <Button type={'submit'} variant={'contained'} color={'primary'} disabled={submitting}>
        {t('auth.signIn')}
      </Button>
      <MuiLink component={Link} href={'/account/signUp'}>
        {t('auth.noAccount')}
      </MuiLink>
    </Box>
  )
}
