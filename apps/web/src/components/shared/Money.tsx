import { formatMoneyCents } from '@/lib/formatMoney'
import { Box, useTheme } from '@mui/material'
import { useAmountVisibility } from '@/components/context/AmountVisibilityContext'

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
  const { hidden } = useAmountVisibility()
  return (
    <Box
      component="span"
      sx={{
        color: colored ? (amountInCents > 0 ? theme.palette.money.positive : theme.palette.money.negative) : 'inheret',
      }}
    >
      {formatMoneyCents(amountInCents, currency, hidden)}
    </Box>
  )
}
