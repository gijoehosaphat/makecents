'use client'

import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { useMutation } from '@apollo/client/react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useAppContext } from '@/components/context/AppContextProvider'
import CurrencyTextField from './CurrencyTextField'
import {
  GetUserAndAccountsAndBankAccountsByEmailDocument,
  UpsertBankAccountReconciliationDocument,
} from '@/graphql/operations'

export default function ReconcileBalanceDialog({
  bankAccountId,
  currentBalance,
  onClose,
}: {
  bankAccountId: number
  currentBalance: number
  onClose: () => void
}) {
  const t = useTranslations('common')
  const router = useRouter()
  const { user } = useAppContext()
  const [balance, setBalance] = useState(currentBalance / 100)
  const [asOf, setAsOf] = useState(new Date())

  const [upsertBankAccountReconciliation, { loading }] = useMutation(UpsertBankAccountReconciliationDocument, {
    refetchQueries: [
      {
        query: GetUserAndAccountsAndBankAccountsByEmailDocument,
        variables: {
          email: user?.email || '',
        },
      },
    ],
  })

  async function handleSave() {
    await upsertBankAccountReconciliation({
      variables: {
        bankAccountId,
        balance: Math.round(balance * 100),
        asOf,
      },
    })
    //TODO: This is lame
    router.refresh()
    onClose()
  }

  return (
    <Dialog open onClose={onClose} maxWidth={'xs'} fullWidth>
      <DialogTitle>{t('dashboard.reconcileBalance')}</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 3 }} color={'text.secondary'}>
          {t('dashboard.reconcileBalanceDescription')}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <CurrencyTextField
            label={t('shared.balance')}
            value={balance}
            onValueChange={setBalance}
            fullWidth
            autoFocus
          />
          <DatePicker label={t('dashboard.asOfDate')} value={asOf} onChange={(value) => value && setAsOf(value)} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('shared.cancel')}</Button>
        <Button variant={'contained'} onClick={handleSave} disabled={loading}>
          {t('shared.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
