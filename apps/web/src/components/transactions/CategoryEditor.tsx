import { Category, Transaction } from '@/graphql/types'
import { Add } from '@mui/icons-material'
import { Box, IconButton } from '@mui/material'
import { useMemo, useState } from 'react'
import { InternalRefetchQueryDescriptor } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import CategoryDisplay from '../shared/CategoryDisplay'
import CategoryMenu from '../shared/CategoryMenu'
import { UpdateTransactionDocument } from '@/graphql/operations'
import { useCategories } from '@/lib/useCategories'

export default function CategoryEditor({
  transaction,
  refetchQuery,
}: {
  transaction: Transaction
  refetchQuery?: InternalRefetchQueryDescriptor
}) {
  const { categories } = useCategories()
  const [updateTransactionCategoryId] = useMutation(UpdateTransactionDocument, {
    refetchQueries: refetchQuery ? [refetchQuery] : [],
  })
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const isMenuOpen = Boolean(menuAnchorEl)

  async function handleUpdateTransactionCategory(categoryId: number | null) {
    await updateTransactionCategoryId({
      variables: {
        nodeId: transaction.nodeId,
        categoryId,
      },
    })
  }

  function toggleMenu(event: React.MouseEvent<HTMLButtonElement>) {
    setMenuAnchorEl(event.currentTarget)
  }

  function onMenuComplete(category?: Category | null) {
    if (category) {
      handleUpdateTransactionCategory(category.id)
    }
    setMenuAnchorEl(null)
  }

  async function handleDelete(category: Category) {
    if (category) {
      await updateTransactionCategoryId({
        variables: {
          nodeId: transaction.nodeId,
          categoryId: null,
        },
      })
    }
  }

  const category = useMemo(() => {
    return categories.find((category) => category.id === transaction.categoryId)
  }, [transaction.categoryId, categories])

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
      </Box>
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
          onComplete={onMenuComplete}
        />
      </Box>
    </Box>
  )
}
