import { Category, Transaction } from '@/graphql/types'
import { Add, AutoAwesome } from '@mui/icons-material'
import { Box, Chip, IconButton, Tooltip } from '@mui/material'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
import CategoryDisplay from '../shared/CategoryDisplay'
import CategoryMenu from '../shared/CategoryMenu'
import { UpdateTransactionDocument } from '@/graphql/operations'
import { useCategories } from '@/lib/useCategories'
import { refetchWhenIdle, trackSave } from '@/lib/refetchWhenIdle'
import { HINT_MESSAGE_KEYS, chipHint, transactionHints } from '@/lib/categorySuggestions'

export default function CategoryEditor({
  transaction,
  refetchQuery,
}: {
  transaction: Transaction
  refetchQuery?: InternalRefetchQueryDescriptor
}) {
  const t = useTranslations('common')
  const { categories } = useCategories()
  const [updateTransactionCategoryId] = useMutationWithToast(UpdateTransactionDocument, {
    refetchQueries: refetchWhenIdle(refetchQuery),
  })
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const isMenuOpen = Boolean(menuAnchorEl)

  /** `suggested` records that the category came from a hint, so it counts as a confirmed choice. */
  async function handleUpdateTransactionCategory(categoryId: number | null, suggested = false) {
    await trackSave(() =>
      updateTransactionCategoryId({
        variables: {
          nodeId: transaction.nodeId,
          categoryId,
          ...(suggested ? { categorySource: 'suggested' } : {}),
        },
      }),
    )
  }

  async function handleConfirmAuto() {
    await trackSave(() =>
      updateTransactionCategoryId({
        variables: { nodeId: transaction.nodeId, categorySource: 'manual' },
      }),
    )
  }

  function toggleMenu(event: React.MouseEvent<HTMLButtonElement>) {
    setMenuAnchorEl(event.currentTarget)
  }

  function onMenuComplete(category?: Category | null, suggested?: boolean) {
    if (category) {
      handleUpdateTransactionCategory(category.id, suggested)
    }
    setMenuAnchorEl(null)
  }

  async function handleDelete(category: Category) {
    if (category) {
      await trackSave(() =>
        updateTransactionCategoryId({
          variables: {
            nodeId: transaction.nodeId,
            categoryId: null,
          },
        }),
      )
    }
  }

  const category = useMemo(() => {
    return categories.find((category) => category.id === transaction.categoryId)
  }, [transaction.categoryId, categories])

  const hints = useMemo(() => transactionHints(transaction), [transaction])
  const favourite = useMemo(() => {
    const hint = transaction.categoryId === null ? chipHint(hints) : undefined
    const hinted = hint && categories.find((candidate) => candidate.id === hint.categoryId)
    return hint && hinted ? { hint, category: hinted } : undefined
  }, [hints, categories, transaction.categoryId])
  const isAuto = transaction.categorySource === 'auto' && transaction.categoryId !== null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        {category && <CategoryDisplay categories={[category]} handleDelete={handleDelete} />}
        {favourite && (
          <Tooltip
            title={t(HINT_MESSAGE_KEYS[favourite.hint.tier], {
              matches: favourite.hint.matches,
              total: favourite.hint.total,
            })}
          >
            <Chip
              size={'small'}
              variant={'outlined'}
              color={'secondary'}
              icon={<AutoAwesome />}
              label={favourite.category.name}
              aria-label={t('categories.acceptSuggestion', { category: favourite.category.name ?? '' })}
              onClick={() => handleUpdateTransactionCategory(favourite.category.id, true)}
              sx={{ mr: 2, mt: 1, mb: 1 }}
            />
          </Tooltip>
        )}
      </Box>
      {isAuto && (
        <Tooltip title={t('categories.autoCategorized')}>
          <IconButton
            size={'small'}
            color={'secondary'}
            aria-label={t('shared.autoCategorized')}
            onClick={handleConfirmAuto}
          >
            <AutoAwesome fontSize={'small'} />
          </IconButton>
        </Tooltip>
      )}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
        }}
      >
        {transaction.categoryId === null && (
          <IconButton
            size={'small'}
            color={'secondary'}
            sx={{ mr: 2, visibility: 'hidden' }}
            className={'transaction-row-hover'}
            onClick={toggleMenu}
          >
            <Add />
          </IconButton>
        )}
        <CategoryMenu
          open={isMenuOpen}
          anchorEl={menuAnchorEl}
          categories={[...categories]}
          hints={hints}
          onComplete={onMenuComplete}
        />
      </Box>
    </Box>
  )
}
