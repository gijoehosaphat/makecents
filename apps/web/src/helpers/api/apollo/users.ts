import {
  CreateUserDocument,
  GetAccountByAccountProviderDocument,
  GetUserByEmailDocument,
  GetUserByIdDocument,
} from '@/graphql/operations'
import { getClient } from '@/lib/apollo-client'

export async function getUserById(variables: { id: number }) {
  const client = getClient()
  const response = await client.query({
    query: GetUserByIdDocument,
    variables,
  })
  return response?.data?.userById
}

export async function getUserByEmail(variables: { email: string }) {
  const client = getClient()
  const response = await client.query({
    query: GetUserByEmailDocument,
    variables,
  })
  return response?.data?.userByEmail
}

export async function getUserByAccount(variables: { provider: string; providerAccountId: string }) {
  const client = getClient()
  const response = await client.query({
    query: GetAccountByAccountProviderDocument,
    variables,
  })

  return response?.data?.accountByProviderAndProviderAccountId?.userByUserId
}

export async function createUser(variables: { name: string; email: string; image: string }) {
  const client = getClient()
  const response = await client.mutate({
    mutation: CreateUserDocument,
    variables,
  })

  return response?.data?.createUser?.user
}
