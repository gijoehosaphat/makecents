import { Transaction } from '@/graphql/types'
import { UpdateTransactionDocument } from '@/graphql/operations'
import { formatMoney } from '@/lib/formatMoney'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { transactionHints } from '@/lib/categorySuggestions'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { AddLink, CallSplit, LinkOff } from '@mui/icons-material'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormLabel,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers'
import { isValid } from 'date-fns'
import { useTranslations } from 'next-intl'
import { FormEvent, ReactNode, useMemo, useState } from 'react'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useBankAccountLabel } from '../shared/BankAccountLabel'
import { useAppContext } from '../context/AppContextProvider'
import SplitCategoryPicker from './SplitCategoryPicker'

/** The dialogs the edit dialog hands off to, for changes that need their own editor. */
export type EditHandOff = 'split' | 'link' | 'unlink'

/** The custom value to store: none when it matches what the bank sent (or is blank), so the bank's value shows. */
function customValue(value: string, bankValue?: string | null) {
  const trimmed = value.trim()
  return trimmed === '' || trimmed === (bankValue ?? '') ? null : trimmed
}

const FORM_ID = 'edit-transaction-form'

/**
 * Edits a transaction's date, name, memo and category in one place, saved together. Splitting and transfers
 * have their own dialogs; their buttons save any pending edits first, then hand off through `onHandOff`.
 */
