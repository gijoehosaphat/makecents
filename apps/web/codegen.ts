import type { CodegenConfig } from '@graphql-codegen/cli'
import 'dotenv/config'

const config: CodegenConfig = {
  overwrite: true,
  schema: process.env.NEXT_PUBLIC_CODEGEN_GRAPH_URL,
  documents: 'src/**/*.graphql',
  generates: {
    // For linting / intellisense.
    'graphql-schema.json': {
      plugins: ['introspection'],
    },

    // Pure TypeScript types.
    'src/graphql/types.d.ts': {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
        flattenGeneratedTypes: true,
        omitOperationSuffix: true,
      },
    },
    // Pre-parsed Documents, variables, and return types for client-side
    // operations.
    'src/graphql/operations.ts': {
      plugins: ['typescript-operations', 'typed-document-node'],
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
        flattenGeneratedTypes: true,
        omitOperationSuffix: true,
      },
      preset: 'import-types',
      presetConfig: {
        typesPath: '@src/graphql/types',
      },
    },
  },
}

export default config
