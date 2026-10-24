'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSuspenseQuery } from '@apollo/client/react'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { format } from 'date-fns'
import { useSnackbar } from 'notistack'
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { useAppContext } from '../context/AppContextProvider'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { GetDeletedTransactionsDocument, RestoreTransactionDocument } from '@/graphql/operations'
import { useBankAccountLabel } from '@/components/shared/BankAccountLabel'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { formatMoney } from '@/lib/formatMoney'

const HEADINGS = [
  'deletedTransactions.deletedAt',
  'deletedTransactions.transaction',
  'deletedTransactions.account',
  'shared.amount',
  'deletedTransactions.reason',
  'deletedTransactions.deletedBy',
] as const

type Pending = { id: number; name: string }

/**
 * Every deleted transaction, newest deletion first, with why and by whom. Imports skip them;
 * restoring one puts it back as it was and lets imports add it again.
 */
export default function DeletedTransactions() {
  const t = useTranslations('common')
  const accountLabel = useBankAccountLabel()
  const { hidden } = useAmountVisibility()
  const { enqueueSnackbar } = useSnackbar()
  const { currentAccountId, bankAccounts } = useAppContext()
  const [pending, setPending] = useState<Pending | null>(null)

  const { data } = useSuspenseQuery(GetDeletedTransactionsDocument, {
    variables: { accountId: Number(currentAccountId) },
  })
  const [restoreTransaction] = useMutationWithToast(RestoreTransactionDocument, {
    refetchQueries: 'active',
    errorMessage: t('deletedTransactions.restoreError'),
    showServerMessage: true,
  })

  const deletions = useMemo(
    () =>
      [...(data?.allDeletedTransactions?.nodes ?? [])]
        .flatMap((deleted) => (deleted ? [deleted] : []))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [data],
  )

  const labelFor = (bankAccountId: number) => {
    const account = bankAccounts?.find((candidate) => candidate.id === bankAccountId)
    return account ? accountLabel(account) : ''
  }

  async function confirmRestore() {
    if (!pending) {
      return
    }
    const { id, name } = pending
    setPending(null)
    try {
      await restoreTransaction({ variables: { deletedTransactionId: id } })
      enqueueSnackbar(t('deletedTransactions.restoredNamed', { name }), { variant: 'success' })
    } catch {
      // Reported by the mutation hook.
    }
  }

  if (!deletions.length) {
    return (
      <Typography sx={{ mt: 4 }} color={'text.secondary'}>
        {t('deletedTransactions.none')}
      </Typography>
    )
  }

  return (
    <>
      <Typography sx={{ mt: 3, mb: 1 }} color={'text.secondary'}>
        {t('deletedTransactions.description')}
      </Typography>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              {HEADINGS.map((key) => (
                <TableCell key={key} align={key === 'shared.amount' ? 'right' : 'left'}>
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
            {deletions.map((deleted) => {
              const duplicateOf = deleted.transactionByDuplicateOfId
              const user = deleted.userByUserId
              return (
                <TableRow key={deleted.nodeId}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {format(new Date(deleted.createdAt), 'MMM d, yyyy h:mm a')}
                  </TableCell>
                  <TableCell>
                    <Typography variant={'body2'}>{deleted.name}</Typography>
                    <Typography variant={'caption'} color={'text.secondary'}>
                      {deleted.posted && format(new Date(deleted.posted), 'MMM d, yyyy')}
                      {deleted.memo && ` · ${deleted.memo}`}
                    </Typography>
                  </TableCell>
                  <TableCell>{labelFor(deleted.bankAccountId)}</TableCell>
                  <TableCell align={'right'}>{formatMoney(Number(deleted.amount ?? 0) / 100, 'CAD', hidden)}</TableCell>
                  <TableCell>
                    <Typography variant={'body2'}>{t(`deletedTransactions.reasons.${deleted.reason}`)}</Typography>
                    {duplicateOf && (
                      <Typography variant={'caption'} color={'text.secondary'} component={'div'}>
                        {t('deletedTransactions.duplicateOf', {
                          name: duplicateOf.customName || duplicateOf.name || '',
                          date: format(new Date(duplicateOf.posted), 'MMM d, yyyy'),
                        })}
                      </Typography>
                    )}
                    {deleted.note && (
                      <Typography variant={'caption'} color={'text.secondary'} component={'div'}>
                        {deleted.note}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{user ? user.name || user.email : '—'}</TableCell>
                  <TableCell align={'right'}>
                    <Button onClick={() => setPending({ id: deleted.id, name: deleted.name || '' })}>
                      {t('deletedTransactions.restore')}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <ConfirmDialog
        open={!!pending}
        title={t('deletedTransactions.restoreTitle')}
        message={t('deletedTransactions.restoreConfirm', { name: pending?.name ?? '' })}
        confirmLabel={t('deletedTransactions.restore')}
        onConfirm={confirmRestore}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
