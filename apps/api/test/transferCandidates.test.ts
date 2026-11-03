import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Knex } from 'knex'
import { asRole, connect, createBankAccount, registerUser } from './helpers'

describe('transaction_transfer_candidates', () => {
  let db: Knex
  let alice: { userId: number; accountId: number }
  let bob: { userId: number; accountId: number }
  let chequingId: number
  let savingsId: number
  let visaId: number
  let bobBankAccountId: number
  let sourceId: number
  const ids: { [key: string]: number } = {}

  async function insertTransaction(bankAccountId: number, id: string, fields: Record<string, unknown>) {
    const [row] = await db('app_private.transaction')
      .insert({
        bank_account_id: bankAccountId,
        bank_transaction_id: id,
        name: 'SOMETHING',
        amount: 50000,
        posted: '2026-10-10',
        type: 'CREDIT',
        ...fields,
      })
      .returning('id')
    ids[id] = row.id
    return row.id as number
  }

  function candidatesFor(userId: number, transactionId: number, withinDays: number | null = null) {
    return asRole(db, 'makecents_member', userId, async (trx) => {
      const { rows } = await trx.raw(
        `SELECT c.bank_transaction_id FROM app_private.transaction t,
           app_private.transaction_transfer_candidates(t, ?) c WHERE t.id = ?`,
        [withinDays, transactionId],
      )
      return rows.map((row: { bank_transaction_id: string }) => row.bank_transaction_id)
    })
  }

  function suggestedFor(userId: number, transactionId: number) {
    return asRole(db, 'makecents_member', userId, async (trx) => {
      const { rows } = await trx.raw(
        `SELECT (app_private.transaction_suggested_transfer(t)).bank_transaction_id AS id
         FROM app_private.transaction t WHERE t.id = ?`,
        [transactionId],
      )
      return rows[0]?.id ?? null
    })
  }

  beforeAll(async () => {
    db = connect()
    alice = await registerUser(db, 'transfer-alice@example.com')
    bob = await registerUser(db, 'transfer-bob@example.com')
    chequingId = await createBankAccount(db, alice.accountId, 'Chequing')
    savingsId = await createBankAccount(db, alice.accountId, 'Savings')
    visaId = await createBankAccount(db, alice.accountId, 'Visa')
    bobBankAccountId = await createBankAccount(db, bob.accountId, 'bob-transfer')

    sourceId = await insertTransaction(chequingId, 'source', { amount: -50000, type: 'DEBIT' })

    await insertTransaction(savingsId, 'same-day', {})
    await insertTransaction(visaId, 'two-days-named', { posted: '2026-10-12', name: 'PAYMENT THANK YOU' })
    await insertTransaction(savingsId, 'far', { posted: '2026-08-01' })
    // Never candidates:
    await insertTransaction(chequingId, 'same-bank-account', {})
    await insertTransaction(savingsId, 'other-amount', { amount: 49999 })
    await insertTransaction(bobBankAccountId, 'other-account', {})
    const [category] = await db('app_private.category')
      .insert({ account_id: alice.accountId, name: 'Income' })
      .returning('id')
    await insertTransaction(savingsId, 'categorized', { category_id: category.id })
    const linked = await insertTransaction(savingsId, 'linked', {})
    const linkedOther = await insertTransaction(chequingId, 'linked-other', { amount: -50000, type: 'DEBIT' })
    await db('app_private.transfer').insert({ transaction_source_id: linkedOther, transaction_target_id: linked })
    const split = await insertTransaction(savingsId, 'split', {})
    await insertTransaction(savingsId, 'split-child', { amount: 1, split_source_id: split })
  })

  afterAll(async () => {
    await db('app_private.transaction')
      .whereIn('bank_account_id', [chequingId, savingsId, visaId, bobBankAccountId])
      .whereNotNull('split_source_id')
      .del()
    await db('app_private.transaction')
      .whereIn('bank_account_id', [chequingId, savingsId, visaId, bobBankAccountId])
      .del()
    await db.destroy()
  })

  it('ranks linkable counterparts by date, with transfer wording counting as closer', async () => {
    expect(await candidatesFor(alice.userId, sourceId)).toEqual(['two-days-named', 'same-day', 'far'])
  })

  it('limits candidates to the given number of days', async () => {
    expect(await candidatesFor(alice.userId, sourceId, 14)).toEqual(['two-days-named', 'same-day'])
  })

  it('counts a mention of the other bank account as transfer wording', async () => {
    const source = await insertTransaction(chequingId, 'to-savings', {
      amount: -7000,
      type: 'DEBIT',
      name: 'ONLINE BANKING',
      memo: 'To Savings',
    })
    await insertTransaction(visaId, 'visa-same-day', { amount: 7000 })
    await insertTransaction(savingsId, 'savings-next-day', { amount: 7000, posted: '2026-10-11' })
    expect(await candidatesFor(alice.userId, source)).toEqual(['savings-next-day', 'visa-same-day'])
  })

  it('suggests the best candidate for a linkable transaction', async () => {
    expect(await suggestedFor(alice.userId, sourceId)).toEqual('two-days-named')
    expect(await suggestedFor(alice.userId, ids['linked-other'])).toBeNull()
  })

  it("gives no candidates for another account's transaction", async () => {
    const {
      rows: [{ row }],
    } = await db.raw(`SELECT t::text AS row FROM app_private.transaction t WHERE id = ?`, [sourceId])
    const candidates = await asRole(db, 'makecents_member', bob.userId, async (trx) => {
      const { rows } = await trx.raw(
        `SELECT c.id FROM app_private.transaction_transfer_candidates(?::app_private.transaction) c`,
        [row],
      )
      return rows
    })
    expect(candidates).toEqual([])
  })
})
