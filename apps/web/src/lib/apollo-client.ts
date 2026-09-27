import { HttpLink } from '@apollo/client'
import { InMemoryCache, ApolloClient, registerApolloClient } from '@apollo/client-integration-nextjs'
import { cookies } from 'next/headers'
import { GRAPH_URL } from '@/helpers/api/env'

export const { getClient } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: GRAPH_URL,
      // Server-side requests don't carry the browser's cookies, so forward the session.
      fetch: async (input, init) => {
        const cookieHeader = (await cookies()).toString()
        return fetch(input, { ...init, headers: { ...init?.headers, cookie: cookieHeader } })
      },
    }),
    devtools: {
      enabled: true,
    },
  })
})
