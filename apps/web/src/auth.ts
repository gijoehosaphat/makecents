import { createHash } from 'crypto'
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
      if (session.user.email) {
        const hash = createHash('sha256').update(session.user.email.trim().toLowerCase()).digest('hex')
        // d=404 makes the image fail when no Gravatar exists, so Avatar falls back to initials
        session.user.image = `https://www.gravatar.com/avatar/${hash}?s=80&d=404`
      }
      return session
    },
  },
})
