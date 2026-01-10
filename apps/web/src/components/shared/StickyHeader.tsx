import { Box } from '@mui/material'

export function StickyHeader({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={(theme) => ({
        backgroundColor: theme.palette.background.default,
        zIndex: theme.zIndex.appBar,
        position: 'sticky',
        top: 0,
      })}
    >
      {children}
    </Box>
  )
}
