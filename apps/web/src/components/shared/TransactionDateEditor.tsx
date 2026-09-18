import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material'
import { useState } from 'react'
import SaveCancel from '../forms/SaveCancel'
import { DateTimePicker } from '@mui/x-date-pickers'
import { Transaction } from '@/graphql/types'
import { UpdateTransactionDocument } from '@/graphql/operations'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import { useTranslations } from 'next-intl'

export function TransactionDateEditor({
  children,
  transaction,
  refetchQuery,
}: {
  children: React.ReactNode
  transaction: Transaction
  refetchQuery: InternalRefetchQueryDescriptor
}) {
  const [updateTransaction] = useMutation(UpdateTransactionDocument, {
    refetchQueries: [refetchQuery],
  })
  const t = useTranslations('common')
  const [dateEditorOpen, setDateEditorOpen] = useState(false)
  const [date, setDate] = useState<Date>(new Date(transaction.posted))

  function openDateEditor() {
    setDateEditorOpen(true)
  }

  function closeDateEditor() {
    setDateEditorOpen(false)
  }

  async function handleSave() {
    await updateTransaction({
      variables: {
        nodeId: transaction.nodeId,
        posted: date,
      },
    })
    setDateEditorOpen(false)
  }

  function handleDateChange(value: Date | null) {
    if (value) {
      setDate(value)
    }
  }

  return (
    <>
      <IconButton size={'small'} onClick={openDateEditor}>
        {children}
      </IconButton>
      <Dialog open={dateEditorOpen} onClose={closeDateEditor}>
        <DialogTitle>{t('dateEditor.title')}</DialogTitle>
        <DialogContent>
          <DateTimePicker value={new Date(date)} onChange={handleDateChange} />
        </DialogContent>
        <DialogActions>
          <SaveCancel handleSave={handleSave} handleCancel={closeDateEditor} />
        </DialogActions>
      </Dialog>
    </>
  )
}
