import '@/styles/globals.css'
import { Box } from '@mui/material'
import React from 'react'
import { ApolloProvider } from '@/components/ApolloProvider'
import { AppThemeProvider } from '@/components/AppThemeProvider'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ApolloProvider>
      <AppThemeProvider>
        <Box
          component={'main'}
          sx={{
            flexGrow: 1,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </Box>
      </AppThemeProvider>
    </ApolloProvider>
  )
}
