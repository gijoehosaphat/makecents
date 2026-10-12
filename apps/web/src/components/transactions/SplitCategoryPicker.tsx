import { Category } from '@/graphql/types'
import { Add } from '@mui/icons-material'
import { Box, IconButton } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { useCategories } from '@/lib/useCategories'
import CategoryDisplay from '../shared/CategoryDisplay'
import CategoryMenu from '../shared/CategoryMenu'

/** Chooses a category for one part of a split without saving; the dialog saves every part together. */
export default function SplitCategoryPicker({
  categoryId,
  onChange,
  disabled = false,
}: {
  categoryId: number | null
  onChange: (categoryId: number | null) => void
  disabled?: boolean
}) {
  const t = useTranslations('common')
  const { categories } = useCategories()
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const category = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId])

  function onMenuComplete(selected?: Category | null) {
    if (selected) {
      onChange(selected.id)
    }
    setMenuAnchorEl(null)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
      {category && (
        <CategoryDisplay categories={[category]} handleDelete={disabled ? undefined : () => onChange(null)} />
      )}
      {!category && !disabled && (
        <IconButton
          size={'small'}
          color={'secondary'}
          aria-label={t('categories.splitAddCategory')}
          onClick={(event) => setMenuAnchorEl(event.currentTarget)}
        >
          <Add />
        </IconButton>
      )}
      <CategoryMenu
        open={Boolean(menuAnchorEl)}
        anchorEl={menuAnchorEl}
        categories={[...categories]}
        onComplete={onMenuComplete}
      />
    </Box>
  )
}
