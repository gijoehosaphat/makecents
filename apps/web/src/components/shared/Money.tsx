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

  function color() {
    if (!colored) {
      return 'inherit'
    }
    if (amountInCents > 0) {
      return theme.palette.money.positive
    }
    if (amountInCents < 0) {
      return theme.palette.money.negative
    }
    return theme.palette.text.secondary
  }

  return (
    <Box
      component="span"
      sx={{
        color: color(),
      }}
    >
      {formatMoneyCents(amountInCents, currency, hidden)}
    </Box>
  )
}
