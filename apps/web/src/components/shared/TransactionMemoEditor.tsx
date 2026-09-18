import { Edit as IconEdit } from '@mui/icons-material'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
} from '@mui/material'
import { useState } from 'react'
import SaveCancel from '../forms/SaveCancel'
import { Transaction } from '@/graphql/types'
import { UpdateTransactionDocument } from '@/graphql/operations'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import { useTranslations } from 'next-intl'

export function TransactionMemoEditor({
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
  const [memoEditorOpen, setMemoEditorOpen] = useState(false)
  const [name, setName] = useState<string>(
    transaction.customName || transaction.name || '',
  )
  const [memo, setMemo] = useState<string>(
    transaction.customMemo || transaction.memo || '',
  )

  function openMemoEditor() {
    setMemoEditorOpen(true)
  }

  function closeMemoEditor() {
    setMemoEditorOpen(false)
  }

  async function handleSave() {
    await updateTransaction({
      variables: {
        nodeId: transaction.nodeId,
        customMemo: memo,
        customName: name,
      },
    })
    setMemoEditorOpen(false)
  }

  async function handleRevert() {
    await updateTransaction({
      variables: {
        nodeId: transaction.nodeId,
        customMemo: null,
        customName: null,
      },
    })
    setName(transaction.name || '')
    setMemo(transaction.memo || '')
    setMemoEditorOpen(false)
  }

  return (
    <>
      <Box display={'flex'} flexDirection={'row'} alignItems={'center'}>
        <Box>{children}</Box>
        <IconButton
          size={'small'}
          color={'secondary'}
          sx={{ ml: 2, visibility: 'hidden' }}
          className={'transaction-row-hover'}
          onClick={openMemoEditor}
        >
          <IconEdit />
        </IconButton>
      </Box>
      <Dialog open={memoEditorOpen} onClose={closeMemoEditor}>
        <DialogTitle>{t('memoEditor.title')}</DialogTitle>
        <DialogContent>
          <Box sx={{ marginTop: 2 }}>
            <TextField
              label={t('memoEditor.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              sx={{ marginBottom: 4 }}
            />
            <TextField
              label={t('memoEditor.memo')}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRevert}>{t('shared.revert')}</Button>
          <SaveCancel handleSave={handleSave} handleCancel={closeMemoEditor} />
        </DialogActions>
      </Dialog>
    </>
  )
}
