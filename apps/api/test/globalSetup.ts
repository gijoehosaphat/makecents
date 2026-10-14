import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import dotenv from 'dotenv'
import { Client } from 'pg'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

const apiDir = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(apiDir, '.env') })

/**
 * Creates a uniquely named database on the server DATABASE_URL points at (or
 * TEST_DATABASE_ADMIN_URL, if set), migrates it, and drops it afterwards. The configured
 * database itself is never touched. The connecting role needs CREATEDB, and permission to
 * create the extensions the migrations use.
 */
export default async function setup(project: TestProject) {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL || process.env.DATABASE_URL
  if (!adminUrl) {
    throw new Error(
      'Set DATABASE_URL (or TEST_DATABASE_ADMIN_URL) to a PostgreSQL server the tests can create a database on.',
    )
  }

  const databaseName = `makecents_test_${randomBytes(6).toString('hex')}`
  const testUrl = new URL(adminUrl)
  testUrl.pathname = `/${databaseName}`

  const admin = new Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${databaseName}`)
  await admin.end()

  async function teardown() {
    const client = new Client({ connectionString: adminUrl })
    await client.connect()
    await client.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`)
    await client.end()
  }

  try {
    // The knex CLI registers its own TypeScript loader, which vitest's process lacks.
    execFileSync('pnpm', ['exec', 'knex', 'migrate:latest'], {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
      stdio: 'pipe',
    })
  } catch (error) {
    await teardown()
    const output = error instanceof Error && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : ''
    throw new Error(`Migrating the test database failed:\n${output}`)
  }

  project.provide('databaseUrl', testUrl.toString())

  return teardown
}
