import { Transaction, Transfer } from '@/graphql/types'
import { AddLink, Link, RadioButtonChecked, RadioButtonUnchecked } from '@mui/icons-material'
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import SaveCancel from '../forms/SaveCancel'
import { useTranslations } from 'next-intl'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { useQuery } from '@apollo/client/react'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { formatMoney } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useAppContext } from '../context/AppContextProvider'
import { useBankAccountLabel } from '../shared/BankAccountLabel'
import {
  CreateTransferDocument,
  DeleteTransferDocument,
  GetTransferCandidatesDocument,
  GetTransferDocument,
} from '@/graphql/operations'

// How far apart candidates may be before they're hidden behind "Show older".
const NEARBY_DAYS = 14
// A candidate this close is called a likely match and pre-selected; the same window as suggestedTransfer.
const LIKELY_DAYS = 4

export function TransactionLink({
  transaction,
  refetchQuery,
}: {
  transaction: Transaction
  refetchQuery: InternalRefetchQueryDescriptor
}) {
  const t = useTranslations('common')
  const { bankAccounts } = useAppContext()
  const accountLabel = useBankAccountLabel()
  const [open, setOpen] = useState<'link' | 'unlink' | null>(null)
  const hasTransfer = !!transaction.transferByTransactionSourceId || !!transaction.transferByTransactionTargetId
  const suggested = transaction.suggestedTransfer

  return (
    <>
      {hasTransfer && (
        <IconButton size={'small'} onClick={() => setOpen('unlink')}>
          <Link />
        </IconButton>
      )}
      {!hasTransfer && suggested && (
        <Tooltip
          title={t('transfer.suggested', {
            account: accountLabel(bankAccounts.find((account) => account.id === suggested.bankAccountId)),
            date: format(new Date(suggested.posted), 'MMM d'),
          })}
        >
          <IconButton size={'small'} color={'info'} onClick={() => setOpen('link')}>
            <AddLink />
          </IconButton>
        </Tooltip>
      )}
      {!hasTransfer && !suggested && (
        <IconButton
          size={'small'}
          sx={{ visibility: 'hidden' }}
          className={'transaction-row-hover'}
          onClick={() => setOpen('link')}
        >
          <AddLink />
        </IconButton>
      )}
      {open === 'link' && (
        <LinkTransferDialog transaction={transaction} refetchQuery={refetchQuery} onClose={() => setOpen(null)} />
      )}
      {open === 'unlink' && (
        <UnlinkTransferDialog transaction={transaction} refetchQuery={refetchQuery} onClose={() => setOpen(null)} />
      )}
    </>
  )
}

/**
 * Links a transaction to one of the opposite amount in another bank account, marking both as a transfer.
 * Candidates come ranked from the database; nearby ones are shown first.
 */
