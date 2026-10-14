import { Transaction } from '@/graphql/types'
import { Add, CallSplit, DeleteForever, Undo } from '@mui/icons-material'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { KeyboardEvent, useMemo, useState } from 'react'
import SaveCancel from '../forms/SaveCancel'
import { useTranslations } from 'next-intl'
import CurrencyTextField from '../shared/CurrencyTextField'
import SplitCategoryPicker from './SplitCategoryPicker'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { UpsertSplitTransactionsDocument } from '@/graphql/operations'
import { fromCents, toCents } from '@/lib/formatMoney'
import { transactionHints } from '@/lib/categorySuggestions'
import { MIN_PART_CENTS, canAddPart, clampPartCents, maxPartCents, remainingCents } from '@/lib/splitMath'

/** One row split off the original, either already saved or still to be created. */
interface SplitPart {
  key: string
  /** Set for parts that already exist; new parts have none. */
  id?: number
  name?: string | null
  memo?: string | null
  /** Unsigned, and not clamped while the user is typing. */
  cents: number
  categoryId: number | null
  /** An existing part marked for deletion on save. */
  removed?: boolean
}

function existingParts(transaction: Transaction): SplitPart[] {
  return (transaction.transactionsBySplitSourceId?.nodes ?? []).map((part) => ({
    key: part.nodeId,
    id: part.id,
    name: part.name,
    memo: part.memo,
    cents: Math.abs(part.amount),
    categoryId: part.categoryId ?? null,
  }))
}

