'use client'

import { Box, FormControlLabel, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { useTranslations } from 'next-intl'
import { Money } from './Money'

export const DEFAULT_CURRENCY = 'CAD'

// Picks the selected currency, falling back to CAD, then the first available.
export function resolveCurrency(currencies: string[], selected?: string) {
  if (selected && currencies.includes(selected)) {
    return selected
  }
  return currencies.includes(DEFAULT_CURRENCY) ? DEFAULT_CURRENCY : currencies[0]
}

function MoneyGridItem({ label, amountInCents, currency }: { label: string; amountInCents: number; currency: string }) {
  return (
    <>
      <Typography variant={'h1'} sx={{ display: 'inline', fontSize: 50 }}>
        <Money amountInCents={amountInCents} currency={currency} colored />
      </Typography>
      <Typography variant={'h1'} sx={{ textTransform: 'uppercase' }}>
        {label}
      </Typography>
    </>
  )
}

/** Transfers between the user's own accounts are not real income or spending, so they are left out by default. */
export const EXCLUDE_TRANSFERS_FILTER = {
  transferByTransactionSourceIdExists: false,
  transferByTransactionTargetIdExists: false,
} as const

// The filter input rejects empty objects, so "no restriction" is a condition every row satisfies.
export const ANY_TRANSACTION_FILTER = { id: { isNull: false } } as const

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
  currency,
  currencies,
  onCurrencyChange,
  includeTransfers,
  onIncludeTransfersChange,
}: {
  deposits: number
  withdrawals: number
  currency: string
  currencies: string[]
  onCurrencyChange: (currency: string) => void
  includeTransfers: boolean
  onIncludeTransfersChange: (includeTransfers: boolean) => void
}) {
  const t = useTranslations('common')

  return (
    <Box sx={{ py: 2 }}>
      <Grid container>
        <Grid size={{ xs: 12, md: 4 }}>
          <MoneyGridItem label={t('transactions.deposits')} amountInCents={deposits} currency={currency} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <MoneyGridItem label={t('transactions.withdrawals')} amountInCents={withdrawals} currency={currency} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <MoneyGridItem label={t('shared.net')} amountInCents={deposits + withdrawals} currency={currency} />
        </Grid>
      </Grid>
      <Box sx={{ pt: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 }}>
        <CurrencySwitcher currencies={currencies} currency={currency} onChange={onCurrencyChange} />
        <FormControlLabel
          control={
            <Switch
              size={'small'}
              checked={includeTransfers}
              onChange={(event) => onIncludeTransfersChange(event.target.checked)}
            />
          }
          label={t('shared.includeTransfers')}
        />
      </Box>
    </Box>
  )
}
