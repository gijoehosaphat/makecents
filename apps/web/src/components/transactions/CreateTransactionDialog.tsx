import { CreateTransactionDocument } from '@/graphql/operations'
import { toCents } from '@/lib/formatMoney'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { Add } from '@mui/icons-material'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormLabel,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers'
import { isValid } from 'date-fns'
import { useTranslations } from 'next-intl'
import { FormEvent, useState } from 'react'
import { useAppContext } from '../context/AppContextProvider'
import { useBankAccountLabel } from '../shared/BankAccountLabel'
import CurrencyTextField from '../shared/CurrencyTextField'
import SplitCategoryPicker from './SplitCategoryPicker'

/** Marks rows entered by hand, as opposed to the bank's OFX types or a CSV import. */
const MANUAL_TYPE = 'MANUAL'

const FORM_ID = 'create-transaction-form'

type Direction = 'withdrawal' | 'deposit'

/**
 * A quiet "Add transaction" link for the foot of a transaction table, opening the create dialog. Hidden when
 * there's no open bank account to add to, including on a closed account's own page.
 */
export function CreateTransactionButton({
  refetchQuery,
  bankAccountId,
}: {
  refetchQuery: InternalRefetchQueryDescriptor
  /** The account to start with, such as the one whose page this is. */
  bankAccountId?: number
}) {
  const t = useTranslations('common')
  const { bankAccounts } = useAppContext()
  const [open, setOpen] = useState(false)

  const openAccounts = bankAccounts.filter((account) => !account.closed)
  const isPageAccountClosed =
    bankAccountId !== undefined && !openAccounts.some((account) => account.id === bankAccountId)
  if (openAccounts.length === 0 || isPageAccountClosed) return null

  return (
    <>
      <Button
        size={'small'}
        color={'inherit'}
        startIcon={<Add fontSize={'small'} />}
        onClick={() => setOpen(true)}
        sx={{ color: 'text.secondary' }}
      >
        {t('createTransaction.open')}
      </Button>
      {open && (
        <CreateTransactionDialog
          refetchQuery={refetchQuery}
          bankAccountId={bankAccountId ?? openAccounts[0].id}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/** Adds a transaction by hand, for one the bank won't send (cash, or a missed import). */
export function CreateTransactionDialog({
  refetchQuery,
  bankAccountId: initialBankAccountId,
  onClose,
}: {
  refetchQuery: InternalRefetchQueryDescriptor
  bankAccountId: number
  onClose: () => void
}) {
  const t = useTranslations('common')
  const { bankAccounts } = useAppContext()
  const accountLabel = useBankAccountLabel()
  const [createTransaction] = useMutationWithToast(CreateTransactionDocument, {
    refetchQueries: [refetchQuery],
  })

  const [bankAccountId, setBankAccountId] = useState(initialBankAccountId)
  const [posted, setPosted] = useState<Date | null>(() => new Date())
  const [direction, setDirection] = useState<Direction>('withdrawal')
  const [cents, setCents] = useState(0)
  const [name, setName] = useState('')
  const [memo, setMemo] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const openAccounts = bankAccounts.filter((account) => !account.closed)
  const isDateValid = !!posted && isValid(posted)
  const canSave = isDateValid && cents > 0 && name.trim() !== '' && !isSaving

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave || !posted) return
    const amount = direction === 'withdrawal' ? -cents : cents
    setIsSaving(true)
    try {
      await createTransaction({
        variables: {
          bankAccountId,
          posted: posted.toISOString(),
          originalPosted: posted.toISOString(),
          amount,
          originalAmount: amount,
          name: name.trim(),
          memo: memo.trim() || null,
          categoryId,
          type: MANUAL_TYPE,
          // Unique per bank account, so it never collides with (or gets skipped as) an imported row.
          bankTransactionId: `manual-${crypto.randomUUID()}`,
        },
      })
      onClose()
    } catch {
      // Reported by the mutation hook.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onClose={() => !isSaving && onClose()} fullWidth maxWidth={'sm'}>
      <DialogTitle>{t('createTransaction.title')}</DialogTitle>
      <DialogContent>
        <Box
          component={'form'}
          id={FORM_ID}
          onSubmit={handleSubmit}
          sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}
        >
          <TextField
            select
            label={t('createTransaction.bankAccount')}
            value={bankAccountId}
            onChange={(event) => setBankAccountId(Number(event.target.value))}
            size={'small'}
            fullWidth
          >
            {openAccounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>
                {accountLabel(account)}
              </MenuItem>
            ))}
          </TextField>
          <DateTimePicker
            label={t('createTransaction.date')}
            value={posted}
            onChange={setPosted}
            slotProps={{ textField: { fullWidth: true, size: 'small' } }}
          />
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <ToggleButtonGroup
              value={direction}
              exclusive
              size={'small'}
              onChange={(_, next: Direction | null) => next && setDirection(next)}
              aria-label={t('createTransaction.direction')}
            >
              <ToggleButton value={'withdrawal'}>{t('createTransaction.withdrawal')}</ToggleButton>
              <ToggleButton value={'deposit'}>{t('createTransaction.deposit')}</ToggleButton>
            </ToggleButtonGroup>
            <CurrencyTextField
              label={t('createTransaction.amount')}
              size={'small'}
              fullWidth
              onFocus={(event) => event.target.select()}
              onValueChange={(value) => setCents(Math.abs(toCents(value)))}
              options={{ minimumValue: '0' }}
            />
          </Box>
          <TextField
            label={t('createTransaction.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            size={'small'}
            fullWidth
            required
          />
          <TextField
            label={t('createTransaction.memo')}
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            size={'small'}
            fullWidth
          />
          <Box>
            <FormLabel component={'div'} sx={{ mb: 1 }}>
              {t('createTransaction.category')}
            </FormLabel>
            <SplitCategoryPicker categoryId={categoryId} onChange={setCategoryId} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          {t('shared.cancel')}
        </Button>
        <Button type={'submit'} form={FORM_ID} variant={'contained'} disabled={!canSave}>
          {t('createTransaction.create')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
