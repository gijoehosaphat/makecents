'use client'

import { updateSearchParamsUrl } from '@/lib/updateSearchParamsUrl'
import {
  Box,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useMemo, useTransition } from 'react'
import TransactionRow from './TransactionRow'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { usePaginationParams } from '@/lib/usePaginationParams'
import { useTransactionFilterParams } from '@/lib/useTransactionFilterParams'
import { useBankAccountFilterParams } from '@/lib/useBankAccountFilterParams'
import { useTransactionAmountParams } from '@/lib/useTransactionAmountParams'
import { useTransactionSortParams } from '@/lib/useTransactionSortParams'
import { TransactionSort } from '@/lib/transactionSort'
import { useTransactionSearchParams } from '@/lib/useTransactionSearchParams'
import { useFilteredTransactions } from '@/lib/useFilteredTransactions'
import { useAppContext } from '../context/AppContextProvider'

export function TransactionsResults() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const { bankAccounts } = useAppContext()
  const t = useTranslations('common')
  const { dateFrom, dateTo } = useDateFilterParams()
  const { categorized, categoryIds, autoCategorized } = useTransactionFilterParams()
  const { bankAccountIds: selectedBankAccountIds } = useBankAccountFilterParams()
  const { direction, amountMin, amountMax } = useTransactionAmountParams()
  const { search } = useTransactionSearchParams()
  const { sort } = useTransactionSortParams()
  const { limit, page, offset } = usePaginationParams()
  const [, startTransition] = useTransition()

  const filteredBankAccountIds = useMemo(() => {
    return selectedBankAccountIds || bankAccounts.map((bankAccount) => bankAccount.id)
  }, [selectedBankAccountIds, bankAccounts])

  const { transactions, totalCount, refetchQuery } = useFilteredTransactions({
    limit,
    offset,
    bankAccountIds: filteredBankAccountIds,
    dateFrom,
    dateTo,
    categorized,
    categoryIds,
    autoCategorized,
    direction,
    amountMin,
    amountMax,
    search,
    sort,
  })

  // Text search results come back newest first from the database and can't be re-sorted.
  const sortDisabled = search.trim() !== ''

  const handleSort = (next: TransactionSort) => {
    startTransition(() => {
      router.push(updateSearchParamsUrl(pathname, searchParams, { sort: next === 'posted_desc' ? null : next }))
    })
  }

  const handlePagination = (
    event: React.ChangeEvent<unknown>,
    newPage: number,
  ) => {
    if (newPage !== page) {
      const url = updateSearchParamsUrl(pathname, searchParams, { page: String(newPage) })
      startTransition(() => {
        router.push(url)
      })
    }
  }

  return (
    <>
      {transactions.length === 0 && (
        <Box
          p={10}
          display={'flex'}
          justifyContent={'center'}
          alignItems={'center'}
        >
          <Typography variant={'subtitle1'}>
            {t('transactions.none')}
          </Typography>
        </Box>
      )}
      {transactions.length > 0 && (
        <>
          <TableContainer>
            <Table size={'small'}>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={!sortDisabled && (sort === 'posted_desc' || sort === 'posted_asc')}
                      direction={sort === 'posted_asc' ? 'asc' : 'desc'}
                      disabled={sortDisabled}
                      onClick={() => handleSort(sort === 'posted_desc' ? 'posted_asc' : 'posted_desc')}
                    >
                      <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                        {t('shared.date')}
                      </Typography>
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                      {t('transactions.bankAccount')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                      {t('shared.name')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                      {t('transactions.category')}
                    </Typography>
                  </TableCell>
                  <TableCell align={'right'}>
                    <TableSortLabel
                      active={!sortDisabled && sort === 'amount_asc'}
                      direction={'desc'}
                      disabled={sortDisabled}
                      onClick={() => handleSort(sort === 'amount_asc' ? 'posted_desc' : 'amount_asc')}
                    >
                      <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                        {t('transactions.withdrawals')}
                      </Typography>
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align={'right'}>
                    <TableSortLabel
                      active={!sortDisabled && sort === 'amount_desc'}
                      direction={'desc'}
                      disabled={sortDisabled}
                      onClick={() => handleSort(sort === 'amount_desc' ? 'posted_desc' : 'amount_desc')}
                    >
                      <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                        {t('transactions.deposits')}
                      </Typography>
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.nodeId}
                    transaction={transaction}
                    refetchQuery={refetchQuery}
                    showBankAccount
                    rowFilter={{ categorized, categoryIds, autoCategorized, direction, amountMin, amountMax }}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4 }}>
            <Pagination
              count={Math.ceil(totalCount / limit)}
              page={page}
              onChange={handlePagination}
              variant={'outlined'}
              shape={'rounded'}
            />
          </Box>
        </>
      )}
    </>
  )
}
