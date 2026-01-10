import { HttpLink } from '@apollo/client'
import { InMemoryCache, ApolloClient, registerApolloClient } from '@apollo/client-integration-nextjs'
import { GRAPH_URL } from '@/helpers/api/env'

export const { getClient } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: GRAPH_URL,
    }),
    devtools: {
      enabled: true,
    },
  })
})
