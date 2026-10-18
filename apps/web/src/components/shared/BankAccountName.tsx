'use client'

import { useAppContext } from '@/components/context/AppContextProvider'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { useRefreshAccountData } from '@/lib/useRefreshAccountData'
import { Edit } from '@mui/icons-material'
import { Box, IconButton, TextField, Typography } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { useHover } from 'usehooks-ts'
import SaveCancel from '@/components/forms/SaveCancel'
import { BankAccount } from '@/graphql/types'
import { useBankAccountLabel } from '@/components/shared/BankAccountLabel'
import { BankAccountTypeIcon } from '@/components/shared/BankAccountTypeIcon'
import { GetUserAndAccountsAndBankAccountsByEmailDocument, UpdateBankAccountNameDocument } from '@/graphql/operations'

export default function BankAccountName({
  bankAccountId,
  bankAccount,
}: {
  bankAccountId: number
  bankAccount: BankAccount | undefined
}) {
  const { user, currentAccountId } = useAppContext()
  const [updateBankAccountName] = useMutationWithToast(UpdateBankAccountNameDocument, {
    refetchQueries: [
      {
        query: GetUserAndAccountsAndBankAccountsByEmailDocument,
        variables: {
          email: user?.email || '',
        },
      },
    ],
  })
  const t = useTranslations('common')
  const accountLabel = useBankAccountLabel()
  const refreshAccountData = useRefreshAccountData()

  const hoverRef = useRef<HTMLElement | null>(null)
  const isHover = useHover(hoverRef as React.RefObject<HTMLElement>)

  const [isEditting, setIsEditting] = useState(false)
  const [accountName, setAccountName] = useState(bankAccount?.name || bankAccount?.type)

  function toggleEditting() {
    setIsEditting(!isEditting)
  }

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    setAccountName(event.currentTarget.value)
  }

  async function handleSaveName() {
    await updateBankAccountName({
      variables: {
        name: String(accountName),
        id: bankAccountId,
        accountId: Number(currentAccountId),
      },
    })
    setIsEditting(false)
    refreshAccountData()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
      {/* <Typography variant={'h3'} sx={{ mr: 2 }}>
        {t('dashboard.accountName')}:
      </Typography> */}
      <Box sx={{ mr: 4, position: 'relative', top: 3 }}>
        {bankAccount && <BankAccountTypeIcon accountType={bankAccount.type} fontSize={'large'} color={'secondary'} />}
      </Box>
      {isEditting && (
        <>
          <TextField size={'small'} defaultValue={bankAccount?.name || bankAccount?.type} onChange={handleNameChange} />
          <SaveCancel handleSave={handleSaveName} handleCancel={toggleEditting} />
        </>
      )}
      <Box
        ref={hoverRef}
        sx={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          visibility: isEditting ? 'hidden' : 'visible',
        }}
      >
        <Typography variant={'h1'}>{accountLabel(bankAccount) || bankAccount?.type}</Typography>
        {isHover && (
          <IconButton size={'small'} color={'secondary'} sx={{ ml: 2 }} onClick={toggleEditting}>
            <Edit />
          </IconButton>
        )}
      </Box>
    </Box>
  )
}
