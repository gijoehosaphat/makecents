import { Category, Budget, BudgetCategory } from '@/graphql/types'
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
  GetBudgetCategoriesByAccountIdDocument,
  GetBudgetCategoriesByAccountId,
  GetBudgetsByAccountIdDocument,
  GetCategoriesDocument,
} from '@/graphql/operations'
import { useCategories } from '@/lib/useCategories'

function refetch(accountId: number | null) {
  return {
    refetchQueries: [
      {
        query: GetBudgetsByAccountIdDocument,
        variables: {
          accountId: Number(accountId),
        },
      },
      {
        query: GetBudgetCategoriesByAccountIdDocument,
        variables: {
          accountId: Number(accountId),
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
  const { currentAccountId } = useAppContext()
  const [getCategories] = useLazyQuery(GetCategoriesDocument)
  const [createBudgetCategory] = useMutation(CreateBudgetCategoryDocument, refetch(currentAccountId))
  const [deleteBudgetCategory] = useMutation(DeleteBudgetCategoryDocument, refetch(currentAccountId))
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const isMenuOpen = Boolean(menuAnchorEl)
  const { categories } = useCategories()

  const queryBudgetCategories = useSuspenseQuery<GetBudgetCategoriesByAccountId>(GetBudgetCategoriesByAccountIdDocument, {
    variables: {
      accountId: Number(currentAccountId),
    },
  })

  async function handleAddBudgetCategory(categoryId: number) {
    if (currentAccountId) {
      await createBudgetCategory({
        variables: {
          accountId: currentAccountId,
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
    if (isMenuOpen && currentAccountId) {
      getCategories({
        variables: {
          accountId: currentAccountId,
        },
      })
    }
  }, [isMenuOpen, getCategories, currentAccountId])

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
      // Payroll is income, so it is never part of a budget.
      if (category.isPayroll) return false
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
          flexShrink: 0,
        }}
      >
        <IconButton
          size={'small'}
          color={'secondary'}
          sx={{ mr: 2, visibility: 'hidden' }}
          className={'budget-row-hover'}
          onClick={toggleMenu}
        >
          <Add />
        </IconButton>
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
