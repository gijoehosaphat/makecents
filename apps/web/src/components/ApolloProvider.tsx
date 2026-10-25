'use client'

import { GRAPH_URL } from '@/helpers/api/env'
import { ApolloLink, HttpLink } from '@apollo/client'
import { ApolloClient, ApolloNextAppProvider, InMemoryCache, SSRMultipartLink } from '@apollo/client-integration-nextjs'

function makeClient() {
  const httpLink = new HttpLink({
    // In the browser, use a same-origin path so the app works from other machines on the network
    // (an absolute localhost URL would point at the visitor's own machine). SSR still needs the absolute URL.
    uri: typeof window === 'undefined' ? GRAPH_URL : new URL(GRAPH_URL!).pathname,
  })

  return new ApolloClient({
    cache: new InMemoryCache(),
    link:
      typeof window === 'undefined'
        ? ApolloLink.from([
            new SSRMultipartLink({
              stripDefer: true,
            }),
            httpLink,
          ])
        : httpLink,
  })
}

export function ApolloProvider({ children }: React.PropsWithChildren) {
  return <ApolloNextAppProvider makeClient={makeClient}>{children}</ApolloNextAppProvider>
}
