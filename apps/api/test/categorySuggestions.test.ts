import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Knex } from 'knex'
import { asRole, connect, createBankAccount, registerUser } from './helpers'

describe('transaction_suggested_categories', () => {
  let db: Knex
  let alice: { userId: number; accountId: number; bankAccountId: number }
  let bob: { userId: number; accountId: number; bankAccountId: number }
  let groceriesId: number
  let uncategorizedId: number

  async function insertTransaction(bankAccountId: number, id: string, fields: Record<string, unknown>) {
    const [row] = await db('app_private.transaction')
      .insert({
        bank_account_id: bankAccountId,
        bank_transaction_id: id,
        name: 'SOBEYS #684',
        amount: -5000,
        posted: '2026-10-01',
        type: 'DEBIT',
        ...fields,
      })
      .returning('id')
    return row.id as number
  }

  function suggestionsFor(userId: number, transactionId: number) {
    return asRole(db, 'makecents_member', userId, async (trx) => {
      const { rows } = await trx.raw(
        `SELECT s.category_id, s.tier FROM app_private.transaction t, app_private.transaction_suggested_categories(t) s
         WHERE t.id = ?`,
        [transactionId],
      )
      return rows
    })
  }

  beforeAll(async () => {
    db = connect()
    const aliceUser = await registerUser(db, 'suggest-alice@example.com')
    const bobUser = await registerUser(db, 'suggest-bob@example.com')
    alice = { ...aliceUser, bankAccountId: await createBankAccount(db, aliceUser.accountId, 'alice-suggest') }
    bob = { ...bobUser, bankAccountId: await createBankAccount(db, bobUser.accountId, 'bob-suggest') }

    const [category] = await db('app_private.category')
      .insert({ account_id: alice.accountId, name: 'Groceries' })
      .returning('id')
    groceriesId = category.id

    for (let i = 0; i < 3; i++) {
      await insertTransaction(alice.bankAccountId, `history-${i}`, {
        category_id: groceriesId,
        posted: `2026-0${i + 1}-15`,
      })
    }
    uncategorizedId = await insertTransaction(alice.bankAccountId, 'new', {})
  })

  afterAll(async () => {
    await db('app_private.transaction').whereIn('bank_account_id', [alice.bankAccountId, bob.bankAccountId]).del()
    await db.destroy()
  })

  it("suggests a category from the account's own history", async () => {
    const suggestions = await suggestionsFor(alice.userId, uncategorizedId)
    expect(suggestions[0]).toEqual({ category_id: groceriesId, tier: 'payee_amount' })
  })

  it("gives no suggestions for another account's transaction", async () => {
    // Bob can't read Alice's transactions, so hand him her row as a literal, as if one had been passed in.
    const {
      rows: [{ row }],
    } = await db.raw(`SELECT t::text AS row FROM app_private.transaction t WHERE id = ?`, [uncategorizedId])
    const suggestions = await asRole(db, 'makecents_member', bob.userId, async (trx) => {
      const { rows } = await trx.raw(
        `SELECT s.category_id FROM app_private.transaction_suggested_categories(?::app_private.transaction) s`,
        [row],
      )
      return rows
    })
    expect(suggestions).toEqual([])
  })
})
