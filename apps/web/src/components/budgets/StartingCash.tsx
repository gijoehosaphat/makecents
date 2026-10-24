'use client'

import { useState } from 'react'
import { Box, Button, Paper, Typography } from '@mui/material'
import { useSuspenseQuery } from '@apollo/client/react'
import { useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import { Budget } from '@/graphql/types'
import { GetEnvelopeStartDocument, SetEnvelopeCashOnHandDocument } from '@/graphql/operations'
import { startingReadyToAssign } from '@/lib/budgetMath'
import { formatMoneyCents, toCents } from '@/lib/formatMoney'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import CurrencyTextField from '../shared/CurrencyTextField'
import SaveCancel from '../forms/SaveCancel'

/**
 * The cash on hand when envelope budgeting started: money already there and not yet given a job. Ready to Assign
 * starts from it, less what budgets already held, and grows as pay arrives. Until it is entered, Ready to Assign
 * starts from the balance the account was converted with.
 */
export default function StartingCash({
  accountId,
  budgets,
  currency,
}: {
  accountId: number
  budgets: Budget[]
  currency: string
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const { data } = useSuspenseQuery(GetEnvelopeStartDocument, { variables: { accountId } })
  const account = data.accountById
  const [setCashOnHand] = useMutationWithToast(SetEnvelopeCashOnHandDocument, {
    showServerMessage: true,
    errorMessage: t('budgets.startingCash.saveFailed'),
  })
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(0)
  const [saving, setSaving] = useState(false)

  if (!account) return null
  const cashOnHand =
    account.envelopeCashOnHand === null || account.envelopeCashOnHand === undefined
      ? null
      : Number(account.envelopeCashOnHand)
  const held = budgets.reduce((sum, budget) => sum + Number(budget.startingAmount ?? 0), 0)
  const starting = startingReadyToAssign({
    cashOnHand,
    conversionBalance: account.envelopeStartingBalance,
    openingBalances: budgets.map((budget) => budget.startingAmount),
  })
  const money = (cents: number) => formatMoneyCents(cents, currency, hidden)
  const month = format(parseISO(account.envelopeStartMonth), 'MMMM yyyy')

  async function save(cents: number | null) {
    setSaving(true)
    try {
      await setCashOnHand({ variables: { accountId, cashOnHand: cents === null ? null : String(cents) } })
      setEditing(false)
    } catch {
      // Reported by the mutation hook; keep editing so the amount can be fixed and saved again.
    } finally {
      setSaving(false)
    }
  }

  return (
    <Paper variant={'outlined'} sx={{ p: 2, mt: 2, mb: 2 }}>
      <Typography variant={'h4'}>{t('budgets.startingCash.title', { month })}</Typography>
      <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 1 }}>
        {t('budgets.startingCash.help')}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 40 }}>
        {editing ? (
          <>
            <CurrencyTextField
              label={t('budgets.startingCash.label')}
              size={'small'}
              value={value / 100}
              defaultValue={value / 100}
              onValueChange={(amount) => setValue(toCents(amount))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save(value)
                if (event.key === 'Escape') setEditing(false)
              }}
              autoFocus
            />
            <SaveCancel handleSave={() => save(value)} handleCancel={() => setEditing(false)} saveDisabled={saving} />
          </>
        ) : (
          <>
            <Typography variant={'h3'}>
              {cashOnHand === null ? t('budgets.startingCash.notSet') : money(cashOnHand)}
            </Typography>
            {/* Editing shows the real figure, so it is off while amounts are hidden. */}
            <Button
              size={'small'}
              disabled={hidden}
              onClick={() => {
                setValue(cashOnHand ?? 0)
                setEditing(true)
              }}
            >
              {cashOnHand === null ? t('budgets.startingCash.enter') : t('shared.edit')}
            </Button>
            {cashOnHand !== null && (
              <Button size={'small'} color={'inherit'} disabled={hidden || saving} onClick={() => save(null)}>
                {t('budgets.startingCash.clear')}
              </Button>
            )}
          </>
        )}
      </Box>
      <Typography variant={'body2'} color={'text.secondary'} sx={{ mt: 1 }}>
        {cashOnHand === null
          ? t('budgets.startingCash.startsWithoutCash', { amount: money(starting) })
          : t('budgets.startingCash.startsWithCash', {
              amount: money(starting),
              cash: money(cashOnHand),
              held: money(held),
            })}
      </Typography>
    </Paper>
  )
}
