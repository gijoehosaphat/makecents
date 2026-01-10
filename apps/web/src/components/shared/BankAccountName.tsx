'use client'

import { useAppContext } from '@/components/context/AppContextProvider'
import { useMutation } from '@apollo/client/react'
import { CreditCard, Edit, Savings, Wallet } from '@mui/icons-material'
import { Box, IconButton, TextField, Typography } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { useHover } from 'usehooks-ts'
import SaveCancel from '@/components/forms/SaveCancel'
import { BankAccount } from '@/graphql/types'
import { GetUserAndAccountsAndBankAccountsByEmailDocument, UpdateBankAccountNameDocument } from '@/graphql/operations'

export default function BankAccountName({
  bankAccountId,
  bankAccount,
}: {
  bankAccountId: number
  bankAccount: BankAccount | undefined
}) {
  const { user } = useAppContext()
  const [updateBankAccountName] = useMutation(UpdateBankAccountNameDocument, {
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
  const router = useRouter()

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
    updateBankAccountName({
      variables: {
        name: String(accountName),
        id: bankAccountId,
        userId: Number(user?.id),
      },
    })
    setIsEditting(false)
    //TODO: This is lame
    router.refresh()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
      {/* <Typography variant={'h3'} sx={{ mr: 2 }}>
        {t('dashboard.accountName')}:
      </Typography> */}
      <Box sx={{ mr: 4, position: 'relative', top: 3 }}>
        {bankAccount?.type === 'CHECKING' && <Wallet fontSize={'large'} color={'secondary'} />}
        {bankAccount?.type === 'SAVINGS' && <Savings fontSize={'large'} color={'secondary'} />}
        {bankAccount?.type === 'CREDIT_CARD' && <CreditCard fontSize={'large'} color={'secondary'} />}
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
        <Typography variant={'h1'}>{bankAccount?.name || bankAccount?.type}</Typography>
        {isHover && (
          <IconButton size={'small'} color={'secondary'} sx={{ ml: 2 }} onClick={toggleEditting}>
            <Edit />
          </IconButton>
        )}
      </Box>
    </Box>
  )
}
