import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import ApolloAuthAdapter from '@/helpers/api/apolloAuthAdapter'
import { GOOGLE_ID, GOOGLE_SECRET } from '@/helpers/api/env'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: ApolloAuthAdapter(),
  providers: [
    Google({
      clientId: GOOGLE_ID,
      clientSecret: GOOGLE_SECRET,
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
    async session({ session }) {
      return session
    },
  },
})
