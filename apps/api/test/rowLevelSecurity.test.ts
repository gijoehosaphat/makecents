import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Knex } from 'knex'
import { asRole, connect, createBankAccount, registerUser } from './helpers'

describe('row-level security', () => {
  let db: Knex
  let alice: { userId: number; accountId: number; bankAccountId: number }
  let bob: { userId: number; accountId: number; bankAccountId: number }

  beforeAll(async () => {
    db = connect()
    const aliceUser = await registerUser(db, 'alice@example.com')
    const bobUser = await registerUser(db, 'bob@example.com')
    alice = { ...aliceUser, bankAccountId: await createBankAccount(db, aliceUser.accountId, 'alice-checking') }
    bob = { ...bobUser, bankAccountId: await createBankAccount(db, bobUser.accountId, 'bob-checking') }
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('registering a user makes them the owner of a new account', async () => {
    const { rows } = await db.raw(`SELECT role FROM app_private.account_member WHERE user_id = ?`, [alice.userId])
    expect(rows).toEqual([{ role: 'owner' }])
  })

  it('lets a member see only the bank accounts of their own accounts', async () => {
    const ids = await asRole(db, 'makecents_member', alice.userId, async (trx) =>
      (await trx('app_private.bank_account').select('id')).map((row) => row.id),
    )
    expect(ids).toEqual([alice.bankAccountId])
  })

  it('stops a member writing into another account', async () => {
    await expect(
      asRole(db, 'makecents_member', alice.userId, (trx) =>
        trx('app_private.bank_account').insert({
          account_id: bob.accountId,
          name: 'sneaky',
          bank_account_id: 'sneaky',
        }),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('stops a member updating or deleting rows they cannot see', async () => {
    const [updated, deleted] = await asRole(db, 'makecents_member', alice.userId, async (trx) => [
      await trx('app_private.bank_account').where({ id: bob.bankAccountId }).update({ name: 'hijacked' }),
      await trx('app_private.bank_account').where({ id: bob.bankAccountId }).del(),
    ])
    expect(updated).toBe(0)
    expect(deleted).toBe(0)
  })

  it('lets a viewer read a shared account but not write to it', async () => {
    await db('app_private.account_member').insert({ account_id: bob.accountId, user_id: alice.userId, role: 'viewer' })
    try {
      const ids = await asRole(db, 'makecents_member', alice.userId, async (trx) =>
        (await trx('app_private.bank_account').select('id').orderBy('id')).map((row) => row.id),
      )
      expect(ids).toEqual([alice.bankAccountId, bob.bankAccountId])

      await expect(
        asRole(db, 'makecents_member', alice.userId, (trx) =>
          trx('app_private.bank_account').insert({ account_id: bob.accountId, name: 'nope', bank_account_id: 'nope' }),
        ),
      ).rejects.toThrow(/row-level security/)
    } finally {
      await db('app_private.account_member').where({ account_id: bob.accountId, user_id: alice.userId }).del()
    }
  })

  it('gives anonymous requests no access to data', async () => {
    await expect(
      asRole(db, 'makecents_anonymous', null, (trx) => trx('app_private.bank_account').select('id')),
    ).rejects.toThrow(/permission denied/)
  })

  it('lets anonymous requests sign up and sign in', async () => {
    const authenticated = await asRole(db, 'makecents_anonymous', null, async (trx) => {
      await trx.raw(`SELECT app_private.register_user('carol@example.com', 'a-long-enough-password', 'Carol')`)
      const { rows } = await trx.raw(
        `SELECT id FROM app_private.authenticate('carol@example.com', 'a-long-enough-password')`,
      )
      const { rows: wrong } = await trx.raw(
        `SELECT id FROM app_private.authenticate('carol@example.com', 'wrong-password')`,
      )
      return { right: rows[0]?.id, wrong: wrong[0]?.id }
    })
    expect(authenticated.right).toEqual(expect.any(Number))
    expect(authenticated.wrong).toBeNull()
  })
})
