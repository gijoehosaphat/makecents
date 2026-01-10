import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from 'next-auth/adapters'
import { createSession } from '@/helpers/api/apollo/sessions'
import { createUser, getUserById, getUserByEmail, getUserByAccount } from '@/helpers/api/apollo/users'
import { createAndLinkAccount } from '@/helpers/api/apollo/accounts'

export default function ApolloAuthAdapter(): Adapter {
  return {
    async createUser(user: AdapterUser) {
      const newUser = (await createUser({
        name: user.name || '',
        email: user.email,
        image: user.image || '',
      })) as unknown as AdapterUser

      if (!newUser) {
        // adapter should fail the operation, not return null
        throw new Error('Failed to create user')
      }

      return newUser
    },
    async getUser(id: string) {
      const user = (await getUserById({ id: Number(id) })) as unknown as AdapterUser
      return user
    },
    async getUserByEmail(email: string) {
      const user = (await getUserByEmail({ email })) as unknown as AdapterUser
      return user
    },
    async getUserByAccount({ providerAccountId, provider }: { providerAccountId: string; provider: any }) {
      const user = (await getUserByAccount({ provider, providerAccountId })) as unknown as AdapterUser
      return user
    },
    async updateUser(user) {
      return new Promise((resolve, reject) => {
        resolve({ id: '123', email: '', emailVerified: new Date() })
      })
    },
    async deleteUser(userId: string) {
      return
    },
    async linkAccount(account: AdapterAccount) {
      if (account.userId && account.provider && account.type && account.providerAccountId) {
        return (await createAndLinkAccount({
          userId: Number(account.userId),
          provider: account.provider,
          type: account.type,
          providerAccountId: account.providerAccountId,
          accessToken: String(account.accessToken) || undefined,
          expiresAt: String(account.expiresAt),
          scope: account.scope || undefined,
          tokenType: String(account.tokenType) || undefined,
          idToken: String(account.idToken) || undefined,
        })) as unknown as AdapterAccount
      }
    },
    async unlinkAccount({ providerAccountId, provider }: { providerAccountId: string; provider: any }) {
      return
    },
    async createSession({ sessionToken, userId, expires }: { sessionToken: string; userId: string; expires: Date }) {
      return createSession({ sessionToken, userId: Number(userId), expires }) as unknown as AdapterSession
    },
    async getSessionAndUser(sessionToken: string) {
      return new Promise((resolve, reject) => {
        resolve({
          session: { sessionToken: '', userId: '', expires: new Date() },
          user: { id: '123', email: '', emailVerified: new Date() },
        })
      })
    },
    async updateSession({ sessionToken }: { sessionToken: string }) {
      return new Promise((resolve, reject) => {
        resolve({ sessionToken: '', userId: '', expires: new Date() })
      })
    },
    async deleteSession(sessionToken: string) {
      return
    },
  }
}
