import '@/styles/globals.css'
import { Box } from '@mui/material'
import React from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
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
  )
}
