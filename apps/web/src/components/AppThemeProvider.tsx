'use client'

import { CssBaseline, ThemeProvider } from '@mui/material'
import { defaultTheme } from '@/lib/theme'

// The theme object holds functions, so it can't be passed from a server component; this wrapper lets server
// layouts (e.g. the account pages) use the same theme as the dashboard.
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={defaultTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
