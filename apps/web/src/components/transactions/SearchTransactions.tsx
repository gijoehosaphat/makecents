'use client'

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
import { BankAccountHeader } from '../shared/BankAccountHeader'
import { TransactionFilter } from '../shared/TransactionFilter'
import { useTransactionFilterParams } from '@/lib/useTransactionFilterParams'
import { useFilteredTransactions } from '@/lib/useFilteredTransactions'
import { useAppContext } from '../context/AppContextProvider'

export function SearchTransactions() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const { bankAccounts } = useAppContext()
  const t = useTranslations('common')
  const { dateFrom, dateTo } = useDateFilterParams()
  const { categorized } = useTransactionFilterParams()
  const { limit, page, offset } = usePaginationParams()

  const { transactions, totalCount, refetchQuery } = useFilteredTransactions({
    limit,
    offset,
    bankAccountIds: bankAccounts.map((bankAccount) => bankAccount.id),
    dateFrom,
    dateTo,
    excludeSplitTransactions: true,
    categorized,
  })

  const handlePagination = (event: React.ChangeEvent<unknown>, newPage: number) => {
    if (newPage !== page) {
      let queryParams: string[] = []
      if (searchParams) {
        for (let [key, value] of searchParams?.entries()) {
          if (key !== 'page') {
            queryParams.push(`${key}=${value}`)
          }
        }
      }
      queryParams.push(`page=${newPage}`)
      router.push(`${pathname}?${queryParams.join('&')}`)
    }
  }

  return (
    <>
      {/* <BankAccountHeader /> */}
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
                  {/* <TableCell /> */}
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((transaction) => (
                  <TransactionRow key={transaction.nodeId} transaction={transaction} refetchQuery={refetchQuery} />
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
function useCurrentBankAccount(): { bankAccountId: any } {
  throw new Error('Function not implemented.')
}
