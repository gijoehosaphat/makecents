import { Transaction } from '@/graphql/types'
import {
  GetDuplicateCandidatesDocument,
  RemoveTransactionDocument,
  RestoreTransactionDocument,
} from '@/graphql/operations'
import { formatMoney } from '@/lib/formatMoney'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { useQuery } from '@apollo/client/react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material'
import { addDays, format } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useSnackbar } from 'notistack'
import { useState } from 'react'
import { useAmountVisibility } from '../context/AmountVisibilityContext'

const REASONS = ['duplicate', 'cancelled', 'other'] as const
type Reason = (typeof REASONS)[number]

/** How far either side of the deleted transaction's date to look for the one it duplicates. */
const CANDIDATE_DAYS = 14

const NONE = 'none'

/**
 * Deletes a transaction, recording why. A deleted transaction is never imported again; it is
 * listed under Settings > Deleted, where it can be restored.
 */
export function DeleteTransactionDialog({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const { enqueueSnackbar, closeSnackbar } = useSnackbar()
  const [reason, setReason] = useState<Reason>('duplicate')
  const [note, setNote] = useState('')
  const [chosenDuplicateOf, setChosenDuplicateOf] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  const posted = new Date(transaction.posted)
  const postedTime = posted.getTime()
  const totalAmount = Number(transaction.originalAmount ?? transaction.amount)
  const { data, loading } = useQuery(GetDuplicateCandidatesDocument, {
    variables: {
      transactionId: transaction.id,
      bankAccountId: transaction.bankAccountId,
      from: addDays(posted, -CANDIDATE_DAYS).toISOString(),
      to: addDays(posted, CANDIDATE_DAYS).toISOString(),
    },
    fetchPolicy: 'network-only',
  })

  // Same amount, closest in date first.
  const candidates = (data?.allTransactions?.nodes ?? [])
    .flatMap((node) => (node && Number(node.originalAmount ?? node.amount) === totalAmount ? [node] : []))
    .sort(
      (a, b) =>
        Math.abs(new Date(a.posted).getTime() - postedTime) - Math.abs(new Date(b.posted).getTime() - postedTime),
    )
  const duplicateOf = chosenDuplicateOf ?? (candidates[0] ? String(candidates[0].id) : NONE)

  const [removeTransaction] = useMutationWithToast(RemoveTransactionDocument, {
    refetchQueries: 'active',
    errorMessage: t('deletedTransactions.deleteError'),
    showServerMessage: true,
  })
  const [restoreTransaction] = useMutationWithToast(RestoreTransactionDocument, {
    refetchQueries: 'active',
    errorMessage: t('deletedTransactions.restoreError'),
    showServerMessage: true,
  })

  const hasTransfer = !!transaction.transferByTransactionSourceId || !!transaction.transferByTransactionTargetId
  const hasSplits = (transaction.transactionsBySplitSourceId?.nodes ?? []).length > 0

  async function handleDelete() {
    setIsWorking(true)
    try {
      const response = await removeTransaction({
        variables: {
          transactionId: transaction.id,
          reason,
          note: note.trim() || null,
          duplicateOfId: reason === 'duplicate' && duplicateOf !== NONE ? Number(duplicateOf) : null,
        },
      })
      const deletedId = response.data?.removeTransaction?.deletedTransaction?.id
      onClose()
      enqueueSnackbar(t('deletedTransactions.deleted'), {
        variant: 'success',
        action: (key) =>
          deletedId ? (
            <Button
              color={'inherit'}
              size={'small'}
              onClick={async () => {
                closeSnackbar(key)
                await restoreTransaction({ variables: { deletedTransactionId: deletedId } })
                enqueueSnackbar(t('deletedTransactions.restored'), { variant: 'success' })
              }}
            >
              {t('deletedTransactions.undo')}
            </Button>
          ) : null,
      })
    } catch {
      // Reported by the mutation hook.
      setIsWorking(false)
    }
  }

  const money = (cents: number) => formatMoney(cents / 100, 'CAD', hidden)

  return (
    <Dialog open onClose={() => !isWorking && onClose()} fullWidth maxWidth={'sm'}>
      <DialogTitle>{t('deletedTransactions.deleteTitle')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 3 }}>
          <Box>
            <Typography variant={'body2'}>{transaction.customName || transaction.name}</Typography>
            <Typography variant={'caption'} color={'text.secondary'}>
              {format(posted, 'MMM d, yyyy')} · {transaction.customMemo || transaction.memo}
            </Typography>
          </Box>
          <Typography variant={'body2'}>{money(totalAmount)}</Typography>
        </Box>

        <FormControl sx={{ mb: 2 }}>
          <FormLabel id={'delete-reason'}>{t('deletedTransactions.reasonLabel')}</FormLabel>
          <RadioGroup
            aria-labelledby={'delete-reason'}
            value={reason}
            onChange={(event) => setReason(event.target.value as Reason)}
          >
            {REASONS.map((value) => (
              <FormControlLabel
                key={value}
                value={value}
                control={<Radio size={'small'} />}
                label={t(`deletedTransactions.reasons.${value}`)}
              />
            ))}
          </RadioGroup>
        </FormControl>

        {reason === 'duplicate' && (
          <FormControl fullWidth sx={{ mb: 2 }}>
            <FormLabel id={'duplicate-of'}>{t('deletedTransactions.duplicateOfLabel')}</FormLabel>
            {loading ? (
              <CircularProgress size={20} sx={{ my: 1 }} />
            ) : (
              <RadioGroup
                aria-labelledby={'duplicate-of'}
                value={duplicateOf}
                onChange={(event) => setChosenDuplicateOf(event.target.value)}
              >
                {candidates.map((candidate) => (
                  <FormControlLabel
                    key={candidate.nodeId}
                    value={String(candidate.id)}
                    control={<Radio size={'small'} />}
                    label={
                      <Box>
                        <Typography variant={'body2'}>{candidate.customName || candidate.name}</Typography>
                        <Typography variant={'caption'} color={'text.secondary'}>
                          {format(new Date(candidate.posted), 'MMM d, yyyy')} · {candidate.customMemo || candidate.memo}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
                <FormControlLabel
                  value={NONE}
                  control={<Radio size={'small'} />}
                  label={
                    <Typography variant={'body2'}>
                      {candidates.length
                        ? t('deletedTransactions.duplicateOfNone')
                        : t('deletedTransactions.noCandidates', { days: CANDIDATE_DAYS })}
                    </Typography>
                  }
                />
              </RadioGroup>
            )}
            {duplicateOf !== NONE && (
              <Typography variant={'caption'} color={'text.secondary'}>
                {t('deletedTransactions.carryOver')}
              </Typography>
            )}
          </FormControl>
        )}

        <TextField
          label={t('deletedTransactions.noteLabel')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          fullWidth
          multiline
          minRows={2}
          size={'small'}
          sx={{ mb: 2 }}
        />

        <Alert severity={'info'}>
          {t('deletedTransactions.explain')}
          {hasSplits && ` ${t('deletedTransactions.explainSplits')}`}
          {hasTransfer && ` ${t('deletedTransactions.explainTransfer')}`}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isWorking}>
          {t('shared.cancel')}
        </Button>
        <Button color={'error'} variant={'contained'} onClick={handleDelete} disabled={isWorking || loading}>
          {t('shared.delete')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