export function LinkTransferDialog({
  transaction,
  refetchQuery,
  onClose,
}: {
  transaction: Transaction
  refetchQuery: InternalRefetchQueryDescriptor
  onClose: () => void
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const { bankAccounts } = useAppContext()
  const accountLabel = useBankAccountLabel()
  const [showOlder, setShowOlder] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data, loading } = useQuery(GetTransferCandidatesDocument, {
    variables: { nodeId: transaction.nodeId, withinDays: showOlder ? null : NEARBY_DAYS },
    // Candidates drop out once categorized or linked, so a cached list can offer ones that no longer qualify.
    fetchPolicy: 'network-only',
  })
  const [createTransfer] = useMutationWithToast(CreateTransferDocument, {
    refetchQueries: [refetchQuery],
  })

  const matchingTransactions: Transaction[] = useMemo(() => {
    return (data?.transaction?.transferCandidates?.nodes as Transaction[]) || []
  }, [data?.transaction?.transferCandidates?.nodes])
  const olderCount = (data?.transaction?.allTransferCandidates?.totalCount ?? 0) - matchingTransactions.length

  function daysApart(candidate: Transaction) {
    return differenceInCalendarDays(new Date(candidate.posted), new Date(transaction.posted))
  }

  const best = matchingTransactions[0]
  const likelyId = best && Math.abs(daysApart(best)) <= LIKELY_DAYS ? best.id : null
  // The likely match is selected until another is chosen.
  const selected = matchingTransactions.find((candidate) => candidate.id === (selectedId ?? likelyId))

  async function handleCreateTransfer() {
    if (!selected) {
      return
    }
    const matchId = selected.id
    const id = transaction.id
    await createTransfer({
      variables:
        transaction.amount > 0
          ? {
              transactionSourceId: matchId,
              transactionTargetId: id,
            }
          : {
              transactionSourceId: id,
              transactionTargetId: matchId,
            },
    })
    onClose()
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>{t('transfer.matchTransaction')}</DialogTitle>
      <DialogContent>
        <List>
          {matchingTransactions.map((candidate: Transaction) => {
            const isSelected = candidate.id === selected?.id
            const days = daysApart(candidate)
            const details = [
              format(new Date(candidate.posted), 'MMM d, yyyy'),
              accountLabel(bankAccounts.find((account) => account.id === candidate.bankAccountId)),
              t('transfer.daysApart', { days: Math.abs(days), direction: days > 0 ? 'later' : 'earlier' }),
            ].join(' · ')
            const memo = candidate.customMemo || candidate.memo
            return (
              <ListItem key={`matching-transaction-${candidate.id}`} disablePadding>
                <ListItemButton selected={isSelected} onClick={() => setSelectedId(candidate.id)}>
                  <ListItemIcon>{isSelected ? <RadioButtonChecked /> : <RadioButtonUnchecked />}</ListItemIcon>
                  <ListItemText
                    primary={candidate.customName || candidate.name}
                    secondary={
                      <>
                        {details}
                        {memo && <br />}
                        {memo}
                      </>
                    }
                    sx={{ mr: 4 }}
                  />
                  {candidate.id === likelyId && (
                    <Chip size={'small'} color={'info'} label={t('transfer.likelyMatch')} sx={{ mr: 2 }} />
                  )}
                  <ListItemText
                    primary={formatMoney(candidate.amount / 100, 'CAD', hidden)}
                    sx={{ flex: 'none', textAlign: 'right' }}
                  />
                </ListItemButton>
              </ListItem>
            )
          })}
        </List>
        {matchingTransactions.length === 0 && !loading && (
          <Alert severity={'warning'}>
            {olderCount > 0 ? t('transfer.noneNearby', { days: NEARBY_DAYS }) : t('transactions.none')}
          </Alert>
        )}
        {!showOlder && olderCount > 0 && (
          <Button onClick={() => setShowOlder(true)} sx={{ mt: 1 }}>
            {t('transfer.showOlder', { count: olderCount })}
          </Button>
        )}
      </DialogContent>
      <DialogActions>
        <SaveCancel handleSave={handleCreateTransfer} handleCancel={onClose} saveDisabled={!selected} />
      </DialogActions>
    </Dialog>
  )
}

/** Removes the transfer link from a transaction and its counterpart. */
export function UnlinkTransferDialog({
  transaction,
  refetchQuery,
  onClose,
}: {
  transaction: Transaction
  refetchQuery: InternalRefetchQueryDescriptor
  onClose: () => void
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const transfer: Transfer | null =
    transaction.transferByTransactionSourceId || transaction.transferByTransactionTargetId || null
  const { data } = useQuery(GetTransferDocument, {
    variables: { nodeId: transfer?.nodeId ?? '' },
    skip: !transfer?.nodeId,
  })
  const [deleteTransfer] = useMutationWithToast(DeleteTransferDocument, {
    refetchQueries: [refetchQuery],
  })

  // The transfer query returns both sides; show the one that isn't this transaction.
  const transferTransaction = [
    data?.transfer?.transactionByTransactionTargetId,
    data?.transfer?.transactionByTransactionSourceId,
  ].find((candidate) => candidate && candidate.id !== transaction.id) as Transaction | undefined

  async function handleDeleteTransferSave() {
    if (transfer?.nodeId) {
      await deleteTransfer({
        variables: {
          nodeId: transfer?.nodeId,
        },
      })
    }
    onClose()
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>{t('transfer.deleteTransfer')}</DialogTitle>
      <DialogContent>
        {transferTransaction && (
          <List key={`matching-transaction-${transferTransaction.id}`}>
            <ListItem disablePadding>
              <ListItemButton selected={true}>
                <ListItemIcon>
                  <RadioButtonChecked />
                </ListItemIcon>
                <ListItemText primary={transferTransaction.name} secondary={transferTransaction.memo} sx={{ mr: 4 }} />
                <ListItemText primary={formatMoney(transferTransaction.amount / 100, 'CAD', hidden)} />
              </ListItemButton>
            </ListItem>
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <SaveCancel handleSave={handleDeleteTransferSave} handleCancel={onClose} />
      </DialogActions>
    </Dialog>
  )
}
