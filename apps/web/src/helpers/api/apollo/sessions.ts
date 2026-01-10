import { CreateSessionDocument } from '@/graphql/operations'
import { getClient } from '@/lib/apollo-client'

export async function createSession({
  sessionToken,
  userId,
  expires,
}: {
  sessionToken: string
  userId: number
  expires: Date
}) {
  const client = getClient()
  const response = await client.mutate({
    mutation: CreateSessionDocument,
    variables: {
      sessionToken,
      userId,
      expires,
    },
  })
  return response?.data?.createSession?.session
}
