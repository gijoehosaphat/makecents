'use client'

import { lightTheme } from '@/lib/theme'
import { Account, BankAccount, User } from '@/graphql/types'
import { Button, ThemeProvider } from '@mui/material'
import { SessionProvider } from 'next-auth/react'
import { AppContextProvider } from '@/components/context/AppContextProvider'
import { ApolloProvider } from '@/components/ApolloProvider'
import { SnackbarProvider, closeSnackbar } from 'notistack'
import { useTranslations } from 'next-intl'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

export function ClientProviders({
  children,
  user,
  accounts,
  bankAccounts,
}: {
  children: React.ReactNode
  user: User | null
  accounts: Account[]
  bankAccounts: BankAccount[]
}) {
  const t = useTranslations('common')

  return (
    <SnackbarProvider
      maxSnack={3}
      autoHideDuration={5000}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'center',
      }}
      action={(snackbarId) => (
        <Button variant={'text'} color={'inherit'} onClick={() => closeSnackbar(snackbarId)}>
          {t('shared.dismiss')}
        </Button>
      )}
    >
      <SessionProvider>
        <ApolloProvider>
          <AppContextProvider user={user} accounts={accounts} bankAccounts={bankAccounts}>
            <ThemeProvider theme={lightTheme}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>{children}</LocalizationProvider>
            </ThemeProvider>
          </AppContextProvider>
        </ApolloProvider>
      </SessionProvider>
    </SnackbarProvider>
  )
}
