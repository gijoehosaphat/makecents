import React from 'react'
import { ListItem, ListItemButton, ListItemIcon, ListItemText, SxProps, Theme } from '@mui/material'

export function MainMenuItem({
  onClick,
  primary,
  secondary,
  icon,
  selected,
  children,
  dense,
  sx,
}: {
  onClick: () => void
  primary: string
  secondary?: string
  icon: React.ReactElement
  selected: boolean
  children?: React.ReactNode
  dense: boolean
  sx?: SxProps<Theme>
}) {
  return (
    <ListItem disablePadding sx={{ display: 'block' }}>
      <ListItemButton
        sx={[
          {
            minHeight: 48,
            justifyContent: 'initial',
            px: 2.5,
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        onClick={onClick}
        selected={selected}
        dense={dense}
      >
        <ListItemIcon
          sx={{
            minWidth: 0,
            mr: 3,
            justifyContent: 'center',
          }}
        >
          {icon}
        </ListItemIcon>
        <ListItemText primary={primary} secondary={secondary} />
        {children}
      </ListItemButton>
    </ListItem>
  )
}
