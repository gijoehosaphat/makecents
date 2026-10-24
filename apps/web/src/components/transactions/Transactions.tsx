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
  Typography,
} from '@mui/material'
import { DateFilter } from '../shared/DateFilter'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import TransactionRow from './TransactionRow'
import { StickyHeader } from '../shared/StickyHeader'
import { useDateFilterParams } from '@/lib/useDateFilterParams'
import { usePaginationParams } from '@/lib/usePaginationParams'
import { useCurrentBankAccountIds } from '@/lib/useCurrentBankAccountIds'
import { BankAccountHeader } from '../shared/BankAccountHeader'
import { TransactionFilter } from '../shared/TransactionFilter'
import { useTransactionFilterParams } from '@/lib/useTransactionFilterParams'
import { useFilteredTransactions } from '@/lib/useFilteredTransactions'
import { CreateTransactionButton } from './CreateTransactionDialog'

export function Transactions() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('common')
  const { dateFrom, dateTo } = useDateFilterParams()
  const { categorized, categoryIds, autoCategorized } = useTransactionFilterParams()
  const { limit, page, offset } = usePaginationParams()
  const { bankAccountIds } = useCurrentBankAccountIds()

  const { transactions, totalCount, refetchQuery } = useFilteredTransactions({
    limit,
    offset,
    bankAccountIds: bankAccountIds,
    dateFrom,
    dateTo,
    categorized,
    categoryIds,
    autoCategorized,
  })

  const handlePagination = (event: React.ChangeEvent<unknown>, newPage: number) => {
    if (newPage !== page) {
      router.push(updateSearchParamsUrl(pathname, searchParams, { page: String(newPage) }))
    }
  }

  return (
    <>
      <BankAccountHeader />
      <StickyHeader>
        <DateFilter />
        <TransactionFilter />
      </StickyHeader>
      {transactions.length === 0 && (
        <Box p={10} display={'flex'} justifyContent={'center'} alignItems={'center'}>
          <Typography variant={'subtitle1'}>{t('transactions.none')}</Typography>
        </Box>
      )}
      {transactions.length > 0 && (
        <>
          <TableContainer>
            <Table size={'small'}>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                      {t('shared.date')}
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
                    <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                      {t('transactions.withdrawals')}
                    </Typography>
                  </TableCell>
                  <TableCell align={'right'}>
                    <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                      {t('transactions.deposits')}
                    </Typography>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.nodeId}
                    transaction={transaction}
                    refetchQuery={refetchQuery}
                    rowFilter={{ categorized, categoryIds, autoCategorized }}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 4 }}>
        <CreateTransactionButton
          refetchQuery={refetchQuery}
          bankAccountId={bankAccountIds.length === 1 ? bankAccountIds[0] : undefined}
        />
        {transactions.length > 0 && (
          <Pagination
            count={Math.ceil(totalCount / limit)}
            page={page}
            onChange={handlePagination}
            variant={'outlined'}
            shape={'rounded'}
            sx={{ ml: 'auto' }}
          />
        )}
      </Box>
    </>
  )
}
