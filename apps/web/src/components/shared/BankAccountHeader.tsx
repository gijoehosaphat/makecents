import { Box, Divider, Typography, useTheme } from '@mui/material'
import BankAccountName from './BankAccountName'
import { useAppContext } from '../context/AppContextProvider'
import { useParams } from 'next/navigation'
import { formatMoneyCents } from '@/lib/formatMoney'

export function BankAccountHeader() {
  const { bankAccounts } = useAppContext()
  const theme = useTheme()
  const params = useParams()
  const bankAccountId = Number(Array.isArray(params?.bankAccountId) ? params?.bankAccountId[0] : params?.bankAccountId)

  const bankAccount = bankAccounts.find((bankAccount) => bankAccount.id === bankAccountId)

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <BankAccountName bankAccountId={bankAccountId} bankAccount={bankAccount} />
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
            {formatMoneyCents(bankAccount?.balance, bankAccount?.currency || '')}
          </Typography>
        </span>
      </Box>
      <Divider />
    </>
  )
}
