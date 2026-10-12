import { Category } from '@/graphql/types'
import { Menu, MenuItem, TextField } from '@mui/material'
import { useTranslations } from 'next-intl'
import { KeyboardEvent, useMemo, useRef, useState } from 'react'

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
  const t = useTranslations('common')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)
  const sortedCategories = useMemo(() => {
    return categories?.sort((a: Category, b: Category) => {
      if ((a.name || '') > (b.name || '')) return 1
      if ((a.name || '') < (b.name || '')) return -1
      return 0
    })
  }, [categories])
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return sortedCategories
    return sortedCategories.filter((category) => (category.name || '').toLowerCase().includes(needle))
  }, [sortedCategories, query])

  function complete(category?: Category | null) {
    setQuery('')
    onComplete(category)
  }

  function handleSearchKeyDown(event: KeyboardEvent) {
    // The menu would otherwise treat typed letters as jump-to-item and take focus out of the search box.
    if (event.key !== 'Escape' && event.key !== 'ArrowDown') event.stopPropagation()
    if (event.key === 'Enter' && query.trim() && matches.length > 0) {
      event.preventDefault()
      complete(matches[0])
    }
  }

  return (
    <Menu
      open={open}
      anchorEl={anchorEl}
      onClose={() => complete()}
      slotProps={{ transition: { onEntered: () => searchRef.current?.focus() } }}
    >
      <MenuItem disableRipple sx={{ '&:hover': { backgroundColor: 'transparent' } }}>
        <TextField
          size={'small'}
          variant={'outlined'}
          placeholder={t('categories.searchCategories')}
          value={query}
          inputRef={searchRef}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
          slotProps={{ htmlInput: { 'aria-label': t('categories.searchCategories') } }}
        />
      </MenuItem>
      {matches.map((category) => (
        <MenuItem key={category.nodeId} onClick={() => complete(category)}>
          {category.name}
        </MenuItem>
      ))}
      {matches.length === 0 && <MenuItem disabled>{t('categories.noMatchingCategories')}</MenuItem>}
    </Menu>
  )
}
