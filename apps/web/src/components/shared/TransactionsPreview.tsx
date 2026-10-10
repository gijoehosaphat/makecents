'use client'

import { Transaction } from '@/graphql/types'
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
  Typography,
} from '@mui/material'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import TransactionRow from '../transactions/TransactionRow'

const PAGE_SIZE = 50

/**
 * Lists a set of transactions so they can be categorized in place.
 *
 * `nodeIds` fixes which rows are shown (and in what order) while the dialog is open, and `pool` is the live query
 * data the rows are read from, so edits show up immediately and a row doesn't vanish just because it was categorized.
 */
export default function TransactionsPreview({
  nodeIds,
  pool,
  refetchQuery,
  handleComplete,
}: {
  nodeIds: string[] | null
  pool: Transaction[]
  refetchQuery: InternalRefetchQueryDescriptor
  handleComplete: () => void
}) {
  const t = useTranslations('common')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const transactions = useMemo(() => {
    if (!nodeIds) return []
    const byNodeId = new Map(pool.map((transaction) => [transaction.nodeId, transaction]))
    return nodeIds.flatMap((nodeId) => byNodeId.get(nodeId) ?? [])
  }, [nodeIds, pool])

  const visible = transactions.slice(0, visibleCount)

  return (
    <Dialog
      open={nodeIds !== null}
      maxWidth={'lg'}
      fullWidth
      onClose={handleComplete}
      slotProps={{ transition: { onExited: () => setVisibleCount(PAGE_SIZE) } }}
    >
      <DialogTitle>{t('transactions.transactions')}</DialogTitle>
      <DialogContent>
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
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((transaction) => (
                <TransactionRow
                  key={transaction.nodeId}
                  transaction={transaction}
                  refetchQuery={refetchQuery}
                  categorizeOnly
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {transactions.length > visibleCount && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Button onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
              {t('transactions.showMore', { remaining: transactions.length - visibleCount })}
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <IconButton onClick={handleComplete}>
          <Close />
        </IconButton>
      </DialogActions>
    </Dialog>
  )
}
