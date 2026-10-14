import { createRequire } from 'node:module'
import type { printSchema as PrintSchema } from 'graphql'
import { createPostGraphileSchema } from 'postgraphile'
import { describe, expect, it, inject } from 'vitest'
import { getPostgraphileOptions, POSTGRAPHILE_SCHEMAS } from '../src/middleware/postgraphileMiddleware'

// Postgraphile loads the CommonJS build of graphql, so print with that same instance (importing
// the ESM build here would fail graphql's cross-realm check).
const { printSchema } = createRequire(__filename)('graphql') as { printSchema: typeof PrintSchema }

describe('GraphQL schema', () => {
  // The web app's generated types come from this schema, so any change to it is a change to the
  // API contract. When a migration or plugin changes it on purpose, review the diff and refresh
  // the snapshot with `pnpm --filter makecents-api test -u`.
  it('matches the committed snapshot', async () => {
    const schema = await createPostGraphileSchema(inject('databaseUrl'), POSTGRAPHILE_SCHEMAS, {
      ...getPostgraphileOptions(),
      watchPg: false,
    })
    await expect(printSchema(schema)).toMatchFileSnapshot('./snapshots/api-schema.graphql')
  })
})
