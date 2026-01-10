import { Category, Budget, BudgetCategory, User } from '@/graphql/types'
import { Add } from '@mui/icons-material'
import { Box, IconButton } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { useLazyQuery, useMutation, useSuspenseQuery } from '@apollo/client/react'
import { useAppContext } from '../context/AppContextProvider'
import CategoryDisplay from '../shared/CategoryDisplay'
import CategoryMenu from '../shared/CategoryMenu'
import {
  CreateBudgetCategoryDocument,
  DeleteBudgetCategoryDocument,
  GetBudgetCategoriesByUserIdDocument,
  GetBudgetCategoriesByUserId,
  GetBudgetsByUserIdDocument,
  GetCategoriesDocument,
} from '@/graphql/operations'
import { useCategories } from '@/lib/useCategories'

function refetch(user: User | null) {
  return {
    refetchQueries: [
      {
        query: GetBudgetsByUserIdDocument,
        variables: {
          userId: Number(user?.id),
        },
      },
      {
        query: GetBudgetCategoriesByUserIdDocument,
        variables: {
          equalTo: Number(user?.id),
        },
      },
    ],
  }
}

export default function CategoryEditor({
  budget,
  budgetCategories,
}: {
  budget: Budget
  budgetCategories: BudgetCategory[]
}) {
  const { user } = useAppContext()
  const [getCategories] = useLazyQuery(GetCategoriesDocument)
  const [createBudgetCategory] = useMutation(CreateBudgetCategoryDocument, refetch(user))
  const [deleteBudgetCategory] = useMutation(DeleteBudgetCategoryDocument, refetch(user))
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const isMenuOpen = Boolean(menuAnchorEl)
  const { categories } = useCategories()

  const queryBudgetCategories = useSuspenseQuery<GetBudgetCategoriesByUserId>(GetBudgetCategoriesByUserIdDocument, {
    variables: {
      equalTo: Number(user?.id),
    },
  })

  async function handleAddBudgetCategory(categoryId: number) {
    if (user?.id) {
      await createBudgetCategory({
        variables: {
          userId: user?.id,
          budgetId: budget.id,
          categoryId,
        },
      })
    }
  }

  function toggleMenu(event: React.MouseEvent<HTMLButtonElement>) {
    setMenuAnchorEl(event.currentTarget)
  }

  function onMenuComplete(category?: Category | null) {
    if (category) {
      handleAddBudgetCategory(category.id)
    }
    setMenuAnchorEl(null)
  }

  async function handleDelete(category: Category) {
    const budgetCategory = budget.budgetCategoriesByBudgetId.nodes.find((bc) => bc.categoryId === category.id)
    if (budgetCategory) {
      await deleteBudgetCategory({
        variables: {
          nodeId: budgetCategory.nodeId,
        },
      })
    }
  }

  useEffect(() => {
    if (isMenuOpen) {
      getCategories({
        variables: {
          userId: user?.id,
        },
      })
    }
  }, [isMenuOpen, getCategories, user?.id])

  const currentCategories = useMemo(() => {
    return budgetCategories.map((budgetCategory) => budgetCategory.categoryByCategoryId as Category) || []
  }, [budgetCategories])

  const usedCategories: Category[] = useMemo(() => {
    let tempCategories: Category[] = []
    queryBudgetCategories?.data?.allBudgetCategories?.nodes.forEach((budgetCategory) => {
      if (budgetCategory.categoryByCategoryId) {
        tempCategories.push(budgetCategory.categoryByCategoryId as Category)
      }
    })
    return tempCategories
  }, [queryBudgetCategories?.data?.allBudgetCategories?.nodes])

  const availableCategories: Category[] = useMemo(() => {
    return categories.filter((category: Category) => {
      return !usedCategories.find((usedCategory: Category) => {
        return category.id === usedCategory.id
      })
    })
  }, [categories, usedCategories])

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
        <CategoryDisplay categories={currentCategories} handleDelete={handleDelete} />
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
        }}
      >
        {budgetCategories.length <= 3 && (
          <IconButton
            size={'small'}
            color={'secondary'}
            sx={{ mr: 2, visibility: 'hidden' }}
            className={'budget-row-hover'}
            onClick={toggleMenu}
          >
            <Add />
          </IconButton>
        )}
        <CategoryMenu
          open={isMenuOpen}
          anchorEl={menuAnchorEl}
          categories={availableCategories}
          onComplete={onMenuComplete}
        />
      </Box>
    </Box>
  )
}
