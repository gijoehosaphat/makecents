'use client'

import { Transaction } from '@/graphql/types'
import { Close } from '@mui/icons-material'
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { formatMoney } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import CategoryEditor from '../transactions/CategoryEditor'

export default function TransactionsPreview({
  open,
  transactions,
  handleComplete,
}: {
  open: boolean
  transactions: Transaction[]
  handleComplete: () => void
}) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()

  //TODO: May need fake pagination to avoid rendering speed issues.

  return (
    <Dialog open={open} maxWidth={'lg'}>
      <DialogTitle>{t('transactions.transactions')}</DialogTitle>
      <DialogContent>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t('shared.name')}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t('shared.date')}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t('transactions.category')}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t('transactions.withdrawals')}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t('transactions.deposits')}
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((transaction: Transaction) => (
                <TableRow key={transaction.bankTransactionId}>
                  <TableCell>
                    <Typography variant={'body2'}>{transaction.name}</Typography>
                    <Typography variant={'caption'}>{transaction.memo}</Typography>
                  </TableCell>
                  <TableCell>{format(new Date(transaction.posted), 'MMM dd, yyyy')}</TableCell>
                  <TableCell>
                    <CategoryEditor transaction={transaction} />
                  </TableCell>
                  <TableCell align="right">
                    {transaction.amount < 0 ? formatMoney(transaction.amount / 100, 'CAD', hidden) : null}
                  </TableCell>
                  <TableCell align="right">
                    {transaction.amount > 0 ? formatMoney(transaction.amount / 100, 'CAD', hidden) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <IconButton onClick={handleComplete}>
          <Close />
        </IconButton>
      </DialogActions>
    </Dialog>
  )
}
