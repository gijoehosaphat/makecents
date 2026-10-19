'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  FormControlLabel,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useAppContext } from '@/components/context/AppContextProvider'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { useRefreshAccountData } from '@/lib/useRefreshAccountData'
import { useShowClosedBankAccounts } from '@/lib/useShowClosedBankAccounts'
import { GetUserAndAccountsAndBankAccountsByEmailDocument, ReorderBankAccountsDocument } from '@/graphql/operations'
import BankAccountRow from './BankAccountRow'

function move(ids: number[], id: number, toIndex: number) {
  const without = ids.filter((other) => other !== id)
  without.splice(Math.max(0, Math.min(toIndex, without.length)), 0, id)
  return without
}

export default function BankAccounts() {
  const t = useTranslations('common')
  const { bankAccounts, user, currentAccountId } = useAppContext()
  const refreshAccountData = useRefreshAccountData()
  const [showClosed, setShowClosed] = useShowClosedBankAccounts()

  // The order shown while dragging and until the saved order comes back from the server.
  const [order, setOrder] = useState<number[]>(() => bankAccounts.map((bankAccount) => bankAccount.id))
  const [orderSource, setOrderSource] = useState(bankAccounts)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  if (orderSource !== bankAccounts) {
    setOrderSource(bankAccounts)
    setOrder(bankAccounts.map((bankAccount) => bankAccount.id))
  }

  const [reorderBankAccounts] = useMutationWithToast(ReorderBankAccountsDocument, {
    refetchQueries: [
      { query: GetUserAndAccountsAndBankAccountsByEmailDocument, variables: { email: user?.email || '' } },
    ],
  })

  async function saveOrder(ids: number[]) {
    const unchanged = ids.every((id, index) => bankAccounts[index]?.id === id)
    if (unchanged || !currentAccountId) {
      return
    }
    try {
      await reorderBankAccounts({ variables: { accountId: Number(currentAccountId), bankAccountIds: ids } })
    } catch {
      // Reported by the mutation hook; put the rows back where the server has them.
      setOrder(bankAccounts.map((bankAccount) => bankAccount.id))
      return
    }
    refreshAccountData()
  }

  function handleDragOver(overId: number) {
    if (draggingId === null || draggingId === overId) {
      return
    }
    setOrder((ids) => {
      const toIndex = ids.indexOf(overId)
      return ids.indexOf(draggingId) === toIndex ? ids : move(ids, draggingId, toIndex)
    })
  }

  function handleDragEnd() {
    setDraggingId(null)
    saveOrder(order)
  }

  function handleMove(id: number, offset: number) {
    const ids = move(order, id, order.indexOf(id) + offset)
    setOrder(ids)
    saveOrder(ids)
  }

  const rows = order.flatMap((id) => bankAccounts.find((bankAccount) => bankAccount.id === id) ?? [])

  return (
    <>
      <Typography sx={{ mt: 3, mb: 1 }} color={'text.secondary'}>
        {t('bankAccounts.description')}
      </Typography>
      <FormControlLabel
        control={<Switch checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />}
        label={t('bankAccounts.showClosed')}
      />
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding={'checkbox'} />
              <TableCell>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('shared.name')}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('bankAccounts.type')}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('bankAccounts.subtype')}
                </Typography>
              </TableCell>
              <TableCell align={'right'}>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('shared.balance')}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('bankAccounts.status')}
                </Typography>
              </TableCell>
              <TableCell align={'right'}>
                <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
                  {t('shared.actions')}
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((bankAccount, index) => (
              <BankAccountRow
                key={bankAccount.nodeId}
                bankAccount={bankAccount}
                dragging={draggingId === bankAccount.id}
                onDragStart={() => setDraggingId(bankAccount.id)}
                onDragOver={() => handleDragOver(bankAccount.id)}
                onDragEnd={handleDragEnd}
                onMoveUp={index > 0 ? () => handleMove(bankAccount.id, -1) : undefined}
                onMoveDown={index < rows.length - 1 ? () => handleMove(bankAccount.id, 1) : undefined}
              />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography color={'text.secondary'}>{t('bankAccounts.none')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
