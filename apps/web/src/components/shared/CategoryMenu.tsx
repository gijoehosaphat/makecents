import { Category } from '@/graphql/types'
import { CategoryHint, HINT_MESSAGE_KEYS, menuHints } from '@/lib/categorySuggestions'
import { ListItemText, ListSubheader, Menu, MenuItem, TextField } from '@mui/material'
import { useTranslations } from 'next-intl'
import { KeyboardEvent, useMemo, useRef, useState } from 'react'

export default function CategoryMenu({
  open,
  anchorEl,
  categories,
  hints,
  onComplete,
}: {
  open: boolean
  anchorEl: Element | null
  categories: Category[]
  /** Likely categories for the transaction, listed first while the search box is empty. */
  hints?: CategoryHint[]
  /** `suggested` is true when the category came from the hints rather than the full list. */
  onComplete: (category?: Category | null, suggested?: boolean) => void
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

  const suggestions = useMemo(() => {
    if (query.trim()) return []
    return menuHints(hints ?? []).flatMap((hint) => {
      const category = categories.find((candidate) => candidate.id === hint.categoryId)
      return category ? [{ hint, category }] : []
    })
  }, [hints, categories, query])

  function complete(category?: Category | null, suggested = false) {
    setQuery('')
    onComplete(category, suggested)
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
      {suggestions.length > 0 && <ListSubheader sx={{ lineHeight: '32px' }}>{t('categories.suggested')}</ListSubheader>}
      {suggestions.map(({ hint, category }) => (
        <MenuItem key={`suggested-${category.nodeId}`} onClick={() => complete(category, true)}>
          <ListItemText
            primary={category.name}
            secondary={t(HINT_MESSAGE_KEYS[hint.tier], { matches: hint.matches, total: hint.total })}
          />
        </MenuItem>
      ))}
      {suggestions.length > 0 && <ListSubheader sx={{ lineHeight: '32px' }}>{t('categories.allCategories')}</ListSubheader>}
      {matches.map((category) => (
        <MenuItem key={category.nodeId} onClick={() => complete(category)}>
          {category.name}
        </MenuItem>
      ))}
      {matches.length === 0 && <MenuItem disabled>{t('categories.noMatchingCategories')}</MenuItem>}
    </Menu>
  )
}
