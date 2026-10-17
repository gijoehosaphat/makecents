import React from 'react'
import { signOut, useSession } from 'next-auth/react'
import { Avatar, Box, Tooltip, IconButton, Menu, MenuItem, Typography } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import ChangePasswordDialog from '@/components/accounts/ChangePasswordDialog'
import { useAppContext } from '@/components/context/AppContextProvider'
import { useAccountMembers } from '@/lib/useAccountMembers'

export function ProfileMenu() {
  const t = useTranslations('common')
  const [anchorElUser, setAnchorElUser] = React.useState<null | HTMLElement>(null)
  const [changingPassword, setChangingPassword] = React.useState(false)
  const { data: session, status } = useSession()
  const router = useRouter()
  const { currentAccountId } = useAppContext()
  const { isPrimary } = useAccountMembers()

  const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorElUser(event.currentTarget)
  }

  const handleCloseUserMenu = () => {
    setAnchorElUser(null)
  }

  if (status === 'authenticated') {
    return (
      <Box sx={{ flexGrow: 0, mr: 2 }}>
        <Tooltip title="Open settings">
          <IconButton onClick={handleOpenUserMenu} sx={{ p: 0 }}>
            <Avatar alt={session?.user?.name || ''} src={session?.user?.image || ''} />
          </IconButton>
        </Tooltip>
        <Menu
          sx={{ mt: '45px' }}
          id="menu-appbar"
          anchorEl={anchorElUser}
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          keepMounted
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          open={Boolean(anchorElUser)}
          onClose={handleCloseUserMenu}
        >
          {isPrimary && (
            <MenuItem
              key={'manageUsers'}
              onClick={() => {
                handleCloseUserMenu()
                router.push(`/${currentAccountId}/dashboard/users`)
              }}
            >
              <Typography textAlign="center">{t('users.manage')}</Typography>
            </MenuItem>
          )}
          <MenuItem
            key={'changePassword'}
            onClick={() => {
              handleCloseUserMenu()
              setChangingPassword(true)
            }}
          >
            <Typography textAlign="center">{t('auth.changePassword')}</Typography>
          </MenuItem>
          <MenuItem
            key={'signOut'}
            onClick={(e) => {
              e.preventDefault()
              signOut()
            }}
          >
            <Typography textAlign="center">{t('auth.signout')}</Typography>
          </MenuItem>
        </Menu>
        {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
      </Box>
    )
  } else {
    return null
  }
}
