'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Autocomplete,
  Box,
  Chip,
  IconButton,
  ListSubheader,
  MenuItem,
  Select,
  TableCell,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { DragIndicator, Edit, Lock, LockOpen, Sync } from '@mui/icons-material'
import { BankAccount } from '@/graphql/types'
import { useAppContext } from '@/components/context/AppContextProvider'
import { useAmountVisibility } from '@/components/context/AmountVisibilityContext'
import { useBankAccountLabel } from '@/components/shared/BankAccountLabel'
import { BankAccountTypeIcon } from '@/components/shared/BankAccountTypeIcon'
import ReconcileBalanceDialog from '@/components/shared/ReconcileBalanceDialog'
import SaveCancel from '@/components/forms/SaveCancel'
import {
  ACCOUNT_TYPE_KIND,
  ACCOUNT_TYPES,
  AccountKind,
  SUBTYPE_SUGGESTIONS,
  isAccountType,
} from '@/lib/bankAccountTypes'
import { formatMoneyCents } from '@/lib/formatMoney'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { useRefreshAccountData } from '@/lib/useRefreshAccountData'
import {
  GetUserAndAccountsAndBankAccountsByEmailDocument,
  UpdateBankAccountClosedDocument,
  UpdateBankAccountNameDocument,
  UpdateBankAccountSubtypeDocument,
  UpdateBankAccountTypeDocument,
} from '@/graphql/operations'

