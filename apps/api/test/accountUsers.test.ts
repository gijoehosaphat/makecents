import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Knex } from 'knex'
import { asRole, connect, registerUser } from './helpers'

describe('account user management', () => {
  let db: Knex
  let owner: { userId: number; accountId: number }
  let other: { userId: number; accountId: number }

  beforeAll(async () => {
    db = connect()
    owner = await registerUser(db, 'primary@example.com')
    other = await registerUser(db, 'other-primary@example.com')
  })

  afterAll(async () => {
    await db.destroy()
  })

  const addUser = (trx: Knex.Transaction, accountId: number, email: string, password = 'a-long-enough-password') =>
    trx
      .raw(`SELECT id FROM app_private.add_account_user(?, ?, ?, 'New User')`, [accountId, email, password])
      .then(({ rows }) => rows[0].id as number)

  it('lets the primary user add a user who can sign in and use the account', async () => {
    const result = await asRole(db, 'makecents_member', owner.userId, async (trx) => {
      const userId = await addUser(trx, owner.accountId, 'added@example.com')
      const { rows: members } = await trx.raw(
        `SELECT account_id, role FROM app_private.account_member WHERE user_id = ?`,
        [userId],
      )
      const { rows: signedIn } = await trx.raw(
        `SELECT id FROM app_private.authenticate('added@example.com', 'a-long-enough-password')`,
      )
      return { userId, members, signedInId: signedIn[0]?.id }
    })
    expect(result.members).toEqual([{ account_id: owner.accountId, role: 'editor' }])
    expect(result.signedInId).toBe(result.userId)
  })

  it('stops a member who is not the primary user from adding users', async () => {
    await expect(
      asRole(db, 'makecents_member', other.userId, (trx) => addUser(trx, owner.accountId, 'sneaky@example.com')),
    ).rejects.toThrow(/Only the primary user/)

    await expect(
      asRole(db, 'makecents_member', owner.userId, async (trx) => {
        const editorId = await addUser(trx, owner.accountId, 'editor@example.com')
        await trx.raw(`SELECT set_config('jwt.claims.user_id', ?, true)`, [String(editorId)])
        return addUser(trx, owner.accountId, 'another@example.com')
      }),
    ).rejects.toThrow(/Only the primary user/)
  })

  it('refuses an email that already belongs to a user', async () => {
    await expect(
      asRole(db, 'makecents_member', owner.userId, (trx) => addUser(trx, owner.accountId, 'OTHER-primary@example.com')),
    ).rejects.toThrow(/already exists/)
  })

  it('refuses a short password', async () => {
    await expect(
      asRole(db, 'makecents_member', owner.userId, (trx) =>
        addUser(trx, owner.accountId, 'short@example.com', 'short'),
      ),
    ).rejects.toThrow(/at least 8/)
  })

  it('lets the primary user remove an added user, but not themselves', async () => {
    const result = await asRole(db, 'makecents_member', owner.userId, async (trx) => {
      const userId = await addUser(trx, owner.accountId, 'removed@example.com')
      const { rows: removed } = await trx.raw(`SELECT app_private.remove_account_user(?, ?) AS removed`, [
        owner.accountId,
        userId,
      ])
      const { rows: self } = await trx.raw(`SELECT app_private.remove_account_user(?, ?) AS removed`, [
        owner.accountId,
        owner.userId,
      ])
      const { rows: signedIn } = await trx.raw(
        `SELECT id FROM app_private.authenticate('removed@example.com', 'a-long-enough-password')`,
      )
      return { removed: removed[0].removed, self: self[0].removed, signedInId: signedIn[0]?.id ?? null }
    })
    expect(result).toEqual({ removed: true, self: false, signedInId: null })
  })

  it('keeps an account to a single primary user', async () => {
    await expect(
      db('app_private.account_member').insert({ account_id: owner.accountId, user_id: other.userId, role: 'owner' }),
    ).rejects.toThrow(/account_member_one_owner/)
  })

  it('does not let anonymous requests add users', async () => {
    await expect(
      asRole(db, 'makecents_anonymous', null, (trx) => addUser(trx, owner.accountId, 'anon@example.com')),
    ).rejects.toThrow(/permission denied/)
  })
})
