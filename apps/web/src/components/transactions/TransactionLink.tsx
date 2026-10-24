import { Transaction, Transfer } from '@/graphql/types'
import { AddLink, Link, RadioButtonChecked, RadioButtonUnchecked } from '@mui/icons-material'
import {
  Alert,
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
} from '@mui/material'
import { useMemo, useState } from 'react'
import SaveCancel from '../forms/SaveCancel'
import { useTranslations } from 'next-intl'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { useQuery } from '@apollo/client/react'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { formatMoney } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import {
  CreateTransferDocument,
  DeleteTransferDocument,
  GetTransferDocument,
  TransactionByAmountDocument,
} from '@/graphql/operations'

export function TransactionLink({
  transaction,
  refetchQuery,
}: {
  transaction: Transaction
  refetchQuery: InternalRefetchQueryDescriptor
}) {
  const [open, setOpen] = useState<'link' | 'unlink' | null>(null)
  const hasTransfer = !!transaction.transferByTransactionSourceId || !!transaction.transferByTransactionTargetId

  return (
    <>
      {hasTransfer && (
        <IconButton size={'small'} onClick={() => setOpen('unlink')}>
          <Link />
        </IconButton>
      )}
      {!hasTransfer && (
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

/** Links a transaction to one of the opposite amount, marking both as a transfer between accounts. */
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
  const [selectedIndex, setSelectedIndex] = useState(0)
  const { data, loading } = useQuery(TransactionByAmountDocument, {
    variables: {
      amount: transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount),
    },
  })
  const [createTransfer] = useMutationWithToast(CreateTransferDocument, {
    refetchQueries: [refetchQuery],
  })

  const matchingTransactions: Transaction[] = useMemo(() => {
    return (data?.allTransactions?.nodes as Transaction[]) || []
  }, [data?.allTransactions?.nodes])

  async function handleCreateTransfer() {
    const matchId = matchingTransactions[selectedIndex].id
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
        {matchingTransactions.map((t: Transaction, index: number) => {
          return (
            <List key={`matching-transaction-${t.id}`}>
              <ListItem disablePadding>
                <ListItemButton selected={index === selectedIndex} onClick={() => setSelectedIndex(index)}>
                  <ListItemIcon>
                    {index === selectedIndex ? <RadioButtonChecked /> : <RadioButtonUnchecked />}
                  </ListItemIcon>
                  <ListItemText primary={t.name} secondary={t.memo} sx={{ mr: 4 }} />
                  <ListItemText primary={formatMoney(t.amount / 100, 'CAD', hidden)} />
                </ListItemButton>
              </ListItem>
            </List>
          )
        })}
        {matchingTransactions.length === 0 && !loading && <Alert severity={'warning'}>{t('transactions.none')}</Alert>}
      </DialogContent>
      <DialogActions>
        <SaveCancel
          handleSave={handleCreateTransfer}
          handleCancel={onClose}
          saveDisabled={!matchingTransactions[selectedIndex]}
        />
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
