import { useMemo } from 'react'
import { useQuery } from '@apollo/client/react'
import { useAppContext } from '@/components/context/AppContextProvider'
import { GetAccountMembersDocument } from '@/graphql/operations'

/** Members of the current account, primary user (the owner) first, and whether that is the signed-in user. */
export function useAccountMembers() {
  const { user, currentAccountId } = useAppContext()

  const query = useQuery(GetAccountMembersDocument, {
    variables: { accountId: Number(currentAccountId) },
    skip: !currentAccountId,
  })

  const members = useMemo(
    () =>
      [...(query.data?.allAccountMembers?.nodes || [])].sort((a, b) => {
        if (a.role === 'owner' && b.role !== 'owner') return -1
        if (b.role === 'owner' && a.role !== 'owner') return 1
        return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
      }),
    [query.data?.allAccountMembers?.nodes],
  )

  const isPrimary = members.some((member) => member.role === 'owner' && member.userId === user?.id)

  return { members, isPrimary, loading: query.loading, refetch: query.refetch }
}
