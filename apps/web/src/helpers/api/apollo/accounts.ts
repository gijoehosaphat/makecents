import { CreateAccountDocument } from '@/graphql/operations'
import { getClient } from '@/lib/apollo-client'
import { JsonArray, JsonObject } from 'next-auth/adapters'

export async function createAndLinkAccount(variables: {
  userId: number
  provider: string
  type: string
  providerAccountId: string
  accessToken: string | undefined
  expiresAt: string | undefined
  scope: string | undefined
  tokenType: string | undefined
  idToken: string | undefined
}) {
  const client = getClient()
  const response = await client.mutate({
    mutation: CreateAccountDocument,
    variables,
  })

  return response?.data?.createAccount?.account
}
