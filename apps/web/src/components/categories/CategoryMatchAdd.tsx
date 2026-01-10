import { Category, Transaction } from '@/graphql/types'
import CategoryDisplay from '../shared/CategoryDisplay'
import { useMemo } from 'react'
import { IconButton } from '@mui/material'
import { Add } from '@mui/icons-material'
import { useMutation } from '@apollo/client/react'
import { TransactionSearchDocument, UpdateTransactionDocument } from '@/graphql/operations'

export function CategoryMatchAdd({ category, transaction }: { category: Category; transaction: Transaction }) {
  const [addCategory] = useMutation(UpdateTransactionDocument, {
    refetchQueries: [
      {
        query: TransactionSearchDocument,
        variables: {
          match: category?.regex || '',
        },
      },
    ],
  })
  const [removeCategory] = useMutation(UpdateTransactionDocument, {
    refetchQueries: [
      {
        query: TransactionSearchDocument,
        variables: {
          match: category?.regex || '',
        },
      },
    ],
  })

  const categoryForTransaction = useMemo(() => {
    return transaction.categoryByCategoryId || undefined
  }, [transaction.categoryByCategoryId])

  async function handleAddCategory(transaction: Transaction) {
    await addCategory({
      variables: {
        nodeId: transaction.nodeId,
        categoryId: category.id,
      },
    })
  }

  async function handleRemoveCategory(category: Category) {
    await removeCategory({
      variables: {
        nodeId: transaction.nodeId,
        categoryId: null,
      },
    })
  }

  return (
    <>
      {categoryForTransaction ? (
        <CategoryDisplay categories={[categoryForTransaction]} handleDelete={handleRemoveCategory} />
      ) : (
        <IconButton size={'small'} color={'secondary'} onClick={() => handleAddCategory(transaction)}>
          <Add />
        </IconButton>
      )}
    </>
  )
}
