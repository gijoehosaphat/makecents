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
import { useLazyQuery, useMutation } from '@apollo/client/react'
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
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [getTransactionByAmount, getTransactionByAmountResults] = useLazyQuery(TransactionByAmountDocument)
  const [getTransfer, getTransferResults] = useLazyQuery(GetTransferDocument)
  const [createTransfer] = useMutation(CreateTransferDocument, {
    refetchQueries: [refetchQuery],
  })
  const [deleteTransfer] = useMutation(DeleteTransferDocument, {
    refetchQueries: [refetchQuery],
  })

  const matchingTransactions: Transaction[] = useMemo(() => {
    return (getTransactionByAmountResults?.data?.allTransactions?.nodes as Transaction[]) || []
  }, [getTransactionByAmountResults?.data?.allTransactions?.nodes])

  const loaded: boolean = useMemo(() => {
    return getTransactionByAmountResults?.called && !getTransactionByAmountResults?.loading
  }, [getTransactionByAmountResults?.called, getTransactionByAmountResults?.loading])

  const transfer: Transfer | null = useMemo(() => {
    return transaction.transferByTransactionSourceId || transaction.transferByTransactionTargetId || null
  }, [transaction.transferByTransactionSourceId, transaction.transferByTransactionTargetId])

  const transferTransaction: Transaction | null = useMemo(() => {
    return (
      ((getTransferResults?.data?.transfer?.transactionByTransactionTargetId ||
        getTransferResults?.data?.transfer?.transactionByTransactionSourceId) as Transaction) || null
    )
  }, [
    getTransferResults?.data?.transfer?.transactionByTransactionTargetId,
    getTransferResults?.data?.transfer?.transactionByTransactionSourceId,
  ])

  const hasTransfer = !!transfer

  function handleAddTransfer() {
    getTransactionByAmount({
      variables: {
        amount: transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount),
      },
    })
    setAddOpen(true)
  }

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
    setAddOpen(false)
  }

  function handleCreateTransferClose() {
    setAddOpen(false)
  }

  function handleSelectMatchingTransaction(index: number) {
    setSelectedIndex(index)
  }

  function handleDeleteTransfer() {
    if (transfer?.nodeId) {
      getTransfer({
        variables: {
          nodeId: transfer?.nodeId,
        },
      })
    }
    setDeleteOpen(true)
  }

  async function handleDeleteTransferSave() {
    if (transfer?.nodeId) {
      await deleteTransfer({
        variables: {
          nodeId: transfer?.nodeId,
        },
      })
    }
    setDeleteOpen(false)
  }

  function handleDeleteTransferClose() {
    setDeleteOpen(false)
  }

  return (
    <>
      {hasTransfer && (
        <IconButton size={'small'} onClick={() => handleDeleteTransfer()}>
          <Link />
        </IconButton>
      )}
      {!hasTransfer && (
        <IconButton
          size={'small'}
          sx={{ visibility: 'hidden' }}
          className={'transaction-row-hover'}
          onClick={() => handleAddTransfer()}
        >
          <AddLink />
        </IconButton>
      )}
      <Dialog open={addOpen}>
        <DialogTitle>{t('transfer.matchTransaction')}</DialogTitle>
        <DialogContent>
          {matchingTransactions.map((t: Transaction, index: number) => {
            return (
              <List key={`matching-transaction-${t.id}`}>
                <ListItem disablePadding>
                  <ListItemButton
                    selected={index === selectedIndex}
                    onClick={() => handleSelectMatchingTransaction(index)}
                  >
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
          {matchingTransactions.length === 0 && loaded && <Alert severity={'warning'}>{t('transactions.none')}</Alert>}
        </DialogContent>
        <DialogActions>
          <SaveCancel
            handleSave={handleCreateTransfer}
            handleCancel={handleCreateTransferClose}
            saveDisabled={!matchingTransactions[selectedIndex]}
          />
        </DialogActions>
      </Dialog>
      <Dialog open={deleteOpen}>
        <DialogTitle>{t('transfer.deleteTransfer')}</DialogTitle>
        <DialogContent>
          {transferTransaction && (
            <List key={`matching-transaction-${transferTransaction.id}`}>
              <ListItem disablePadding>
                <ListItemButton selected={true}>
                  <ListItemIcon>
                    <RadioButtonChecked />
                  </ListItemIcon>
                  <ListItemText
                    primary={transferTransaction.name}
                    secondary={transferTransaction.memo}
                    sx={{ mr: 4 }}
                  />
                  <ListItemText primary={formatMoney(transferTransaction.amount / 100, 'CAD', hidden)} />
                </ListItemButton>
              </ListItem>
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <SaveCancel handleSave={handleDeleteTransferSave} handleCancel={handleDeleteTransferClose} />
        </DialogActions>
      </Dialog>
    </>
  )
}
