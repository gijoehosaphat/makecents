'use client'

import { signIn } from 'next-auth/react'
import { Alert, Box, Button, Link as MuiLink, TextField } from '@mui/material'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RegisterUserDocument } from '@/graphql/operations'

export default function SignUp() {
  const t = useTranslations('common')
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [registerUser, { loading }] = useMutationWithToast(RegisterUserDocument, { reportErrors: false })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'))
      return
    }

    try {
      await registerUser({ variables: { email, password, name: name || null } })
    } catch {
      setError(t('auth.registrationFailed'))
      return
    }

    const result = await signIn('credentials', { email, password, redirect: false })

    if (result?.error) {
      setError(t('auth.invalidCredentials'))
    } else {
      // Navigate within the app rather than reloading the document, so the themed page stays on screen
      router.replace('/')
    }
  }

  return (
    <Box
      component={'form'}
      onSubmit={handleSubmit}
      sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: 320 }}
    >
      {error && <Alert severity={'error'}>{error}</Alert>}
      <TextField label={t('shared.name')} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
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
        required
      />
      <TextField
        label={t('auth.confirmPassword')}
        type={'password'}
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        required
      />
      <Button type={'submit'} variant={'contained'} color={'primary'} disabled={loading}>
        {t('auth.signUp')}
      </Button>
      <MuiLink component={Link} href={'/account/signIn'}>
        {t('auth.haveAccount')}
      </MuiLink>
    </Box>
  )
}
