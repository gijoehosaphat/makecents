import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { authenticateUser } from '@/helpers/api/apollo/auth'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials?.email
        const password = credentials?.password

        if (typeof email !== 'string' || typeof password !== 'string') {
          throw new CredentialsSignin()
        }

        const user = await authenticateUser({ email, password })

        if (!user) {
          throw new CredentialsSignin()
        }

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  jwt: {
    maxAge: 60 * 60 * 24,
  },
  callbacks: {
    async jwt({ token }) {
      token.userRole = 'admin'
      return token
    },
    async redirect({ url, baseUrl }) {
      return baseUrl
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
})
