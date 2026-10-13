'use client'

import { Box, Divider, Paper, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useAmountVisibility } from '@/components/context/AmountVisibilityContext'
import { formatMoneyCents } from '@/lib/formatMoney'
import { Money } from './Money'

export const DEFAULT_CURRENCY = 'CAD'

// Picks the selected currency, falling back to CAD, then the first available.
export function resolveCurrency(currencies: string[], selected?: string) {
  if (selected && currencies.includes(selected)) {
    return selected
  }
  return currencies.includes(DEFAULT_CURRENCY) ? DEFAULT_CURRENCY : currencies[0]
}

function TotalColumn({
  label,
  amountInCents,
  transferInCents,
  currency,
}: {
  label: string
  amountInCents: number
  transferInCents: number
  currency: string
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()

  return (
    <Box sx={{ flex: 1, minWidth: 0, p: 3 }}>
      <Typography variant={'overline'} color={'text.secondary'} sx={{ lineHeight: 1.5 }}>
        {label}
      </Typography>
      <Typography variant={'h1'} sx={{ fontSize: { xs: 32, md: 44 }, wordBreak: 'break-word' }}>
        <Money amountInCents={amountInCents} currency={currency} colored />
      </Typography>
      {transferInCents !== 0 && (
        <Typography variant={'caption'} color={'text.secondary'} component={'div'}>
          {t('shared.transfersSubtitle', { amount: formatMoneyCents(transferInCents, currency, hidden) })}
        </Typography>
      )}
    </Box>
  )
}

/** Transfers between the user's own accounts are not real income or spending, so they are left out by default. */
export const EXCLUDE_TRANSFERS_FILTER = {
  transferByTransactionSourceIdExists: false,
  transferByTransactionTargetIdExists: false,
} as const

export const ONLY_TRANSFERS_FILTER = {
  or: [{ transferByTransactionSourceIdExists: true }, { transferByTransactionTargetIdExists: true }],
} as const

export function CurrencySwitcher({
  currencies,
  currency,
  onChange,
}: {
  currencies: string[]
  currency: string
  onChange: (currency: string) => void
}) {
  if (currencies.length < 2) {
    return null
  }
  return (
    <ToggleButtonGroup
      value={currency}
      exclusive
      size={'small'}
      onChange={(event, value: string | null) => value && onChange(value)}
      sx={{ '& .MuiToggleButton-root': { py: 0, px: 1, fontSize: 12, border: 0 } }}
    >
      {currencies.map((option) => (
        <ToggleButton key={option} value={option}>
          {option}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

export function CurrencyTotals({
  deposits,
  withdrawals,
  transferDeposits,
  transferWithdrawals,
  currency,
  currencies,
  onCurrencyChange,
}: {
  deposits: number
  withdrawals: number
  transferDeposits: number
  transferWithdrawals: number
  currency: string
  currencies: string[]
  onCurrencyChange: (currency: string) => void
}) {
  const t = useTranslations('common')

  return (
    <Paper variant={'outlined'} className={'CurrencyTotals-card'} sx={{ my: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
        <TotalColumn
          label={t('transactions.deposits')}
          amountInCents={deposits}
          transferInCents={transferDeposits}
          currency={currency}
        />
        <Divider orientation={'vertical'} flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
        <Divider sx={{ display: { xs: 'block', md: 'none' } }} />
        <TotalColumn
          label={t('transactions.withdrawals')}
          amountInCents={withdrawals}
          transferInCents={transferWithdrawals}
          currency={currency}
        />
        <Divider orientation={'vertical'} flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
        <Divider sx={{ display: { xs: 'block', md: 'none' } }} />
        <TotalColumn
          label={t('shared.net')}
          amountInCents={deposits + withdrawals}
          transferInCents={transferDeposits + transferWithdrawals}
          currency={currency}
        />
      </Box>
      {currencies.length > 1 && (
        // Dimmed until the card is hovered or focused, so the switcher hints at itself without adding noise.
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            px: 3,
            pb: 0.5,
            opacity: 0.3,
            transition: 'opacity 150ms',
            '@media (hover: none)': { opacity: 1 },
            '.CurrencyTotals-card:hover > &, .CurrencyTotals-card:focus-within > &': { opacity: 1 },
          }}
        >
          <CurrencySwitcher currencies={currencies} currency={currency} onChange={onCurrencyChange} />
        </Box>
      )}
    </Paper>
  )
}
