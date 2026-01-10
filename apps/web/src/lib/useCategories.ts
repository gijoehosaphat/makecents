import { Category } from '@/graphql/types'
import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import { useAppContext } from '@/components/context/AppContextProvider'
import { GetCategoriesDocument } from '@/graphql/operations'

export function useCategories() {
  const { user } = useAppContext()

  const query = useSuspenseQuery(GetCategoriesDocument, {
    variables: {
      userId: user?.id,
    },
  })

  const categories: Category[] = useMemo(() => {
    return (
      [...(query?.data?.allCategories?.nodes as Category[])].sort((a, b) => {
        if (a.name && b.name && a.name > b.name) return 1
        if (a.name && b.name && a.name < b.name) return -1
        return 0
      }) || []
    )
  }, [query?.data?.allCategories?.nodes])

  return {
    categories,
  }
}
