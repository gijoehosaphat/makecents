import { Transaction } from '@/graphql/types'
import { DeleteOutline, EditOutlined, MoreVert } from '@mui/icons-material'
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { DeleteTransactionDialog } from './DeleteTransactionDialog'
import { EditHandOff, EditTransactionDialog } from './EditTransactionDialog'
import { TransactionSplitDialog } from './TransactionSplit'
import { LinkTransferDialog, UnlinkTransferDialog } from './TransactionLink'

type Action = 'edit' | 'delete' | EditHandOff

/**
 * The "more" menu at the end of a transaction row, for actions that don't need their own button.
 * Each action opens its own dialog; add new ones as another menu item and dialog.
 */
export function TransactionActionsMenu({
  transaction,
  refetchQuery,
}: {
  transaction: Transaction
  refetchQuery: InternalRefetchQueryDescriptor
}) {
  const t = useTranslations('common')
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [action, setAction] = useState<Action | null>(null)

  function choose(next: Action) {
    setAnchor(null)
    setAction(next)
  }

  return (
    <>
      <IconButton
        size={'small'}
        aria-label={t('transactions.moreActions')}
        aria-haspopup={'menu'}
        onClick={(event) => setAnchor(event.currentTarget)}
        className={'transaction-row-hover'}
        // Hover reveals it, like the row's other controls; touch screens can't hover, so it always shows there.
        sx={{ visibility: anchor ? 'visible' : 'hidden', '@media (hover: none)': { visibility: 'visible' } }}
      >
        <MoreVert fontSize={'small'} />
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <MenuItem onClick={() => choose('edit')}>
          <ListItemIcon>
            <EditOutlined fontSize={'small'} />
          </ListItemIcon>
          <ListItemText>{t('transactions.edit')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => choose('delete')}>
          <ListItemIcon>
            <DeleteOutline fontSize={'small'} color={'error'} />
          </ListItemIcon>
          <ListItemText>{t('transactions.delete')}</ListItemText>
        </MenuItem>
      </Menu>
      {action === 'edit' && (
        <EditTransactionDialog
          transaction={transaction}
          refetchQuery={refetchQuery}
          onClose={() => setAction(null)}
          onHandOff={setAction}
        />
      )}
      {action === 'delete' && <DeleteTransactionDialog transaction={transaction} onClose={() => setAction(null)} />}
      {action === 'split' && (
        <TransactionSplitDialog transaction={transaction} refetchQuery={refetchQuery} onClose={() => setAction(null)} />
      )}
      {action === 'link' && (
        <LinkTransferDialog transaction={transaction} refetchQuery={refetchQuery} onClose={() => setAction(null)} />
      )}
      {action === 'unlink' && (
        <UnlinkTransferDialog transaction={transaction} refetchQuery={refetchQuery} onClose={() => setAction(null)} />
      )}
    </>
  )
}
