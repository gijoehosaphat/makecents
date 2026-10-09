import { Box, TableCell, TableRow, Typography } from '@mui/material'
import CategoryEditor from './CategoryEditor'
import { Transaction } from '@/graphql/types'
import { formatMoney } from '@/lib/formatMoney'
import { useBankAccountLabel } from '../shared/BankAccountLabel'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useMemo } from 'react'
import { TransactionLink } from './TransactionLink'
import { CallSplit } from '@mui/icons-material'
import { TransactionSplit } from './TransactionSplit'
import { DateIcon } from '../shared/DateIcon'
import { TransactionDateEditor } from '../shared/TransactionDateEditor'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { TransactionMemoEditor } from '../shared/TransactionMemoEditor'
import { useAppContext } from '../context/AppContextProvider'
import { useTranslations } from 'next-intl'
import { TransactionRowFilterOptions, transactionMatchesRowFilter } from '@/lib/transactionRowFilter'

function TransactionAmount({
  transaction,
  type,
  showOriginalAmount,
}: {
  transaction: Transaction
  type: 'withdrawal' | 'deposit'
  showOriginalAmount?: boolean
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  const amount = transaction.amount || 0
  if (
    (type === 'withdrawal' && amount < 0) ||
    (type === 'deposit' && amount > 0)
  ) {
    return (
      <>
        <Typography sx={{ minHeight: 24 }}>
          {formatMoney(amount / 100, 'CAD', hidden)}
        </Typography>
        {showOriginalAmount && (
          <Typography variant={'caption'} color={'text.secondary'}>
            {t('transactions.splitOfTotal', {
              total: formatMoney((transaction.originalAmount || 0) / 100, 'CAD', hidden),
            })}
          </Typography>
        )}
      </>
    )
  } else {
    return null
  }
}

// Rows of a split group that don't match the active filter stay visible for context, but dimmed.
function rowSx(dimmed: boolean, background?: string) {
  return {
    '&:hover': {
      '.transaction-row-hover': { visibility: 'visible' },
      'opacity': 1,
    },
    'opacity': dimmed ? 0.4 : 1,
    ...(background ? { backgroundColor: background } : {}),
  }
}

export default function TransactionRow({
  transaction,
  refetchQuery,
  showBankAccount,
  rowFilter,
}: {
  transaction: Transaction
  refetchQuery: InternalRefetchQueryDescriptor
  showBankAccount?: boolean
  rowFilter?: TransactionRowFilterOptions
}) {
  const { bankAccounts } = useAppContext()
  const accountLabel = useBankAccountLabel()

  function bankAccountLabel(bankAccountId?: number | null) {
    const bankAccount = bankAccounts.find((account) => account.id === bankAccountId)
    return accountLabel(bankAccount)
  }

  const splitTransactions = useMemo(() => {
    return transaction.transactionsBySplitSourceId?.nodes || []
  }, [transaction.transactionsBySplitSourceId?.nodes])

  const hasSplits = splitTransactions.length > 0

  function isDimmed(row: Transaction) {
    return hasSplits && !!rowFilter && !transactionMatchesRowFilter(row, rowFilter)
  }

  const hasTransfer = useMemo(() => {
    return (
      !!transaction.transferByTransactionSourceId ||
      !!transaction.transferByTransactionTargetId
    )
  }, [
    transaction.transferByTransactionSourceId,
    transaction.transferByTransactionTargetId,
  ])

  return (
    <>
      <TableRow
        key={transaction.bankTransactionId}
        sx={rowSx(isDimmed(transaction))}
        hover={true}
      >
        <TableCell sx={{ width: '9%' }}>
          <TransactionDateEditor
            transaction={transaction}
            refetchQuery={refetchQuery}
          >
            <DateIcon date={new Date(transaction.posted || '')} />
          </TransactionDateEditor>
        </TableCell>
        {showBankAccount && (
          <TableCell sx={{ width: '15%' }}>
            <Typography variant={'body2'}>
              {bankAccountLabel(transaction.bankAccountId)}
            </Typography>
          </TableCell>
        )}
        <TableCell>
          <TransactionMemoEditor
            transaction={transaction}
            refetchQuery={refetchQuery}
          >
            <Typography variant={'body2'}>
              {transaction.customName || transaction.name}
            </Typography>
            <Typography variant={'caption'}>
              {transaction.customMemo || transaction.memo}
            </Typography>
          </TransactionMemoEditor>
        </TableCell>
        <TableCell sx={{ width: '25%' }}>
          <Box sx={{ display: 'flex', flexDirection: 'row' }}>
            {!hasTransfer && (
              <CategoryEditor
                transaction={transaction}
                refetchQuery={refetchQuery}
              />
            )}
            {!transaction.categoryId && !hasSplits && (
              <TransactionLink
                transaction={transaction}
                refetchQuery={refetchQuery}
              />
            )}
            {!hasTransfer && (
              <TransactionSplit
                transaction={transaction}
                refetchQuery={refetchQuery}
              />
            )}
          </Box>
        </TableCell>
        <TableCell align={'right'} sx={{ width: '10%' }}>
          <TransactionAmount transaction={transaction} type={'withdrawal'} showOriginalAmount={hasSplits} />
        </TableCell>
        <TableCell align={'right'} sx={{ width: '10%' }}>
          <TransactionAmount transaction={transaction} type={'deposit'} showOriginalAmount={hasSplits} />
        </TableCell>
      </TableRow>
      {splitTransactions.map((splitTransaction) => {
        return (
          <TableRow
            key={splitTransaction.nodeId}
            sx={rowSx(isDimmed(splitTransaction), '#00000011')}
            hover={true}
          >
            <TableCell sx={{ width: '9%' }}>
              <CallSplit color={'primary'} sx={{ ml: 2 }} />
            </TableCell>
            {showBankAccount && (
              <TableCell sx={{ width: '15%' }}>
                <Typography variant={'body2'}>
                  {bankAccountLabel(splitTransaction.bankAccountId)}
                </Typography>
              </TableCell>
            )}
            <TableCell>
              <TransactionMemoEditor
                transaction={splitTransaction}
                refetchQuery={refetchQuery}
              >
                <Typography variant={'body2'}>
                  {splitTransaction.customName || splitTransaction.name}
                </Typography>
                <Typography variant={'caption'}>
                  {splitTransaction.customMemo || splitTransaction.memo}
                </Typography>
              </TransactionMemoEditor>
            </TableCell>
            <TableCell sx={{ width: '25%' }}>
              <Box sx={{ display: 'flex', flexDirection: 'row' }}>
                <CategoryEditor
                  transaction={splitTransaction}
                  refetchQuery={refetchQuery}
                />
              </Box>
            </TableCell>
            <TableCell align={'right'} sx={{ width: '10%' }}>
              <TransactionAmount
                transaction={splitTransaction}
                type={'withdrawal'}
              />
            </TableCell>
            <TableCell align={'right'} sx={{ width: '10%' }}>
              <TransactionAmount
                transaction={splitTransaction}
                type={'deposit'}
              />
            </TableCell>
          </TableRow>
        )
      })}
    </>
  )
}