/** Unique enough to keep two parts saved in the same instant apart, without needing a secure context. */
function randomSuffix() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function TransactionSplit({
  transaction,
  refetchQuery,
}: {
  transaction: Transaction
  refetchQuery: InternalRefetchQueryDescriptor
}) {
  const t = useTranslations('common')
  const [upsertSplitTransactions] = useMutationWithToast(UpsertSplitTransactionsDocument, {
    refetchQueries: [refetchQuery],
  })
  const hints = useMemo(() => transactionHints(transaction), [transaction])
  const isWithdrawal = transaction.originalAmount < 0
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [parts, setParts] = useState<SplitPart[]>([])
  const [originalCategoryId, setOriginalCategoryId] = useState<number | null>(transaction.categoryId ?? null)

  // The original row keeps whatever the other parts leave, so the parts always add up to the original amount.
  const totalCents = Math.abs(Number(transaction.originalAmount))
  const activeParts = parts.filter((part) => !part.removed)
  const partCents = activeParts.map((part) => part.cents)
  const amount = remainingCents(totalCents, partCents)

  const isValid = amount >= MIN_PART_CENTS && activeParts.every((part) => part.cents >= MIN_PART_CENTS)
  const initialParts = existingParts(transaction)
  const hasChanges =
    originalCategoryId !== (transaction.categoryId ?? null) ||
    parts.some((part) => {
      if (part.removed || part.id === undefined) return true
      const initial = initialParts.find((p) => p.id === part.id)
      return initial?.cents !== part.cents || initial?.categoryId !== part.categoryId
    })
  const canAdd = canAddPart(totalCents, partCents)

  function money(cents: number) {
    return `$${fromCents(cents).toFixed(2)}`
  }

  // Seeded once per opening, so a refetch in the background can't overwrite what the user is editing.
  function openEditor() {
    setParts(existingParts(transaction))
    setOriginalCategoryId(transaction.categoryId ?? null)
    setIsEditorOpen(true)
  }

  function handleClose() {
    setParts([])
    setIsEditorOpen(false)
  }

  function handleSave() {
    if (!isValid || !hasChanges) return
    const sign = isWithdrawal ? -1 : 1

    const toUpdate = [
      { id: transaction.id, amount: sign * amount, categoryId: originalCategoryId },
      ...activeParts
        .filter((part) => part.id !== undefined)
        .map((part) => ({ id: part.id, amount: sign * part.cents, categoryId: part.categoryId })),
    ]

    const toCreate = activeParts
      .filter((part) => part.id === undefined)
      .map((part) => ({
        bankAccountId: transaction.bankAccountId,
        amount: sign * part.cents,
        originalAmount: sign * part.cents,
        categoryId: part.categoryId,
        splitSourceId: transaction.id,
        bankTransactionId: `${transaction.bankTransactionId}-${randomSuffix()}`,
        memo: transaction.memo,
        name: transaction.name,
        posted: transaction.posted,
        originalPosted: transaction.posted,
        type: transaction.type,
      }))

    const toDelete = parts.filter((part) => part.removed && part.id !== undefined).map((part) => ({ id: part.id }))

    upsertSplitTransactions({ variables: { toUpdate, toCreate, toDelete } })

    handleClose()
  }

  function updatePart(key: string, changes: Partial<SplitPart>) {
    setParts((current) => current.map((part) => (part.key === key ? { ...part, ...changes } : part)))
  }

  /** The most the part can take while the original row keeps its minimum. */
  function maxFor(key: string) {
    return maxPartCents(
      totalCents,
      activeParts.filter((part) => part.key !== key).map((part) => part.cents),
    )
  }

  /** Fixes up an out-of-range amount once the user leaves the field, not while they are still typing. */
  function clampPart(key: string) {
    const part = parts.find((p) => p.key === key)
    if (!part || part.removed) return
    const others = activeParts.filter((p) => p.key !== key).map((p) => p.cents)
    const cents = clampPartCents(part.cents, totalCents, others)
    if (cents !== part.cents) updatePart(key, { cents })
  }

  function amountError(part: SplitPart) {
    if (part.cents < MIN_PART_CENTS) return t('categories.splitMinimum', { min: money(MIN_PART_CENTS) })
    if (part.cents > maxFor(part.key)) return t('categories.splitMaximum', { max: money(maxFor(part.key)) })
    return undefined
  }

  function removePart(part: SplitPart) {
    if (part.id === undefined) {
      setParts((current) => current.filter((p) => p.key !== part.key))
    } else {
      updatePart(part.key, { removed: true })
    }
  }

  function addPart() {
    if (!canAdd) return
    setParts((current) => [
      ...current,
      {
        key: `new-${randomSuffix()}`,
        name: transaction.name,
        memo: transaction.memo,
        cents: MIN_PART_CENTS,
        categoryId: null,
      },
    ])
  }

  // "+" adds a part and Enter saves, so a split can be entered without the mouse.
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    // Ignores keys from the category menu, which renders in a portal outside the dialog.
    if (!event.currentTarget.contains(event.target as Node)) return
    if (event.key === '+') {
      event.preventDefault()
      addPart()
    } else if (event.key === 'Enter') {
      // Enter activates other buttons as usual; the remove/undo toggle saves so Enter works right after a click on it.
      const button = (event.target as HTMLElement).closest('button, a, [role="button"]')
      if (button && !button.hasAttribute('data-enter-saves')) return
      event.preventDefault()
      handleSave()
    }
  }

  return (
    <>
      <IconButton
        size={'small'}
        color={'secondary'}
        sx={{ ml: 2, visibility: 'hidden' }}
        className={'transaction-row-hover'}
        onClick={openEditor}
      >
        <CallSplit />
      </IconButton>
      <Dialog
        open={isEditorOpen}
        onClose={handleClose}
        onKeyDown={handleKeyDown}
        fullWidth
        maxWidth={'sm'}
        PaperProps={{ tabIndex: -1 }}
      >
        <DialogTitle sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
          <CallSplit sx={{ mr: 2 }} />
          {t('categories.splitTransaction')}
        </DialogTitle>
        <DialogContent>
          <Typography variant={'body2'}>{t('categories.splitTotal', { total: money(totalCents) })}</Typography>
          <Typography variant={'caption'} color={amount < MIN_PART_CENTS ? 'error' : 'text.secondary'}>
            {t('categories.splitRemainder', { remaining: money(Math.max(amount, 0)) })}
          </Typography>
          <Table size={'small'}>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Typography variant={'body2'}>{transaction.name}</Typography>
                  <Typography variant={'caption'}>{transaction.memo}</Typography>
                </TableCell>
                <TableCell>
                  <SplitCategoryPicker categoryId={originalCategoryId} onChange={setOriginalCategoryId} hints={hints} />
                </TableCell>
                <TableCell sx={{ width: 140 }}>
                  <CurrencyTextField
                    size={'small'}
                    fullWidth
                    disabled={true}
                    label={t('categories.splitOriginal')}
                    value={fromCents(Math.max(amount, 0))}
                    options={{
                      minimumValue: '0',
                      maximumValue: fromCents(totalCents).toFixed(2),
                    }}
                  />
                </TableCell>
                <TableCell sx={{ width: 48, px: 0 }}></TableCell>
              </TableRow>
              {parts.map((part) => {
                const error = part.removed ? undefined : amountError(part)
                return (
                  <TableRow key={part.key} sx={part.removed ? { opacity: 0.5 } : undefined}>
                    <TableCell>
                      <Typography variant={'body2'} sx={{ textDecoration: part.removed ? 'line-through' : undefined }}>
                        {part.name}
                      </Typography>
                      <Typography variant={'caption'}>{part.memo}</Typography>
                    </TableCell>
                    <TableCell>
                      <SplitCategoryPicker
                        categoryId={part.categoryId}
                        onChange={(categoryId) => updatePart(part.key, { categoryId })}
                        hints={hints}
                        disabled={part.removed}
                      />
                    </TableCell>
                    <TableCell sx={{ width: 140 }}>
                      <CurrencyTextField
                        size={'small'}
                        fullWidth
                        disabled={part.removed}
                        autoFocus={part.id === undefined}
                        value={fromCents(part.cents)}
                        error={Boolean(error)}
                        helperText={error}
                        onFocus={(event) => event.target.select()}
                        onBlur={() => clampPart(part.key)}
                        onValueChange={(value) => updatePart(part.key, { cents: Math.abs(toCents(value)) })}
                        options={{
                          minimumValue: '0',
                          maximumValue: fromCents(totalCents).toFixed(2),
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ width: 48, px: 0 }}>
                      {/* One button for both states, so it keeps focus after being clicked. */}
                      <Tooltip title={part.removed ? t('categories.splitUndoRemove') : t('categories.splitRemove')}>
                        <IconButton
                          size={'small'}
                          data-enter-saves
                          onClick={(event) => {
                            if (part.removed) {
                              updatePart(part.key, { removed: false })
                              return
                            }
                            // A new part's row disappears with its button, so hand focus to the dialog to keep Enter working.
                            const dialog = event.currentTarget.closest<HTMLElement>('[role="dialog"]')
                            removePart(part)
                            if (part.id === undefined) setTimeout(() => dialog?.focus())
                          }}
                          aria-label={part.removed ? t('categories.splitUndoRemove') : t('categories.splitRemove')}
                        >
                          {part.removed ? <Undo /> : <DeleteForever />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <Tooltip title={canAdd ? t('categories.splitAddPartHint') : t('categories.splitNoRoom')}>
            {/* The span lets the tooltip show while the button is disabled. */}
            <span>
              <Button color={'secondary'} startIcon={<Add />} onClick={addPart} disabled={!canAdd} sx={{ mt: 1 }}>
                {t('categories.splitAddPart')}
              </Button>
            </span>
          </Tooltip>
        </DialogContent>
        <DialogActions>
          <SaveCancel saveDisabled={!isValid || !hasChanges} handleSave={handleSave} handleCancel={handleClose} />
        </DialogActions>
      </Dialog>
    </>
  )
}
