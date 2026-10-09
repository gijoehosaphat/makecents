'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useSuspenseQuery } from '@apollo/client/react'
import { format } from 'date-fns'
import { useSnackbar } from 'notistack'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useAppContext } from '../context/AppContextProvider'
import { GetImportBatchesDocument, MoveImportBatchDocument, UndoImportBatchDocument } from '@/graphql/operations'
import { useBankAccountLabel } from '@/components/shared/BankAccountLabel'

type PendingAction =
  | { kind: 'undo'; batchId: number; count: number; account: string }
  | { kind: 'move'; batchId: number; count: number; account: string; targetId: number; target: string }

/**
 * Every file import, newest first, so one that went into the wrong account can be moved to the
 * right one (rows that account already has are merged rather than duplicated) or undone.
 */
export default function Imports() {
  const t = useTranslations('common')
  const accountLabel = useBankAccountLabel()
  const { enqueueSnackbar } = useSnackbar()
  const { currentAccountId, bankAccounts } = useAppContext()
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  const { data } = useSuspenseQuery(GetImportBatchesDocument, { variables: { accountId: Number(currentAccountId) } })
  const [undoImportBatch] = useMutation(UndoImportBatchDocument, { refetchQueries: 'active' })
  const [moveImportBatch] = useMutation(MoveImportBatchDocument, { refetchQueries: 'active' })

  const batches = useMemo(
    () =>
      [...(data?.allImportBatches?.nodes ?? [])]
        .flatMap((batch) => (batch ? [batch] : []))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data]
  )

  const labelFor = (bankAccountId: number) => {
    const account = bankAccounts?.find((candidate) => candidate.id === bankAccountId)
    return account ? accountLabel(account) : ''
  }

  async function confirmPending() {
    if (!pending) {
      return
    }
    setIsWorking(true)
    try {
      if (pending.kind === 'undo') {
        await undoImportBatch({ variables: { batchId: pending.batchId } })
        enqueueSnackbar(t('imports.undone', { count: pending.count }), { variant: 'success' })
      } else {
        const response = await moveImportBatch({
          variables: { batchId: pending.batchId, targetBankAccountId: pending.targetId },
        })
        const moved = response.data?.moveImportBatch?.importBatch?.createdCount ?? 0
        enqueueSnackbar(t('imports.moved', { moved, merged: pending.count - moved, account: pending.target }), {
          variant: 'success',
        })
      }
    } catch (error) {
      console.error(error)
      enqueueSnackbar(t('imports.error'), { variant: 'error' })
    } finally {
      setIsWorking(false)
      setPending(null)
    }
  }

  if (!batches.length) {
    return (
      <Typography sx={{ mt: 4 }} color={'text.secondary'}>
        {t('imports.none')}
      </Typography>
    )
  }

  return (
    <>
      <Typography sx={{ mt: 3, mb: 1 }} color={'text.secondary'}>
        {t('imports.description')}
      </Typography>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              {['imports.date', 'imports.file', 'imports.account', 'imports.transactions'].map((key) => (
                <TableCell key={key} align={key === 'imports.transactions' ? 'right' : 'left'}>
                  <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                    {t(key)}
                  </Typography>
                </TableCell>
              ))}
              <TableCell align={'right'}>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('shared.actions')}
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {batches.map((batch) => {
              const count = batch.transactionsByImportBatchId.totalCount
              const account = labelFor(batch.bankAccountId)
              return (
                <TableRow key={batch.nodeId}>
                  <TableCell>{format(new Date(batch.createdAt), 'MMM d, yyyy h:mm a')}</TableCell>
                  <TableCell>{batch.fileName || '—'}</TableCell>
                  <TableCell>{account}</TableCell>
                  <TableCell align={'right'}>{count}</TableCell>
                  <TableCell align={'right'} sx={{ whiteSpace: 'nowrap' }}>
                    <TextField
                      select
                      size={'small'}
                      label={t('imports.moveTo')}
                      value={''}
                      onChange={(e) => {
                        const targetId = Number(e.target.value)
                        setPending({
                          kind: 'move',
                          batchId: batch.id,
                          count,
                          account,
                          targetId,
                          target: labelFor(targetId),
                        })
                      }}
                      sx={{ minWidth: 180, mr: 1 }}
                    >
                      {bankAccounts
                        ?.filter((candidate) => candidate.id !== batch.bankAccountId)
                        .map((candidate) => (
                          <MenuItem key={candidate.id} value={candidate.id}>
                            {accountLabel(candidate)}
                          </MenuItem>
                        ))}
                    </TextField>
                    <Button
                      color={'error'}
                      onClick={() => setPending({ kind: 'undo', batchId: batch.id, count, account })}
                    >
                      {t('imports.undo')}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!pending} onClose={() => !isWorking && setPending(null)}>
        <DialogTitle>{pending?.kind === 'move' ? t('imports.moveTitle') : t('imports.undoTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pending?.kind === 'move'
              ? t('imports.moveConfirm', { count: pending.count, from: pending.account, to: pending.target })
              : pending && t('imports.undoConfirm', { count: pending.count, account: pending.account })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)} disabled={isWorking}>
            {t('shared.cancel')}
          </Button>
          <Button
            variant={'contained'}
            color={pending?.kind === 'undo' ? 'error' : 'primary'}
            onClick={confirmPending}
            disabled={isWorking}
          >
            {pending?.kind === 'move' ? t('imports.move') : t('imports.undo')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