export default function BankAccountRow({
  bankAccount,
  dragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMoveUp,
  onMoveDown,
}: {
  bankAccount: BankAccount
  dragging: boolean
  onDragStart: () => void
  onDragOver: () => void
  onDragEnd: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const t = useTranslations('common')
  const { user, currentAccountId, bankAccounts } = useAppContext()
  const { hidden } = useAmountVisibility()
  const accountLabel = useBankAccountLabel()
  const refreshAccountData = useRefreshAccountData()
  const [isEditting, setIsEditting] = useState(false)
  const [name, setName] = useState('')
  const [isReconciling, setIsReconciling] = useState(false)

  const mutationOptions = {
    refetchQueries: [
      { query: GetUserAndAccountsAndBankAccountsByEmailDocument, variables: { email: user?.email || '' } },
    ],
  }
  const [updateName] = useMutationWithToast(UpdateBankAccountNameDocument, mutationOptions)
  const [updateType] = useMutationWithToast(UpdateBankAccountTypeDocument, mutationOptions)
  const [updateSubtype] = useMutationWithToast(UpdateBankAccountSubtypeDocument, mutationOptions)
  const [updateClosed] = useMutationWithToast(UpdateBankAccountClosedDocument, mutationOptions)

  const ids = { id: bankAccount.id, accountId: Number(currentAccountId) }
  const accountType = isAccountType(bankAccount.type) ? bankAccount.type : 'OTHER'
  // The usual names for this type, then any others already used on accounts of the same type.
  const subtypeOptions = [
    ...new Set([
      ...SUBTYPE_SUGGESTIONS[accountType],
      ...bankAccounts.flatMap((other) => (other.type === accountType && other.subtype ? [other.subtype] : [])),
    ]),
  ]

  async function save(mutation: () => Promise<unknown>) {
    try {
      await mutation()
    } catch {
      // Reported by the mutation hook.
      return
    }
    refreshAccountData()
  }

  function handleEdit() {
    setName(bankAccount.name || '')
    setIsEditting(true)
  }

  async function handleSaveName() {
    setIsEditting(false)
    if (name.trim() && name !== bankAccount.name) {
      await save(() => updateName({ variables: { ...ids, name: name.trim() } }))
    }
  }

  function handleSubtypeChange(value: string | null) {
    const subtype = value?.trim() || null
    if (subtype !== (bankAccount.subtype ?? null)) {
      save(() => updateSubtype({ variables: { ...ids, subtype } }))
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowUp' && onMoveUp) {
      event.preventDefault()
      onMoveUp()
    } else if (event.key === 'ArrowDown' && onMoveDown) {
      event.preventDefault()
      onMoveDown()
    }
  }

  return (
    <>
      <TableRow
        hover={true}
        draggable={!isEditting}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          // Firefox only starts a drag when it carries data.
          event.dataTransfer.setData('text/plain', String(bankAccount.id))
          onDragStart()
        }}
        onDragOver={(event) => {
          event.preventDefault()
          onDragOver()
        }}
        onDrop={(event) => event.preventDefault()}
        onDragEnd={onDragEnd}
        sx={{ opacity: dragging ? 0.4 : bankAccount.closed ? 0.6 : 1 }}
      >
        <TableCell padding={'checkbox'}>
          <Tooltip title={t('bankAccounts.reorder')}>
            <IconButton
              size={'small'}
              sx={{ cursor: 'grab' }}
              onKeyDown={handleKeyDown}
              aria-label={t('bankAccounts.reorder')}
            >
              <DragIndicator />
            </IconButton>
          </Tooltip>
        </TableCell>
        <TableCell size={'small'}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <BankAccountTypeIcon accountType={bankAccount.type} color={'secondary'} />
            {isEditting ? (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <TextField
                  size={'small'}
                  value={name}
                  placeholder={accountLabel(bankAccount)}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSaveName()
                    if (event.key === 'Escape') setIsEditting(false)
                  }}
                  autoFocus
                />
                <SaveCancel handleSave={handleSaveName} handleCancel={() => setIsEditting(false)} />
              </Box>
            ) : (
              <Typography variant={'body2'}>{accountLabel(bankAccount)}</Typography>
            )}
          </Box>
        </TableCell>
        <TableCell size={'small'}>
          <Select
            size={'small'}
            value={accountType}
            onChange={(event) => save(() => updateType({ variables: { ...ids, type: event.target.value } }))}
            aria-label={t('bankAccounts.type')}
            renderValue={(type) => t(`bankAccounts.types.${type}`)}
            sx={{ minWidth: 160 }}
          >
            {(['asset', 'debt'] as AccountKind[]).flatMap((kind) => [
              <ListSubheader key={kind}>
                {t(kind === 'asset' ? 'bankAccounts.assets' : 'bankAccounts.debts')}
              </ListSubheader>,
              ...ACCOUNT_TYPES.filter((type) => ACCOUNT_TYPE_KIND[type] === kind).map((type) => (
                <MenuItem key={type} value={type}>
                  <BankAccountTypeIcon accountType={type} fontSize={'small'} color={'secondary'} sx={{ mr: 1 }} />
                  {t(`bankAccounts.types.${type}`)}
                </MenuItem>
              )),
            ])}
          </Select>
        </TableCell>
        <TableCell size={'small'}>
          <Autocomplete
            freeSolo
            autoSelect
            size={'small'}
            options={subtypeOptions}
            value={bankAccount.subtype ?? null}
            onChange={(_event, value) => handleSubtypeChange(value)}
            sx={{ minWidth: 180 }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={t('bankAccounts.subtypePlaceholder')}
                slotProps={{ htmlInput: { ...params.inputProps, 'aria-label': t('bankAccounts.subtype') } }}
              />
            )}
          />
        </TableCell>
        <TableCell size={'small'} align={'right'}>
          <Typography variant={'body2'}>
            {formatMoneyCents(bankAccount.balance, bankAccount.currency || 'CAD', hidden)}
          </Typography>
        </TableCell>
        <TableCell size={'small'}>
          <Chip
            size={'small'}
            label={bankAccount.closed ? t('dashboard.closed') : t('bankAccounts.open')}
            color={bankAccount.closed ? 'default' : 'success'}
            variant={'outlined'}
          />
        </TableCell>
        <TableCell size={'small'} align={'right'} sx={{ whiteSpace: 'nowrap' }}>
          <Tooltip title={t('bankAccounts.rename')}>
            <IconButton size={'small'} color={'secondary'} onClick={handleEdit} aria-label={t('bankAccounts.rename')}>
              <Edit />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('dashboard.reconcileBalance')}>
            <IconButton
              size={'small'}
              color={'secondary'}
              onClick={() => setIsReconciling(true)}
              aria-label={t('dashboard.reconcileBalance')}
            >
              <Sync />
            </IconButton>
          </Tooltip>
          <Tooltip title={bankAccount.closed ? t('bankAccounts.reopenAccount') : t('bankAccounts.closeAccount')}>
            <IconButton
              size={'small'}
              color={'secondary'}
              onClick={() => save(() => updateClosed({ variables: { ...ids, closed: !bankAccount.closed } }))}
              aria-label={bankAccount.closed ? t('bankAccounts.reopenAccount') : t('bankAccounts.closeAccount')}
            >
              {bankAccount.closed ? <LockOpen /> : <Lock />}
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
      {isReconciling && (
        <ReconcileBalanceDialog
          bankAccountId={bankAccount.id}
          currentBalance={bankAccount.balance ?? 0}
          onClose={() => setIsReconciling(false)}
        />
      )}
    </>
  )
}
