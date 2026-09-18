'use client'

import { getProviders, signIn } from 'next-auth/react'
import type { ClientSafeProvider } from 'next-auth/lib/client.js'
import { Google, HelpOutline } from '@mui/icons-material'
import { Button } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useState, useMemo, useEffect } from 'react'

export default function SignIn() {
  const [providers, setProviders] = useState<Record<
    string,
    ClientSafeProvider
  > | null>(null)
  const t = useTranslations('common')

  // const providers = useMemo(async () => {
  //   return await getProviders()
  // }, [])

  // console.log('Providers:', providers)

  useEffect(() => {
    async function fetchProviders() {
      const res = await getProviders()
      setProviders(res)
    }
    fetchProviders()
  }, [])

  return (
    <>
      {providers &&
        Object.values(providers).map((provider) => {
          let ProviderIcon = HelpOutline
          switch (provider.name.toLowerCase()) {
            case 'google':
              ProviderIcon = Google
              break
          }
          return (
            <div key={provider.name}>
              <Button
                variant={'contained'}
                color={'primary'}
                onClick={() => signIn(provider.id)}
                startIcon={<ProviderIcon />}
              >
                {t('auth.signInWith', { name: provider.name })}
              </Button>
            </div>
          )
        })}
    </>
  )
}
