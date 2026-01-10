'use client'

import { Category, Transaction, User } from '@/graphql/types'
import { useLazyQuery } from '@apollo/client/react'
import { Close } from '@mui/icons-material'
import {
  Box,
  Button,
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
  TextField,
  Typography,
} from '@mui/material'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { formatMoney } from '@/lib/formatMoney'
import { CategoryMatchAdd } from './CategoryMatchAdd'
import { GetTransactionDocument, TransactionSearchDocument } from '@/graphql/operations'

export default function CategoryMatch({
  open,
  category,
  user,
  handleComplete,
}: {
  open: boolean
  category: Category
  user: User | null
  handleComplete: () => void
}) {
  //TODO: Use Apollo query tool!
  // const [getTransaction] = useLazyQuery(GetTransactionDocument)
  const [getTransactions, getTransactionsResults] = useLazyQuery(TransactionSearchDocument)
  const [fields, setFields] = useState({ regex: category?.regex })
  const t = useTranslations('common')

  useEffect(() => {
    if (open === true) {
      getTransactions({
        variables: {
          match: fields.regex || '',
        },
      })
    }
  }, [open, fields.regex, getTransactions])

  function handleChange(field: string, value: string | number) {
    setFields({
      ...fields,
      [field]: value,
    })
  }

  function findMatches() {
    getTransactions({
      variables: {
        match: fields.regex || '',
      },
    })
  }

  const transactions = (getTransactionsResults?.data?.transactionSearch?.nodes as Transaction[]) || []

  return (
    <Dialog open={open} maxWidth={'lg'}>
      <DialogTitle>{t('categories.findTransactions')}</DialogTitle>
      <DialogContent>
        <Box
          component={'form'}
          noValidate
          autoComplete={'off'}
          sx={{ pt: 2, display: 'flex', flexDirection: 'column' }}
        >
          <TextField
            defaultValue={fields.regex}
            label={t('forms.regex')}
            onChange={(event) => handleChange('regex', event.currentTarget.value)}
            size={'small'}
            placeholder={t('forms.namePlaceholder')}
            sx={{ mb: 4 }}
          />
          <Button onClick={findMatches}>{'run'}</Button>
        </Box>
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
                    <CategoryMatchAdd category={category} transaction={transaction} />
                  </TableCell>
                  <TableCell align="right">
                    {transaction.amount < 0 ? formatMoney(transaction.amount / 100, 'CAD') : null}
                  </TableCell>
                  <TableCell align="right">
                    {transaction.amount > 0 ? formatMoney(transaction.amount / 100, 'CAD') : null}
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
