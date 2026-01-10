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
import { useCallback, useEffect, useMemo, useState } from 'react'
import SaveCancel from '../forms/SaveCancel'
import { useTranslations } from 'next-intl'
import CurrencyTextField from '../shared/CurrencyTextField'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import { UpsertSplitTransactionsDocument } from '@/graphql/operations'

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
  const [upsertSplitTransactions] = useMutation(UpsertSplitTransactionsDocument, {
    refetchQueries: [refetchQuery],
  })
  const [isWithdrawal] = useState(transaction.originalAmount < 0)
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const [amount, setAmount] = useState(Math.abs(Number(transaction.amount))) //Main transactions amount...
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

  const maximumAmount = useMemo(() => {
    return Math.abs(Number(transaction.originalAmount))
  }, [transaction.originalAmount]) //Original amount, maximum overall total all transactions can add up to.
  const maximumInputValue = useMemo(() => {
    return Math.abs(maximumAmount) - (splitTransactions.length + toCreateTransactions.length)
  }, [maximumAmount, splitTransactions.length, toCreateTransactions.length])
  const currentToCreateTotal = useMemo(() => {
    return toCreateTransactions.reduce((partialSum, t) => partialSum + Math.abs(t.amount), 0)
  }, [toCreateTransactions])
  const currentSplitTotal = useMemo(() => {
    return splitTransactions.reduce((partialSum, t) => partialSum + Math.abs(t.amount), 0)
  }, [splitTransactions])

  function openEditor() {
    setIsEditorOpen(true)
  }

  function handleClose() {
    setToCreateTransactions([])
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

  function onAmountChangeSplitTransaction(value: number, index: number, nodeId: string) {
    if (splitTransactions[index].nodeId === nodeId) {
      const newSplitTransactions = [...splitTransactions]
      newSplitTransactions[index].amount = Math.floor(value * 100)
      setSplitTransactions(newSplitTransactions)
    }
  }
  function onAmountChangeToCreateTransaction(value: number, index: number, nodeId: string) {
    if (toCreateTransactions[index].nodeId === nodeId) {
      const newToCreateTransactions = [...toCreateTransactions]
      newToCreateTransactions[index].amount = Math.floor(value * 100)
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
        amount: 0,
      } as Transaction,
    ])
  }

  const decrement = useCallback(
    (currentTotal: number) => {
      if (isEditorOpen) {
        if (amount > 1) {
          setAmount(Math.max(1, amount - (currentTotal - maximumAmount)))
        } else if (currentSplitTotal > splitTransactions.length) {
          splitTransactions.forEach((splitTransaction, i) => {
            if (Math.abs(splitTransaction.amount) > 1) {
              const newAmount = Math.max(1, splitTransaction.amount - (currentTotal - maximumAmount))
              const newSplitTransactions = [...toCreateTransactions]
              newSplitTransactions[i].amount = newAmount
              setToCreateTransactions(newSplitTransactions)
              return
            }
          })
        } else if (currentToCreateTotal > toCreateTransactions.length) {
          toCreateTransactions.forEach((toCreateTransaction, i) => {
            if (Math.abs(toCreateTransaction.amount) > 1) {
              const newAmount = Math.max(1, toCreateTransaction.amount - (currentTotal - maximumAmount))
              const newToCreateTransactions = [...toCreateTransactions]
              newToCreateTransactions[i].amount = newAmount
              setToCreateTransactions(newToCreateTransactions)
              return
            }
          })
        }
      }
    },
    [
      isEditorOpen,
      toCreateTransactions,
      splitTransactions,
      amount,
      maximumAmount,
      currentToCreateTotal,
      currentSplitTotal,
    ]
  )

  const increment = useCallback(
    (currentTotal: number) => {
      if (isEditorOpen) {
        const max = Math.floor(maximumInputValue * 100)
        if (amount < max) {
          setAmount(Math.min(max, amount + (maximumAmount - currentTotal)))
        }
      }
    },
    [isEditorOpen, amount, maximumAmount, maximumInputValue]
  )

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

  useEffect(() => {
    if (isEditorOpen) {
      const currentToCreateTotal = toCreateTransactions.reduce((partialSum, t) => partialSum + Math.abs(t.amount), 0)
      const currentSplitTotal = splitTransactions.reduce((partialSum, t) => partialSum + Math.abs(t.amount), 0)
      if (currentToCreateTotal + currentSplitTotal + amount > Math.abs(maximumAmount)) {
        decrement(currentToCreateTotal + currentSplitTotal + amount)
      } else if (currentToCreateTotal + currentSplitTotal + amount < Math.abs(maximumAmount)) {
        increment(currentToCreateTotal + currentSplitTotal + amount)
      }
    }
  }, [isEditorOpen, toCreateTransactions, splitTransactions, amount, maximumAmount, decrement, increment])

  const maximumValue = Number(maximumInputValue / 100).toFixed(2)
  const value = Math.min(Number(maximumValue), Number(Number(amount / 100).toFixed(2)))

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
                    value={value}
                    options={{
                      minimumValue: '0',
                      maximumValue,
                    }}
                  />
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
              {splitTransactions.map((splitTransaction, i) => {
                const splitTransactionValue = Math.min(
                  Number(maximumValue),
                  Number(Number(Math.abs(splitTransaction.amount) / 100).toFixed(2))
                )
                return (
                  <TableRow key={splitTransaction.id}>
                    <TableCell>
                      <Typography variant={'body2'}>{splitTransaction.name}</Typography>
                      <Typography variant={'caption'}>{splitTransaction.memo}</Typography>
                    </TableCell>
                    <TableCell>
                      <CurrencyTextField
                        size={'small'}
                        value={splitTransactionValue}
                        onValueChange={(value) => onAmountChangeSplitTransaction(value, i, splitTransaction.nodeId)}
                        options={{
                          minimumValue: '0',
                          maximumValue,
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
                const toCreateTransactionValue = Math.min(
                  Number(maximumValue),
                  Number(Number(Math.abs(toCreateTransaction.amount) / 100).toFixed(2))
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
                        value={toCreateTransactionValue}
                        onValueChange={(value) =>
                          onAmountChangeToCreateTransaction(value, i, toCreateTransaction.nodeId)
                        }
                        options={{
                          minimumValue: '0',
                          maximumValue,
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
                  <IconButton size={'small'} color={'secondary'} onClick={addToCreateTransaction}>
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
