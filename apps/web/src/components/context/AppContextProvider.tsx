import React, { useContext, useEffect, useState, createContext, useDeferredValue } from 'react'
import { User, BankAccount, Account } from '@/graphql/types'
import { useParams } from 'next/navigation'

export interface AppContext {
  user: User | null
  accounts: Account[]
  bankAccounts: BankAccount[]
  currentAccountId: number | null
  currentBankAccountId: number | null
}

const defaultAppContext = {
  user: null,
  accounts: [],
  bankAccounts: [],
  currentAccountId: null,
  currentBankAccountId: null,
}

export const AppContext = createContext<AppContext>(defaultAppContext)

export function AppContextProvider({
  children,
  user,
  accounts,
  bankAccounts,
}: {
  children?: React.ReactNode
  user: User | null
  accounts: Account[]
  bankAccounts: BankAccount[]
}) {
  const params = useParams()
  const [userContextValue, setUserContextValue] = useState<AppContext>(defaultAppContext)

  useEffect(() => {
    if (user && accounts && bankAccounts) {
      const currentAccountId = Number(params?.accountId) || null
      const currentBankAccountId = Number(params?.bankAccountId) || null
      setUserContextValue({ user, accounts, bankAccounts, currentAccountId, currentBankAccountId })
    }
  }, [user, accounts, bankAccounts, params?.accountId, params?.bankAccountId])

  return <AppContext.Provider value={userContextValue}>{children}</AppContext.Provider>
}

export function useAppContext() {
  return useDeferredValue(useContext(AppContext))
}
