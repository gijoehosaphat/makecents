import { formatMoneyCents } from '@/lib/formatMoney'
import { Box, useTheme } from '@mui/material'

export function Money({
  amountInCents,
  currency,
  colored = true,
}: {
  amountInCents: number
  currency: string
  colored?: boolean
}) {
  const theme = useTheme()
  return (
    <Box
      component="span"
      sx={{
        color: colored ? (amountInCents > 0 ? theme.palette.money.positive : theme.palette.money.negative) : 'inheret',
      }}
    >
      {formatMoneyCents(amountInCents, currency)}
    </Box>
  )
}
