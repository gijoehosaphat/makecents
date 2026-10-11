import { Transaction } from '@/graphql/types'
import { Add, CallSplit, Close, DeleteForever } from '@mui/icons-material'
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import SaveCancel from '../forms/SaveCancel'
import { useTranslations } from 'next-intl'
import CurrencyTextField from '../shared/CurrencyTextField'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { UpsertSplitTransactionsDocument } from '@/graphql/operations'
import { fromCents, toCents } from '@/lib/formatMoney'
import { MIN_PART_CENTS, canAddPart, clampPartCents, maxPartCents, remainingCents } from '@/lib/splitMath'

interface SplitTransaction {
  nodeId: string
  id: number
  name?: string | null
  memo?: string | null
  amount: number
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
  const [isWithdrawal] = useState(transaction.originalAmount < 0)
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const [splitTransactions, setSplitTransactions] = useState<SplitTransaction[]>(
    transaction?.transactionsBySplitSourceId?.nodes?.map((splitTransaction) => ({
      nodeId: splitTransaction.nodeId,
      id: splitTransaction.id,
      name: splitTransaction.name,
      memo: splitTransaction.memo,
      amount: splitTransaction.amount,
    }))
  )
  const [toCreateTransactions, setToCreateTransactions] = useState<Transaction[]>([])
  const [toDelete, setToDelete] = useState<number[]>([])

  // The original row keeps whatever the other parts leave, so the parts always add up to the original amount.
  const totalCents = Math.abs(Number(transaction.originalAmount))
  const partCents = [...splitTransactions, ...toCreateTransactions].map((part) => Math.abs(part.amount))
  const amount = remainingCents(totalCents, partCents)

  function openEditor() {
    setIsEditorOpen(true)
  }

  function handleClose() {
    setToCreateTransactions([])
    setToDelete([])
    setIsEditorOpen(false)
  }

  async function handleSave() {
    let toUpdate = []
    let toCreate = []

    //Add parent trainsaction
    toUpdate.push({
      id: transaction.id,
      amount: isWithdrawal ? -Math.abs(amount) : Math.abs(amount),
    })

    //Add existing split transactions
    for (let splitTransaction of splitTransactions) {
      toUpdate.push({
        id: splitTransaction.id,
        amount: isWithdrawal ? -Math.abs(splitTransaction.amount) : Math.abs(splitTransaction.amount),
      })
    }

    //Add new transactions to be created
    let i = 0
    for (let toCreateTransaction of toCreateTransactions) {
      toCreate.push({
        bankAccountId: transaction.bankAccountId,
        amount: isWithdrawal ? -Math.abs(toCreateTransaction.amount) : Math.abs(toCreateTransaction.amount),
        originalAmount: isWithdrawal ? -Math.abs(toCreateTransaction.amount) : Math.abs(toCreateTransaction.amount),
        splitSourceId: transaction.id,
        bankTransactionId: `${transaction.bankTransactionId}-${i}-${new Date().getTime()}`,
        memo: transaction.memo,
        name: transaction.name,
        posted: transaction.posted,
        originalPosted: transaction.posted,
        type: transaction.type,
      })
      i += 1
    }

    upsertSplitTransactions({
      variables: {
        toUpdate,
        toCreate,
        toDelete: toDelete.map((toDeleteId) => ({ id: toDeleteId })),
      },
    })

    handleClose()
  }

  /** Every part's cents except one, by position in the splits followed by the new parts. */
  function otherPartCents(partIndex: number) {
    return partCents.filter((_, i) => i !== partIndex)
  }

  function onAmountChangeSplitTransaction(value: number, index: number, nodeId: string) {
    if (splitTransactions[index].nodeId === nodeId) {
      const newSplitTransactions = [...splitTransactions]
      newSplitTransactions[index] = {
        ...newSplitTransactions[index],
        amount: clampPartCents(toCents(value), totalCents, otherPartCents(index)),
      }
      setSplitTransactions(newSplitTransactions)
    }
  }
  function onAmountChangeToCreateTransaction(value: number, index: number, nodeId: string) {
    if (toCreateTransactions[index].nodeId === nodeId) {
      const newToCreateTransactions = [...toCreateTransactions]
      newToCreateTransactions[index] = {
        ...newToCreateTransactions[index],
        amount: clampPartCents(toCents(value), totalCents, otherPartCents(splitTransactions.length + index)),
      }
      setToCreateTransactions(newToCreateTransactions)
    }
  }

