import { useCategoryGroups } from '@/lib/useCategoryGroups'
import { Category, CustomCategoryGroup } from '@/graphql/types'
import { useMutation } from '@apollo/client/react'
import { useAppContext } from '../context/AppContextProvider'
import { Chip, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material'
import { Category as CategoryIcon, Check } from '@mui/icons-material'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  DeleteCategoryGroupDocument,
  GetCategoryGroupsDocument,
  UpsertCategoryGroupDocument,
} from '@/graphql/operations'

export function CategoryGroupEditor({ category }: { category: Category }) {
  const t = useTranslations('common')
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const { currentAccountId } = useAppContext()
  const { categoryGroups, customCategoryGroups } = useCategoryGroups()
  const [upsertCategoryGroup] = useMutation(UpsertCategoryGroupDocument, {
    refetchQueries: [
      {
        query: GetCategoryGroupsDocument,
        variables: {
          accountId: currentAccountId,
        },
      },
    ],
  })
  const [deleteCategoryGroup] = useMutation(DeleteCategoryGroupDocument, {
    refetchQueries: [
      {
        query: GetCategoryGroupsDocument,
        variables: {
          accountId: currentAccountId,
        },
      },
    ],
  })

  const selectedCategoryGroup = categoryGroups.find((cg) => cg.categoryId === category.id)

  function handleOpenMenu(event: React.MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget)
  }

  function handleCloseMenu() {
    setAnchorEl(null)
  }

  function handleOnClick(customCategoryGroup: CustomCategoryGroup) {
    if (currentAccountId) {
      upsertCategoryGroup({
        variables: {
          id: selectedCategoryGroup?.id || undefined,
          accountId: currentAccountId,
          categoryId: category.id,
          customCategoryGroupId: customCategoryGroup.id,
        },
      })
    }
    handleCloseMenu()
  }

  function handleDelete() {
    if (selectedCategoryGroup) {
      deleteCategoryGroup({
        variables: {
          nodeId: selectedCategoryGroup.nodeId,
        },
      })
    }
    handleCloseMenu()
  }

  return (
    <>
      <Chip
        label={
          selectedCategoryGroup
            ? selectedCategoryGroup.customCategoryGroupByCustomCategoryGroupId?.name
            : t('shared.noGroup')
        }
        variant={selectedCategoryGroup ? 'filled' : 'outlined'}
        onClick={handleOpenMenu}
      />
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        keepMounted
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
      >
        {customCategoryGroups.map((customCategoryGroup) => (
          <MenuItem key={customCategoryGroup.nodeId} onClick={() => handleOnClick(customCategoryGroup)}>
            {selectedCategoryGroup?.customCategoryGroupId === customCategoryGroup.id && (
              <ListItemIcon>
                <Check fontSize="small" />
              </ListItemIcon>
            )}
            <ListItemText>{customCategoryGroup.name}</ListItemText>
          </MenuItem>
        ))}
        {selectedCategoryGroup && (
          <MenuItem onClick={handleDelete}>
            <ListItemText>{t('shared.noGroup')}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </>
  )
}
