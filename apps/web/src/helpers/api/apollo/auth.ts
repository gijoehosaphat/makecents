import { AuthenticateDocument } from '@/graphql/operations'
import { getClient } from '@/lib/apollo-client'

export async function authenticateUser(variables: { email: string; password: string }) {
  const client = getClient()
  const response = await client.mutate({
    mutation: AuthenticateDocument,
    variables,
  })

  return response?.data?.authenticate?.user
}
