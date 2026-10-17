'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { DeleteOutline, PersonAdd } from '@mui/icons-material'
import { useAppContext } from '@/components/context/AppContextProvider'
import { PageTitle } from '@/components/shared/PageTitle'
import { Loading } from '@/components/shared/Loading'
import { useAccountMembers } from '@/lib/useAccountMembers'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import { RemoveAccountUserDocument } from '@/graphql/operations'
import AddUserDialog from './AddUserDialog'

type Member = ReturnType<typeof useAccountMembers>['members'][number]

export default function Users() {
  const t = useTranslations('common')
  const { user, currentAccountId } = useAppContext()
  const { members, isPrimary, loading, refetch } = useAccountMembers()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [removeAccountUser, { loading: removeLoading }] = useMutationWithToast(RemoveAccountUserDocument, {
    errorMessage: t('users.removeFailed'),
  })

  async function handleRemove() {
    if (!removing || !currentAccountId) return
    await removeAccountUser({ variables: { accountId: currentAccountId, userId: removing.userId } })
    setRemoving(null)
    refetch()
  }

  const headerCell = (label: string, align: 'left' | 'right' = 'left') => (
    <TableCell align={align}>
      <Typography variant={'h4'} sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
    </TableCell>
  )

  return (
    <Box sx={{ mb: 20 }}>
      <PageTitle icon={'people'} title={t('users.title')} />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, mb: 1, gap: 2 }}>
        <Typography color={'text.secondary'}>{t('users.description')}</Typography>
        {isPrimary && (
          <Button variant={'contained'} startIcon={<PersonAdd />} onClick={() => setAdding(true)}>
            {t('users.add')}
          </Button>
        )}
      </Box>
      {!loading && !isPrimary && (
        <Alert severity={'info'} sx={{ my: 2 }}>
          {t('users.primaryOnly')}
        </Alert>
      )}
      {loading ? (
        <Loading />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {headerCell(t('shared.name'))}
                {headerCell(t('auth.email'))}
                {headerCell(t('users.role'))}
                {isPrimary && headerCell(t('shared.actions'), 'right')}
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((member) => {
                const memberUser = member.userByUserId
                const isOwner = member.role === 'owner'
                return (
                  <TableRow key={member.nodeId}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ width: 32, height: 32 }} alt={memberUser?.name || memberUser?.email || ''}>
                          {(memberUser?.name || memberUser?.email || '?').charAt(0).toUpperCase()}
                        </Avatar>
                        <Typography>
                          {memberUser?.name || '—'}
                          {member.userId === user?.id && (
                            <Typography component={'span'} color={'text.secondary'}>
                              {' '}
                              ({t('users.you')})
                            </Typography>
                          )}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{memberUser?.email}</TableCell>
                    <TableCell>
                      {isOwner ? (
                        <Chip size={'small'} color={'primary'} label={t('users.primary')} />
                      ) : (
                        <Chip size={'small'} variant={'outlined'} label={t('users.member')} />
                      )}
                    </TableCell>
                    {isPrimary && (
                      <TableCell align={'right'}>
                        {!isOwner && (
                          <Tooltip title={t('users.remove')}>
                            <IconButton aria-label={t('users.remove')} onClick={() => setRemoving(member)}>
                              <DeleteOutline />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {adding && currentAccountId && (
        <AddUserDialog accountId={currentAccountId} onAdded={() => refetch()} onClose={() => setAdding(false)} />
      )}
      <Dialog open={!!removing} onClose={() => setRemoving(null)} maxWidth={'xs'} fullWidth>
        <DialogTitle>{t('users.remove')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('users.removeConfirm', { name: removing?.userByUserId?.name || removing?.userByUserId?.email || '' })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoving(null)}>{t('shared.cancel')}</Button>
          <Button color={'error'} variant={'contained'} onClick={handleRemove} disabled={removeLoading}>
            {t('users.remove')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
