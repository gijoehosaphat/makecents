import { CategoryGroup, CustomCategoryGroup } from '@/graphql/types'
import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import { useAppContext } from '@/components/context/AppContextProvider'
import { GetCategoryGroupsDocument, GetCustomCategoryGroupsDocument } from '@/graphql/operations'

export function useCategoryGroups() {
  const { currentAccountId } = useAppContext()

  const queryCG = useSuspenseQuery(GetCategoryGroupsDocument, {
    variables: {
      accountId: currentAccountId || 0, //TODO Fix this
    },
  })

  const queryCCG = useSuspenseQuery(GetCustomCategoryGroupsDocument, {
    variables: {
      accountId: currentAccountId || 0, //TODO Fix this
    },
  })

  const categoryGroups: CategoryGroup[] = useMemo(() => {
    return (queryCG?.data?.allCategoryGroups?.nodes as CategoryGroup[]) || []
  }, [queryCG?.data?.allCategoryGroups?.nodes])

  const customCategoryGroups: CustomCategoryGroup[] = useMemo(() => {
    return (queryCCG?.data?.allCustomCategoryGroups?.nodes as CustomCategoryGroup[]) || []
  }, [queryCCG?.data?.allCustomCategoryGroups?.nodes])

  return {
    categoryGroups,
    customCategoryGroups,
  }
}
