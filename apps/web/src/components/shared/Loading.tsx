import { Box, CircularProgress } from '@mui/material'

export function Loading() {
  return (
    <Box sx={{ position: 'fixed', top: '50vh', right: '50vw' }}>
      <CircularProgress color={'success'} />
    </Box>
  )
}
