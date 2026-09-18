import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'hideAmounts'

export interface AmountVisibilityContext {
  hidden: boolean
  toggleHidden: () => void
}

const defaultAmountVisibilityContext: AmountVisibilityContext = {
  hidden: false,
  toggleHidden: () => {},
}

export const AmountVisibilityContext = createContext<AmountVisibilityContext>(defaultAmountVisibilityContext)

export function AmountVisibilityProvider({ children }: { children?: React.ReactNode }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(window.localStorage.getItem(STORAGE_KEY) === 'true')
  }, [])

  const toggleHidden = useCallback(() => {
    setHidden((current) => {
      const next = !current
      window.localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  return <AmountVisibilityContext.Provider value={{ hidden, toggleHidden }}>{children}</AmountVisibilityContext.Provider>
}

export function useAmountVisibility() {
  return useContext(AmountVisibilityContext)
}
