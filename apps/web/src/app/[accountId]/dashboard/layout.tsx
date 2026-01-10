'use client'

import * as React from 'react'
import { useTheme, Theme, CSSObject } from '@mui/material/styles'
import { AppBar, Box, Drawer, Toolbar, List, Typography, Divider, IconButton, CssBaseline } from '@mui/material'
import { AppBarProps as MuiAppBarProps } from '@mui/material/AppBar'
import { DrawerProps as MuiDrawerProps } from '@mui/material/Drawer'
import { Menu as MenuIcon, Settings, ChevronLeft, ChevronRight, BarChart, Home, Search } from '@mui/icons-material'
import { ProfileMenu } from '@/components/ProfileMenu'
import { BankAccountList } from '@/components/nav/BankAccountList'
import { useAppContext } from '@/components/context/AppContextProvider'
import { useTranslations } from 'next-intl'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Dropzone } from '@/components/shared/Dropzone'
import { MainMenuItem } from '@/components/shared/MainMenuItem'
import { ReportingList } from '@/components/nav/ReportingList'

interface AppBarProps extends MuiAppBarProps {
  open?: boolean
}

interface DrawerProps extends MuiDrawerProps {
  open?: boolean
}

const drawerWidth = 240

const openedMixin = (theme: Theme): CSSObject => ({
  width: drawerWidth,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
})

const closedMixin = (theme: Theme): CSSObject => ({
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  width: 0, //`calc(${theme.spacing(9)} + 1px)`,
  [theme.breakpoints.up('sm')]: {
    width: 0, //`calc(${theme.spacing(10)} + 1px)`,
  },
})

function CustomAppBar({ children, open, ...rest }: AppBarProps) {
  const theme = useTheme()
  return (
    <AppBar
      {...rest}
      sx={{
        zIndex: theme.zIndex.drawer + 1,
        transition: theme.transitions.create(['width', 'margin'], {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.leavingScreen,
        }),
        ...(open && {
          marginLeft: drawerWidth,
          width: `calc(100% - ${drawerWidth}px)`,
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }),
      }}
    >
      {children}
    </AppBar>
  )
}

function CustomDrawer({ children, open, ...rest }: DrawerProps) {
  const theme = useTheme()
  return (
    <Drawer
      {...rest}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        ...(open && {
          ...openedMixin(theme),
          '& .MuiDrawer-paper': openedMixin(theme),
        }),
        ...(!open && {
          ...closedMixin(theme),
          '& .MuiDrawer-paper': closedMixin(theme),
        }),
      }}
    >
      {children}
    </Drawer>
  )
}

function DrawerHeader({ children }: { children?: React.ReactNode }) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        padding: theme.spacing(0, 1),
        // necessary for content to be below app bar
        ...theme.mixins.toolbar,
        justifyContent: 'flex-end',
      }}
    >
      {children}
    </Box>
  )
}

export default function Layout({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations('common')
  const { user, currentAccountId } = useAppContext()
  const theme = useTheme()
  const [open, setOpen] = React.useState(true)

  const handleDrawerOpen = () => {
    setOpen(true)
  }

  const handleDrawerClose = () => {
    setOpen(false)
  }

  let queryString = searchParams?.toString()
  if (queryString) {
    queryString = `?${queryString}`
  }

  return (
    <Dropzone>
      <>
        <Box sx={{ display: 'flex' }}>
          <CssBaseline />
          <CustomAppBar position={'fixed'} open={open}>
            <Toolbar>
              <IconButton
                color={'inherit'}
                aria-label={'open drawer'}
                onClick={handleDrawerOpen}
                edge={'start'}
                size={'large'}
                sx={{
                  m: 2,
                  display: open ? 'none' : 'inline-flex',
                }}
              >
                <MenuIcon />
              </IconButton>
              <Typography variant={'h3'} noWrap component={'div'} sx={{ flexGrow: 1 }}></Typography>
              <ProfileMenu />
            </Toolbar>
          </CustomAppBar>
          <CustomDrawer variant={'permanent'} open={open}>
            <DrawerHeader>
              <IconButton onClick={handleDrawerClose}>
                {theme.direction === 'rtl' ? <ChevronRight /> : <ChevronLeft />}
              </IconButton>
            </DrawerHeader>
            <Divider />
            <List>
              <MainMenuItem
                onClick={() => {
                  router.push(`/${currentAccountId}/dashboard/`)
                }}
                primary={t('dashboard.title')}
                icon={<Home fontSize={'large'} />}
                selected={pathname === `/${currentAccountId}/dashboard/`}
                dense={false}
              />
              <Divider />
              <BankAccountList />
              <MainMenuItem
                onClick={() => {
                  router.push(`/${currentAccountId}/dashboard/search`)
                }}
                primary={t('dashboard.search')}
                icon={<Search fontSize={'large'} />}
                selected={pathname?.startsWith(`/${currentAccountId}/dashboard/search`) || false}
                dense={false}
              />
              <Divider />
              <ReportingList />
              <Divider />
              <MainMenuItem
                onClick={() => {
                  router.push(`/${currentAccountId}/dashboard/settings`)
                }}
                primary={t('settings.title')}
                icon={<Settings fontSize={'large'} />}
                selected={pathname?.startsWith(`/${currentAccountId}/dashboard/settings`) || false}
                dense={false}
              />
            </List>
          </CustomDrawer>
          <Box
            component={'main'}
            sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100vh', overflow: 'hidden' }}
          >
            <DrawerHeader />
            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
              <Box pl={4} pr={4} pt={2} pb={2}>
                {!!user && children}
              </Box>
            </Box>
          </Box>
        </Box>
      </>
    </Dropzone>
  )
}
