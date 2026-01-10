import { BarChart, Home, Settings } from '@mui/icons-material'
import { Box, Divider, Typography } from '@mui/material'

export function PageTitle({ icon, title }: { icon: string; title: string }) {
  let iconComponent: React.ReactElement | null = null
  switch (icon) {
    case 'settings':
      iconComponent = <Settings fontSize={'large'} color={'secondary'} sx={{ mt: 1, mr: 3 }} />
      break
    case 'barChart':
      iconComponent = <BarChart fontSize={'large'} color={'secondary'} sx={{ mt: 1, mr: 3 }} />
      break
    case 'home':
      iconComponent = <Home fontSize={'large'} color={'secondary'} sx={{ mt: 1, mr: 3 }} />
      break
  }

  return (
    <>
      <Box style={{ display: 'flex', flexDirection: 'row' }}>
        {iconComponent}
        <Typography variant={'h1'} sx={{ mb: 4, mt: 2 }}>
          {title}
        </Typography>
      </Box>
      <Divider />
    </>
  )
}
