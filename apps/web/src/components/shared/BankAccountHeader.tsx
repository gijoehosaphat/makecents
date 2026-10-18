import { Box, Chip, Divider, IconButton, Tooltip, Typography, useTheme } from '@mui/material'
import { Sync } from '@mui/icons-material'
import { useState } from 'react'
import BankAccountName from './BankAccountName'
import ReconcileBalanceDialog from './ReconcileBalanceDialog'
import { useAppContext } from '../context/AppContextProvider'
import { useParams } from 'next/navigation'
import { formatMoneyCents } from '@/lib/formatMoney'
import { useAmountVisibility } from '../context/AmountVisibilityContext'
import { useTranslations } from 'next-intl'

export function BankAccountHeader() {
  const { bankAccounts } = useAppContext()
  const { hidden } = useAmountVisibility()
  const theme = useTheme()
  const params = useParams()
  const t = useTranslations('common')
  const bankAccountId = Number(Array.isArray(params?.bankAccountId) ? params?.bankAccountId[0] : params?.bankAccountId)
  const [isReconciling, setIsReconciling] = useState(false)

  const bankAccount = bankAccounts.find((bankAccount) => bankAccount.id === bankAccountId)

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
          <BankAccountName bankAccountId={bankAccountId} bankAccount={bankAccount} />
          {bankAccount?.closed && <Chip label={t('dashboard.closed')} size={'small'} sx={{ ml: 2 }} />}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
          <span>
            <Typography variant={'h2'} sx={{ display: 'inline' }}>
              {'Balance: '}
            </Typography>
            <Typography
              variant={'h1'}
              sx={{
                display: 'inline',
                color: bankAccount?.balance > 0 ? theme.palette.money.positive : theme.palette.money.negative,
              }}
            >
              {formatMoneyCents(bankAccount?.balance, bankAccount?.currency || '', hidden)}
            </Typography>
          </span>
          <Tooltip title={t('dashboard.reconcileBalance')}>
            <IconButton size={'small'} color={'secondary'} sx={{ ml: 1 }} onClick={() => setIsReconciling(true)}>
              <Sync />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Divider />
      {isReconciling && (
        <ReconcileBalanceDialog
          bankAccountId={bankAccountId}
          currentBalance={bankAccount?.balance ?? 0}
          onClose={() => setIsReconciling(false)}
        />
      )}
    </>
  )
}
