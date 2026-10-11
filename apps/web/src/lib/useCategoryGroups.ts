import { CategoryGroup, CustomCategoryGroup } from '@/graphql/types'
import { useMemo } from 'react'
import { skipToken, useSuspenseQuery } from '@apollo/client/react'
import { useAppContext } from '@/components/context/AppContextProvider'
import { GetCategoryGroupsDocument, GetCustomCategoryGroupsDocument } from '@/graphql/operations'

export function useCategoryGroups() {
  const { currentAccountId } = useAppContext()

  // The context fills in after mount; without an account there is nothing to ask for.
  const options = currentAccountId ? { variables: { accountId: currentAccountId } } : skipToken
  const queryCG = useSuspenseQuery(GetCategoryGroupsDocument, options)
  const queryCCG = useSuspenseQuery(GetCustomCategoryGroupsDocument, options)

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
