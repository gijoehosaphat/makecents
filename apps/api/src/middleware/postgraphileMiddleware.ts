import { postgraphile, PostGraphileOptions } from 'postgraphile'
import * as cookie from 'cookie'
import PluginManyCreateUpdateDelete from 'postgraphile-plugin-many-create-update-delete'
import ConnectionFilterPlugin from 'postgraphile-plugin-connection-filter'
import { PgMutationUpsertPlugin } from 'postgraphile-upsert-plugin'
import PgAggregatesPlugin from '@graphile/pg-aggregates'
import { decode } from 'next-auth/jwt'
import dotenv from 'dotenv'

dotenv.config()

const isDev = process.env.NODE_ENV !== 'production'

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
    pgSettings: async (req) => {
      if (req?.headers?.cookie) {
        const cookies = cookie.parse(req?.headers?.cookie || '')
        // https://next-auth.js.org/configuration/options#usesecurecookies
        const cookiePrefix = process.env.AUTH_URL?.startsWith('https') ? '__Secure-' : ''
        const jwt = await decode({
          token: cookies[`${cookiePrefix}next-auth.session-token`],
          secret: process.env.AUTH_SECRET || '',
        })
        if (jwt) {
          return {
            'jwt.claims.user_id': jwt.sub,
          }
        } else {
          return {}
        }
      } else {
        return {}
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