export function EditTransactionDialog({
  transaction,
  refetchQuery,
  onClose,
  onHandOff,
}: {
  transaction: Transaction
  refetchQuery: InternalRefetchQueryDescriptor
  onClose: () => void
  onHandOff: (next: EditHandOff) => void
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const { bankAccounts } = useAppContext()
  const accountLabel = useBankAccountLabel()
  const [updateTransaction] = useMutationWithToast(UpdateTransactionDocument, {
    refetchQueries: [refetchQuery],
  })
  const hints = useMemo(() => transactionHints(transaction), [transaction])

  // Seeded once, since the dialog is mounted only while open, so a background refetch can't overwrite edits.
  const [posted, setPosted] = useState<Date | null>(() => new Date(transaction.posted))
  const [name, setName] = useState(transaction.customName || transaction.name || '')
  const [memo, setMemo] = useState(transaction.customMemo || transaction.memo || '')
  const [categoryId, setCategoryId] = useState<number | null>(transaction.categoryId ?? null)
  const [isSaving, setIsSaving] = useState(false)

  const hasTransfer = !!transaction.transferByTransactionSourceId || !!transaction.transferByTransactionTargetId
  const hasSplits = (transaction.transactionsBySplitSourceId?.nodes ?? []).length > 0
  // Same rules as the row's buttons: transfers aren't split or categorized, and only plain rows can be linked.
  const canSplit = !hasTransfer
  const canLink = !hasTransfer && !hasSplits && categoryId === null

  const customName = customValue(name, transaction.name)
  const customMemo = customValue(memo, transaction.memo)
  const changes = {
    ...(posted && posted.getTime() !== new Date(transaction.posted).getTime() ? { posted: posted.toISOString() } : {}),
    ...(customName !== (transaction.customName || null) ? { customName } : {}),
    ...(customMemo !== (transaction.customMemo || null) ? { customMemo } : {}),
    ...(!hasTransfer && categoryId !== (transaction.categoryId ?? null) ? { categoryId } : {}),
  }
  const hasChanges = Object.keys(changes).length > 0
  const isDateValid = !!posted && isValid(posted)
  const bankAccount = bankAccounts.find((account) => account.id === transaction.bankAccountId)

  /** Saves pending edits, resolving to whether it worked (or there was nothing to save). */
  async function save() {
    if (!hasChanges) return true
    setIsSaving(true)
    try {
      await updateTransaction({ variables: { nodeId: transaction.nodeId, ...changes } })
      return true
    } catch {
      // Reported by the mutation hook.
      return false
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isDateValid || isSaving) return
    if (await save()) onClose()
  }

  async function handOff(next: EditHandOff) {
    if (!isDateValid || isSaving) return
    if (await save()) onHandOff(next)
  }

  function revertToBank() {
    setName(transaction.name || '')
    setMemo(transaction.memo || '')
  }

  const isCustomized = customName !== null || customMemo !== null

  return (
    <Dialog open onClose={() => !isSaving && onClose()} fullWidth maxWidth={'sm'}>
      <DialogTitle>{t('editTransaction.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 3 }}>
          <Typography variant={'body2'} color={'text.secondary'}>
            {accountLabel(bankAccount)}
          </Typography>
          <Typography variant={'body2'}>
            {formatMoney(Number(transaction.originalAmount ?? transaction.amount) / 100, 'CAD', hidden)}
          </Typography>
        </Box>
        <Box
          component={'form'}
          id={FORM_ID}
          onSubmit={handleSubmit}
          sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
        >
          <DateTimePicker
            label={t('editTransaction.date')}
            value={posted}
            onChange={setPosted}
            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
          />
          <TextField
            label={t('editTransaction.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            helperText={customName !== null ? t('editTransaction.fromBank', { value: transaction.name ?? '' }) : ' '}
            size={'small'}
            fullWidth
            autoFocus
          />
          <TextField
            label={t('editTransaction.memo')}
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            helperText={customMemo !== null ? t('editTransaction.fromBank', { value: transaction.memo ?? '' }) : ' '}
            size={'small'}
            fullWidth
          />
          {isCustomized && (
            <Box sx={{ mt: -2 }}>
              <Button size={'small'} onClick={revertToBank}>
                {t('editTransaction.revertToBank')}
              </Button>
            </Box>
          )}
          <Box>
            <FormLabel component={'div'} sx={{ mb: 1 }}>
              {t('editTransaction.category')}
            </FormLabel>
            {hasTransfer ? (
              <Typography variant={'body2'} color={'text.secondary'}>
                {t('editTransaction.transferNoCategory')}
              </Typography>
            ) : (
              <SplitCategoryPicker categoryId={categoryId} onChange={setCategoryId} hints={hints} />
            )}
          </Box>
          <Box>
            <FormLabel component={'div'} sx={{ mb: 1 }}>
              {t('editTransaction.splitAndTransfer')}
            </FormLabel>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <HandOffButton
                icon={<CallSplit />}
                label={hasSplits ? t('editTransaction.editSplit') : t('editTransaction.split')}
                disabledReason={canSplit ? undefined : t('editTransaction.splitDisabled')}
                disabled={isSaving}
                onClick={() => handOff('split')}
              />
              {hasTransfer ? (
                <HandOffButton
                  icon={<LinkOff />}
                  label={t('editTransaction.unlinkTransfer')}
                  disabled={isSaving}
                  onClick={() => handOff('unlink')}
                />
              ) : (
                <HandOffButton
                  icon={<AddLink />}
                  label={t('editTransaction.linkTransfer')}
                  disabledReason={canLink ? undefined : t('editTransaction.linkDisabled')}
                  disabled={isSaving}
                  onClick={() => handOff('link')}
                />
              )}
            </Box>
            {hasChanges && (
              <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', mt: 1 }}>
                {t('editTransaction.savesFirst')}
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          {t('shared.cancel')}
        </Button>
        <Button type={'submit'} form={FORM_ID} variant={'contained'} disabled={isSaving || !hasChanges || !isDateValid}>
          {t('shared.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function HandOffButton({
  icon,
  label,
  disabledReason,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  /** Why the action isn't available; shown as a tooltip on the disabled button. */
  disabledReason?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip title={disabledReason ?? ''}>
      {/* The span lets the tooltip show while the button is disabled. */}
      <span>
        <Button
          variant={'outlined'}
          color={'secondary'}
          size={'small'}
          startIcon={icon}
          onClick={onClick}
          disabled={disabled || !!disabledReason}
        >
          {label}
        </Button>
      </span>
    </Tooltip>
  )
}
