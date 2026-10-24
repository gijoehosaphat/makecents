'use client'

import { useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material'
import { useTranslations } from 'next-intl'
import CurrencyTextField from '../shared/CurrencyTextField'
import { formatMoneyCents, toCents } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { EnvelopeBudgetRow } from '@/lib/useEnvelopeBudget'

/** Ready to Assign is not a budget; the selects use this value for it. */
const READY_TO_ASSIGN = 'ready'

export interface MoveRequest {
  /** Budget id, or null for Ready to Assign. */
  from: number | null
  to: number | null
  /** Suggested amount in cents. */
  amount: number
  /** Covering an overspend rather than a general move; only changes the title. */
  cover?: boolean
}

/** Moves money between two budgets, or between a budget and Ready to Assign, for the selected month. */
export function MoveMoneyDialog({
  request,
  rows,
  readyToAssign,
  currency,
  onMove,
  onClose,
}: {
  request: MoveRequest
  rows: EnvelopeBudgetRow[]
  readyToAssign: number
  currency: string
  onMove: (from: number | null, to: number | null, amount: number) => Promise<void>
  onClose: () => void
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const [from, setFrom] = useState(request.from === null ? READY_TO_ASSIGN : String(request.from))
  const [to, setTo] = useState(request.to === null ? READY_TO_ASSIGN : String(request.to))
  const [amount, setAmount] = useState(request.amount)
  const [saving, setSaving] = useState(false)

  const toId = (value: string) => (value === READY_TO_ASSIGN ? null : Number(value))
  const valid = amount > 0 && from !== to

  const options = [
    {
      value: READY_TO_ASSIGN,
      label: t('budgets.readyToAssignOption', { amount: formatMoneyCents(readyToAssign, currency, hidden) }),
    },
    ...rows.map((row) => ({
      value: String(row.budgetId),
      label: t('budgets.budgetOption', {
        name: row.budget.name ?? '',
        amount: formatMoneyCents(row.available, currency, hidden),
      }),
    })),
  ]

  async function handleMove() {
    if (!valid) return
    setSaving(true)
    try {
      await onMove(toId(from), toId(to), amount)
      onClose()
    } catch {
      // Reported by the mutation hook; keep the dialog open to try again.
      setSaving(false)
    }
  }

  function renderSelect(label: string, value: string, onChange: (value: string) => void) {
    return (
      <FormControl size={'small'} sx={{ mb: 3 }} fullWidth>
        <InputLabel>{label}</InputLabel>
        <Select label={label} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }

  return (
    <Dialog open onClose={onClose} maxWidth={'xs'} fullWidth>
      <DialogTitle>{request.cover ? t('budgets.coverOverspending') : t('budgets.moveMoney')}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column' }}>
          {renderSelect(t('budgets.moveFrom'), from, setFrom)}
          {renderSelect(t('budgets.moveTo'), to, setTo)}
          <CurrencyTextField
            label={t('budgets.moveAmount')}
            size={'small'}
            value={amount / 100}
            defaultValue={amount / 100}
            onValueChange={(value) => setAmount(toCents(value))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleMove()
            }}
            options={{ minimumValue: '0' }}
            autoFocus
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('shared.cancel')}</Button>
        <Button variant={'contained'} onClick={handleMove} disabled={!valid || saving}>
          {t('budgets.move')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
