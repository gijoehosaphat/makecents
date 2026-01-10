import { Box, TableCell, TableRow, Typography } from '@mui/material'
import CategoryEditor from './CategoryEditor'
import { Transaction } from '@/graphql/types'
import { formatMoney } from '@/lib/formatMoney'
import { useMemo } from 'react'
import { TransactionLink } from './TransactionLink'
import { CallSplit } from '@mui/icons-material'
import { TransactionSplit } from './TransactionSplit'
import { DateIcon } from '../shared/DateIcon'
import { TransactionDateEditor } from '../shared/TransactionDateEditor'
import { InternalRefetchQueryDescriptor } from '@apollo/client'

function TransactionAmount({ transaction, type }: { transaction: Transaction; type: 'withdrawal' | 'deposit' }) {
  const amount = transaction.amount || 0
  if ((type === 'withdrawal' && amount < 0) || (type === 'deposit' && amount > 0)) {
    return <Typography sx={{ minHeight: 24 }}>{formatMoney(amount / 100, 'CAD')}</Typography>
  } else {
    return null
  }
}

export default function TransactionRow({
  transaction,
  refetchQuery,
}: {
  transaction: Transaction
  refetchQuery: InternalRefetchQueryDescriptor
}) {
  const splitTransactions = useMemo(() => {
    return transaction.transactionsBySplitSourceId?.nodes || []
  }, [transaction.transactionsBySplitSourceId?.nodes])

  const hasTransfer = useMemo(() => {
    return !!transaction.transferByTransactionSourceId || !!transaction.transferByTransactionTargetId
  }, [transaction.transferByTransactionSourceId, transaction.transferByTransactionTargetId])

  return (
    <>
      <TableRow
        key={transaction.bankTransactionId}
        sx={() => ({
          '&:hover': {
            '.transaction-row-hover': { visibility: 'visible' },
          },
        })}
        hover={true}
      >
        <TableCell sx={{ width: '9%' }}>
          {/* {format(new Date(transaction.posted || ''), 'MMM dd, yyyy')} */}
          {!transaction.splitSourceId ? (
            <TransactionDateEditor transaction={transaction} refetchQuery={refetchQuery}>
              <DateIcon date={new Date(transaction.posted || '')} />
            </TransactionDateEditor>
          ) : (
            <CallSplit color={'primary'} sx={{ ml: 2 }} />
          )}
        </TableCell>
        <TableCell>
          <Typography variant={'body2'}>{transaction.name}</Typography>
          <Typography variant={'caption'}>{transaction.memo}</Typography>
        </TableCell>
        <TableCell sx={{ width: '25%' }}>
          <Box sx={{ display: 'flex', flexDirection: 'row' }}>
            {!hasTransfer && <CategoryEditor transaction={transaction} refetchQuery={refetchQuery} />}
            {!transaction.categoryId && <TransactionLink transaction={transaction} refetchQuery={refetchQuery} />}
            {/* TODO: Split transaction... */}
            {!hasTransfer && <TransactionSplit transaction={transaction} refetchQuery={refetchQuery} />}
          </Box>
        </TableCell>
        <TableCell align={'right'} sx={{ width: '10%' }}>
          <TransactionAmount transaction={transaction} type={'withdrawal'} />
        </TableCell>
        <TableCell align={'right'} sx={{ width: '10%' }}>
          <TransactionAmount transaction={transaction} type={'deposit'} />
        </TableCell>
      </TableRow>
      {splitTransactions.map((splitTransaction) => {
        return (
          <TableRow
            key={splitTransaction.nodeId}
            sx={() => ({
              '&:hover': {
                '.transaction-row-hover': { visibility: 'visible' },
              },
              backgroundColor: '#00000011',
            })}
            hover={true}
          >
            <TableCell sx={{ width: '9%' }}>
              <CallSplit color={'primary'} sx={{ ml: 2 }} />
            </TableCell>
            <TableCell>
              <Typography variant={'body2'}>{transaction.name}</Typography>
              <Typography variant={'caption'}>{transaction.memo}</Typography>
            </TableCell>
            <TableCell sx={{ width: '25%' }}>
              <Box sx={{ display: 'flex', flexDirection: 'row' }}>
                <CategoryEditor transaction={splitTransaction} refetchQuery={refetchQuery} />
              </Box>
            </TableCell>
            <TableCell align={'right'} sx={{ width: '10%' }}>
              <TransactionAmount transaction={splitTransaction} type={'withdrawal'} />
            </TableCell>
            <TableCell align={'right'} sx={{ width: '10%' }}>
              <TransactionAmount transaction={splitTransaction} type={'deposit'} />
            </TableCell>
          </TableRow>
        )
      })}
    </>
  )
}
