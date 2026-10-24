import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Knex } from 'knex'
import { asRole, connect, createBankAccount, registerUser } from './helpers'

type Row = { posted: string; amount: number; name: string; memo: string; type: string; bankTransactionId: string }

const row = (overrides: Partial<Row> = {}): Row => ({
  posted: '2026-10-17T03:00:00Z',
  amount: -4541,
  name: 'Withdrawal (executed at 2026-10-17)',
  memo: 'SPEND',
  type: 'DEBIT',
  bankTransactionId: 'fitid-pending',
  ...overrides,
})

// The same charge after it posted: a new id, date and name.
const posted = row({ posted: '2026-10-19T03:00:00Z', name: 'Prepaid card purchase', bankTransactionId: 'fitid-posted' })

describe('remove_transaction', () => {
  let db: Knex
  let userId: number
  let accountId: number
  let bankAccountId: number
  let categoryId: number

  beforeAll(async () => {
    db = connect()
    const user = await registerUser(db, 'deleter@example.com')
    userId = user.userId
    accountId = user.accountId
    bankAccountId = await createBankAccount(db, accountId, 'deletes')
    const [category] = await db('app_private.category').insert({ account_id: accountId, name: 'Fun' }).returning('id')
    categoryId = category.id
  })

  afterAll(async () => {
    await db.destroy()
  })

  const asMember = <T>(fn: (trx: Knex.Transaction) => Promise<T>) => asRole(db, 'makecents_member', userId, fn)

  async function importRows(trx: Knex.Transaction, rows: Row[]) {
    const { rows: result } = await trx.raw(
      `SELECT created_count, duplicate_count FROM app_private.import_transactions(?, 'file.qfx', ?::jsonb)`,
      [bankAccountId, JSON.stringify(rows)],
    )
    return { created: result[0].created_count as number, duplicates: result[0].duplicate_count as number }
  }

  async function idOf(trx: Knex.Transaction, bankTransactionId: string) {
    const found = await trx('app_private.transaction').where({ bank_transaction_id: bankTransactionId }).first('id')
    return found?.id as number | undefined
  }

  async function remove(trx: Knex.Transaction, id: number, reason: string, duplicateOfId: number | null = null) {
    const { rows } = await trx.raw(`SELECT * FROM app_private.remove_transaction(?, ?, ?, ?)`, [
      id,
      reason,
      'bank re-exported it',
      duplicateOfId,
    ])
    return rows[0]
  }

  it('deletes the transaction and records why', async () => {
    const result = await asMember(async (trx) => {
      await importRows(trx, [row()])
      const id = (await idOf(trx, 'fitid-pending'))!
      const deleted = await remove(trx, id, 'cancelled')
      return { deleted, remaining: await idOf(trx, 'fitid-pending') }
    })
    expect(result.remaining).toBeUndefined()
    expect(result.deleted).toMatchObject({
      bank_account_id: bankAccountId,
      bank_transaction_id: 'fitid-pending',
      amount: '-4541',
      name: 'Withdrawal (executed at 2026-10-17)',
      reason: 'cancelled',
      note: 'bank re-exported it',
      user_id: userId,
    })
  })

  it('keeps a deleted transaction from being imported again', async () => {
    const result = await asMember(async (trx) => {
      await importRows(trx, [row()])
      await remove(trx, (await idOf(trx, 'fitid-pending'))!, 'duplicate')
      return { reimport: await importRows(trx, [row(), posted]), pending: await idOf(trx, 'fitid-pending') }
    })
    expect(result.reimport).toEqual({ created: 1, duplicates: 1 })
    expect(result.pending).toBeUndefined()
  })

  it('gives the transaction it duplicates the category and links it lacks', async () => {
    const result = await asMember(async (trx) => {
      await importRows(trx, [row(), posted])
      const pendingId = (await idOf(trx, 'fitid-pending'))!
      const postedId = (await idOf(trx, 'fitid-posted'))!
      await trx('app_private.transaction')
        .where({ id: pendingId })
        .update({ category_id: categoryId, custom_name: 'Arcade' })
      const deleted = await remove(trx, pendingId, 'duplicate', postedId)
      const keeper = await trx('app_private.transaction').where({ id: postedId }).first()
      return { deleted, keeper, postedId }
    })
    expect(result.deleted.duplicate_of_id).toBe(result.postedId)
    expect(result.deleted.name).toBe('Arcade')
    expect(result.keeper).toMatchObject({ category_id: categoryId, custom_name: 'Arcade' })
  })

  it('moves splits to the duplicate when it has none', async () => {
    const result = await asMember(async (trx) => {
      await importRows(trx, [row(), posted])
      const pendingId = (await idOf(trx, 'fitid-pending'))!
      const postedId = (await idOf(trx, 'fitid-posted'))!
      await trx('app_private.transaction').insert({
        bank_account_id: bankAccountId,
        split_source_id: pendingId,
        amount: -1000,
        original_amount: -1000,
        category_id: categoryId,
      })
      const deleted = await remove(trx, pendingId, 'duplicate', postedId)
      const keeper = await trx('app_private.transaction').where({ id: postedId }).first('amount')
      const splits = await trx('app_private.transaction').where({ split_source_id: postedId })
      return { deleted, keeper, splits }
    })
    expect(result.splits).toHaveLength(1)
    expect(result.keeper.amount).toBe('-3541')
    expect(result.deleted.snapshot.splits).toEqual([])
  })

  it('refuses to delete a single split', async () => {
    await expect(
      asMember(async (trx) => {
        await importRows(trx, [row()])
        const parentId = (await idOf(trx, 'fitid-pending'))!
        const [split] = await trx('app_private.transaction')
          .insert({ bank_account_id: bankAccountId, split_source_id: parentId, amount: -1000, original_amount: -1000 })
          .returning('id')
        await remove(trx, split.id, 'other')
      }),
    ).rejects.toThrow(/split/)
  })

  it('restores a transaction with its splits and allows importing it again', async () => {
    const result = await asMember(async (trx) => {
      await importRows(trx, [row()])
      const id = (await idOf(trx, 'fitid-pending'))!
      await trx('app_private.transaction').where({ id }).update({ category_id: categoryId })
      await trx('app_private.transaction').insert({
        bank_account_id: bankAccountId,
        split_source_id: id,
        amount: -1000,
        original_amount: -1000,
      })
      const deleted = await remove(trx, id, 'other')
      await trx.raw(`SELECT app_private.restore_transaction(?)`, [deleted.id])
      const restored = await trx('app_private.transaction').where({ id }).first()
      const splits = await trx('app_private.transaction').where({ split_source_id: id })
      const { rows: left } = await trx.raw(`SELECT count(*)::int AS count FROM app_private.deleted_transaction`)
      return { id, restored, splits, left: left[0].count, reimport: await importRows(trx, [row()]) }
    })
    expect(result.restored).toMatchObject({ id: result.id, category_id: categoryId, amount: '-3541' })
    expect(result.restored.weighted_tsv).toBeTruthy()
    expect(result.splits).toHaveLength(1)
    expect(result.left).toBe(0)
    expect(result.reimport).toEqual({ created: 0, duplicates: 1 })
  })

  it("hides deletions from people outside the account and won't let them delete", async () => {
    const outsider = await registerUser(db, 'outsider-deleter@example.com')
    const id = await asMember(async (trx) => {
      await importRows(trx, [row()])
      return idOf(trx, 'fitid-pending')
    })
    // The member's import was rolled back; insert one the outsider can try to delete.
    const [inserted] = await db('app_private.transaction')
      .insert({ bank_account_id: bankAccountId, amount: -1, original_amount: -1, bank_transaction_id: 'outsider-test' })
      .returning('id')
    try {
      expect(id).toBeDefined()
      await expect(
        asRole(db, 'makecents_member', outsider.userId, (trx) => remove(trx, inserted.id, 'other')),
      ).rejects.toThrow()
      const visible = await asRole(db, 'makecents_member', userId, async (trx) => {
        await remove(trx, inserted.id, 'other')
        const own = await trx('app_private.deleted_transaction').count({ count: '*' })
        return Number(own[0].count)
      })
      expect(visible).toBe(1)
      const hidden = await asRole(db, 'makecents_member', outsider.userId, (trx) =>
        trx('app_private.deleted_transaction').count({ count: '*' }),
      )
      expect(Number(hidden[0].count)).toBe(0)
    } finally {
      await db('app_private.transaction').where({ id: inserted.id }).delete()
    }
  })
})
