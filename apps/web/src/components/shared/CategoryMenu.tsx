import { Category } from '@/graphql/types'
import { Menu, MenuItem, TextField } from '@mui/material'
import { useMemo } from 'react'

export default function CategoryMenu({
  open,
  anchorEl,
  categories,
  onComplete,
}: {
  open: boolean
  anchorEl: Element | null
  categories: Category[]
  onComplete: (category?: Category | null) => void
}) {
  const sortedCategories = useMemo(() => {
    return categories?.sort((a: Category, b: Category) => {
      if ((a.name || '') > (b.name || '')) return 1
      if ((a.name || '') < (b.name || '')) return -1
      return 0
    })
  }, [categories])
  return (
    <Menu open={open} anchorEl={anchorEl} onClose={() => onComplete()}>
      <MenuItem>
        <TextField size={'small'} variant={'outlined'} />
      </MenuItem>
      {sortedCategories.map((category) => (
        <MenuItem key={category.nodeId} onClick={() => onComplete(category)}>
          {category.name}
        </MenuItem>
      ))}
    </Menu>
  )
}
