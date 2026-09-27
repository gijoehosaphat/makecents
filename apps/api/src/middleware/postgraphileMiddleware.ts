import { postgraphile, PostGraphileOptions } from 'postgraphile'
import PluginManyCreateUpdateDelete from 'postgraphile-plugin-many-create-update-delete'
import ConnectionFilterPlugin from 'postgraphile-plugin-connection-filter'
import { PgMutationUpsertPlugin } from 'postgraphile-upsert-plugin'
import PgAggregatesPlugin from '@graphile/pg-aggregates'
import type { IncomingMessage } from 'http'
import dotenv from 'dotenv'

dotenv.config()

const isDev = process.env.NODE_ENV !== 'production'

// Decodes the Auth.js (next-auth v5) session cookie the web app sets. @auth/core is ESM-only,
// so it is loaded with a dynamic import from this CommonJS module.
async function getSessionToken(req: IncomingMessage | undefined) {
  if (!req?.headers?.cookie) {
    return null
  }
  const { getToken } = await import('@auth/core/jwt')
  return getToken({
    req: { headers: { cookie: req.headers.cookie } },
    secret: process.env.AUTH_SECRET || '',
    secureCookie: process.env.AUTH_URL?.startsWith('https') ?? false,
  })
}

function getPostgraphileOptions() {
  const postgraphileOptions: PostGraphileOptions = {
    subscriptions: true,
    watchPg: isDev,
    dynamicJson: true,
    setofFunctionsContainNulls: false,
    ignoreRBAC: false,
    ignoreIndexes: false,
    enableCors: true,
    showErrorStack: isDev,
    extendedErrors: isDev
      ? [
          'severity',
          'code',
          'detail',
          'hint',
          'position',
          'internalPosition',
          'internalQuery',
          'where',
          'schema',
          'table',
          'column',
          'dataType',
          'constraint',
          'file',
          'line',
          'routine',
        ]
      : ['errcode'],
    // appendPlugins: [require("@graphile-contrib/pg-simplify-inflector")],
    exportGqlSchemaPath: isDev ? 'schema.graphql' : '',
    graphiql: isDev,
    enhanceGraphiql: isDev,
    disableQueryLog: !isDev,
    allowExplain() {
      // TODO: customise condition!
      return true
    },
    enableQueryBatching: true,
    // legacyRelations: 'omit',
    // Every request runs as a restricted role so row-level security applies. Without a valid
    // Auth.js session it can only call the SECURITY DEFINER sign-up/sign-in functions.
    pgSettings: async (req) => {
      const jwt = await getSessionToken(req)
      if (jwt?.sub) {
        return {
          role: 'makecents_member',
          'jwt.claims.user_id': jwt.sub,
        }
      }
      return {
        role: 'makecents_anonymous',
      }
    },
    appendPlugins: [PgMutationUpsertPlugin, PluginManyCreateUpdateDelete, ConnectionFilterPlugin, PgAggregatesPlugin],
    // ...jwtOptions,
    graphqlRoute: '/api/graphql',
    graphiqlRoute: '/api/graphiql',
    retryOnInitFail: true,
    graphileBuildOptions: {
      // connectionFilterAllowedFieldTypes: [
      //   // 'String',
      //   // 'Int',
      // ],
      // connectionFilterAllowedOperators: [
      //   // 'isNull',
      //   // 'equalTo',
      //   // 'notEqualTo',
      //   // 'distinctFrom',
      //   // 'notDistinctFrom',
      //   // 'lessThan',
      //   // 'lessThanOrEqualTo',
      //   // 'greaterThan',
      //   // 'greaterThanOrEqualTo',
      //   // 'in',
      //   // 'notIn',
      // ],
      // connectionFilterComputedColumns: false,
      // connectionFilterSetofFunctions: false,
      // connectionFilterArrays: false,
    },
  }

  return postgraphileOptions
}

export function postgraphileMiddleware() {
  return postgraphile(process.env.DATABASE_URL, ['app_private', 'public'], getPostgraphileOptions())
}
