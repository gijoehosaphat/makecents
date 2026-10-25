import { Box, CircularProgress } from '@mui/material'

// Centers within the nearest positioned ancestor (the dashboard's scrollable content area),
// so the spinner sits in the middle of the space the page renders into rather than the viewport.
export function Loading() {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <CircularProgress color={'success'} />
    </Box>
  )
}
