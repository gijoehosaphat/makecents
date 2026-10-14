import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Knex } from 'knex'
import { asRole, connect, createBankAccount, registerUser } from './helpers'

type Row = { posted: string; amount: number; name: string; memo: string; type: string; bankTransactionId: string }

const row = (overrides: Partial<Row> = {}): Row => ({
  posted: '2026-01-15T12:00:00Z',
  amount: -1250,
  name: 'COFFEE SHOP',
  memo: '',
  type: 'DEBIT',
  bankTransactionId: 'fitid-1',
  ...overrides,
})

describe('import_transactions', () => {
  let db: Knex
  let userId: number
  let bankAccountId: number

  beforeAll(async () => {
    db = connect()
    const user = await registerUser(db, 'importer@example.com')
    userId = user.userId
    bankAccountId = await createBankAccount(db, user.accountId, 'imports')
  })

  afterAll(async () => {
    await db.destroy()
  })

  /** Runs one import as the member, rolled back afterwards so each test starts empty. */
  async function importRows(rows: Row[], seed: Row[] = []) {
    return asRole(db, 'makecents_member', userId, async (trx) => {
      for (const existing of seed) {
        await trx.raw(`SELECT app_private.import_transactions(?, 'seed.qfx', ?::jsonb)`, [
          bankAccountId,
          JSON.stringify([existing]),
        ])
      }
      const { rows: result } = await trx.raw(
        `SELECT created_count, duplicate_count FROM app_private.import_transactions(?, 'file.qfx', ?::jsonb)`,
        [bankAccountId, JSON.stringify(rows)],
      )
      const { rows: stored } = await trx.raw(`SELECT count(*)::int AS count FROM app_private.transaction`)
      return {
        created: result[0].created_count as number,
        duplicates: result[0].duplicate_count as number,
        stored: stored[0].count as number,
      }
    })
  }

  it('creates every row of a new file', async () => {
    const result = await importRows([row(), row({ bankTransactionId: 'fitid-2', amount: -999, name: 'GROCER' })])
    expect(result).toEqual({ created: 2, duplicates: 0, stored: 2 })
  })

  it('skips rows with a bank transaction id the account already has', async () => {
    const result = await importRows([row()], [row()])
    expect(result).toEqual({ created: 0, duplicates: 1, stored: 1 })
  })

  it('skips a row the bank re-issued under a new id with the same date and amount', async () => {
    const result = await importRows([row({ bankTransactionId: 'fitid-reissued' })], [row()])
    expect(result).toEqual({ created: 0, duplicates: 1, stored: 1 })
  })

  it('imports a second purchase of the same amount on the same day', async () => {
    const result = await importRows([row(), row({ bankTransactionId: 'fitid-2' })], [row()])
    expect(result).toEqual({ created: 1, duplicates: 1, stored: 2 })
  })

  it('refuses to import into an account the user cannot write to', async () => {
    const other = await registerUser(db, 'other-importer@example.com')
    await expect(
      asRole(db, 'makecents_member', other.userId, (trx) =>
        trx.raw(`SELECT app_private.import_transactions(?, 'file.qfx', ?::jsonb)`, [
          bankAccountId,
          JSON.stringify([row()]),
        ]),
      ),
    ).rejects.toThrow()
  })
})
