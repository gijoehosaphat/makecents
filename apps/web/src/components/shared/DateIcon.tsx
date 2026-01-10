import { CalendarToday } from '@mui/icons-material'
import { Box, Typography, useTheme } from '@mui/material'
import { format } from 'date-fns'

export function DateIcon({ date }: { date: Date }) {
  const theme = useTheme()
  return (
    <Box position={'relative'}>
      <CalendarToday fontSize={'large'} color={'secondary'} />
      <Typography
        variant={'caption'}
        sx={{
          position: 'absolute',
          top: 2,
          left: 5,
          width: 20,
          textAlign: 'center',
          fontSize: 6,
          color: theme.palette.background.default,
          textTransform: 'uppercase',
          fontWeight: 800,
        }}
      >
        {format(date, 'MMM')}
      </Typography>
      <Typography variant={'subtitle2'} sx={{ position: 'absolute', top: 8, left: 5, width: 20, textAlign: 'center' }}>
        {format(date, 'd')}
      </Typography>
    </Box>
  )
}