  async function removeSplitTransaction(nodeId: string) {
    const toDeleteId = splitTransactions.find((transaction) => transaction.nodeId === nodeId)?.id
    if (toDeleteId) {
      setSplitTransactions(splitTransactions.filter((transaction) => transaction.nodeId !== nodeId))
      setToDelete([...toDelete, toDeleteId])
    }
  }

  async function removeToCreateTransaction(nodeId: string) {
    setToCreateTransactions(toCreateTransactions.filter((t) => t.nodeId !== nodeId))
  }

  function addToCreateTransaction() {
    setToCreateTransactions([
      ...toCreateTransactions,
      {
        nodeId: `pending-${new Date().getTime()}`,
        name: 'Pending',
        amount: MIN_PART_CENTS,
      } as Transaction,
    ])
  }

  useEffect(() => {
    if (isEditorOpen) {
      setSplitTransactions(
        transaction?.transactionsBySplitSourceId?.nodes?.map((splitTransaction) => ({
          nodeId: splitTransaction.nodeId,
          id: splitTransaction.id,
          name: splitTransaction.name,
          memo: splitTransaction.memo,
          amount: splitTransaction.amount,
        }))
      )
    }
  }, [isEditorOpen, transaction?.transactionsBySplitSourceId?.nodes])

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
      <Dialog open={isEditorOpen} onClose={handleClose}>
        <DialogTitle sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
          <CallSplit sx={{ mr: 2 }} />
          {t('categories.splitTransaction')}
        </DialogTitle>
        <DialogContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Typography variant={'body2'}>{transaction.name}</Typography>
                  <Typography variant={'caption'}>{transaction.memo}</Typography>
                </TableCell>
                <TableCell>
                  <CurrencyTextField
                    size={'small'}
                    disabled={true}
                    value={fromCents(amount)}
                    options={{
                      minimumValue: '0',
                      maximumValue: fromCents(totalCents).toFixed(2),
                    }}
                  />
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
              {splitTransactions.map((splitTransaction, i) => {
                const splitTransactionMax = fromCents(maxPartCents(totalCents, otherPartCents(i)))
                return (
                  <TableRow key={splitTransaction.id}>
                    <TableCell>
                      <Typography variant={'body2'}>{splitTransaction.name}</Typography>
                      <Typography variant={'caption'}>{splitTransaction.memo}</Typography>
                    </TableCell>
                    <TableCell>
                      <CurrencyTextField
                        size={'small'}
                        value={fromCents(Math.abs(splitTransaction.amount))}
                        onValueChange={(value) => onAmountChangeSplitTransaction(value, i, splitTransaction.nodeId)}
                        options={{
                          minimumValue: '0',
                          maximumValue: splitTransactionMax.toFixed(2),
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size={'small'}
                        onClick={() => removeSplitTransaction(splitTransaction.nodeId)}
                        aria-label="Remove"
                      >
                        <DeleteForever />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )
              })}
              {toCreateTransactions.map((toCreateTransaction, i) => {
                const toCreateTransactionMax = fromCents(
                  maxPartCents(totalCents, otherPartCents(splitTransactions.length + i))
                )
                return (
                  <TableRow key={toCreateTransaction.nodeId}>
                    <TableCell>
                      <Typography variant={'body2'}>{toCreateTransaction.name}</Typography>
                      <Typography variant={'caption'}>{toCreateTransaction.memo}</Typography>
                    </TableCell>
                    <TableCell>
                      <CurrencyTextField
                        size={'small'}
                        value={fromCents(Math.abs(toCreateTransaction.amount))}
                        onValueChange={(value) =>
                          onAmountChangeToCreateTransaction(value, i, toCreateTransaction.nodeId)
                        }
                        options={{
                          minimumValue: '0',
                          maximumValue: toCreateTransactionMax.toFixed(2),
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size={'small'}
                        onClick={() => removeToCreateTransaction(toCreateTransaction.nodeId)}
                        aria-label="Remove"
                      >
                        <Close />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow>
                <TableCell></TableCell>
                <TableCell></TableCell>
                <TableCell>
                  <IconButton
                    size={'small'}
                    color={'secondary'}
                    onClick={addToCreateTransaction}
                    disabled={!canAddPart(totalCents, partCents)}
                  >
                    <Add />
                  </IconButton>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <SaveCancel saveDisabled={false} handleSave={handleSave} handleCancel={handleClose} />
        </DialogActions>
      </Dialog>
    </>
  )
}
