import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Knex } from 'knex'
import { asRole, connect, createBankAccount, registerUser } from './helpers'

describe('reorder_bank_accounts', () => {
  let db: Knex
  let alice: { userId: number; accountId: number }
  let bob: { userId: number; accountId: number }
  let aliceIds: number[]
  let bobId: number

  beforeAll(async () => {
    db = connect()
    alice = await registerUser(db, 'alice-order@example.com')
    bob = await registerUser(db, 'bob-order@example.com')
    aliceIds = [
      await createBankAccount(db, alice.accountId, 'order-a'),
      await createBankAccount(db, alice.accountId, 'order-b'),
      await createBankAccount(db, alice.accountId, 'order-c'),
    ]
    bobId = await createBankAccount(db, bob.accountId, 'order-bob')
  })

  afterAll(async () => {
    await db.destroy()
  })

  function orderedIds(trx: Knex.Transaction, accountId: number) {
    return trx('app_private.bank_account')
      .where({ account_id: accountId })
      .orderByRaw('sort_order ASC NULLS LAST, id ASC')
      .pluck('id')
  }

  it('lists bank accounts in the order given', async () => {
    const reversed = [...aliceIds].reverse()
    const ids = await asRole(db, 'makecents_member', alice.userId, async (trx) => {
      await trx.raw(`SELECT * FROM app_private.reorder_bank_accounts(?, ?::int[])`, [alice.accountId, reversed])
      return orderedIds(trx, alice.accountId)
    })
    expect(ids).toEqual(reversed)
  })

  it('ignores bank accounts from other accounts', async () => {
    const sortOrder = await asRole(db, 'makecents_member', alice.userId, async (trx) => {
      await trx.raw(`SELECT * FROM app_private.reorder_bank_accounts(?, ?::int[])`, [bob.accountId, [bobId]])
      await trx.raw(`SELECT * FROM app_private.reorder_bank_accounts(?, ?::int[])`, [alice.accountId, [bobId]])
      await trx.raw(`RESET ROLE`)
      return (await trx('app_private.bank_account').where({ id: bobId }).first('sort_order')).sort_order
    })
    expect(sortOrder).toBeNull()
  })

  it('does not let a viewer reorder a shared account', async () => {
    await db('app_private.account_member').insert({ account_id: bob.accountId, user_id: alice.userId, role: 'viewer' })
    try {
      const updated = await asRole(db, 'makecents_member', alice.userId, async (trx) => {
        const { rows } = await trx.raw(`SELECT * FROM app_private.reorder_bank_accounts(?, ?::int[])`, [
          bob.accountId,
          [bobId],
        ])
        return rows.length
      })
      expect(updated).toBe(0)
    } finally {
      await db('app_private.account_member').where({ account_id: bob.accountId, user_id: alice.userId }).del()
    }
  })
})

describe('bank account types', () => {
  let db: Knex
  let owner: { userId: number; accountId: number }

  beforeAll(async () => {
    db = connect()
    owner = await registerUser(db, 'types@example.com')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('accepts the known types with any subtype', async () => {
    const id = await createBankAccount(db, owner.accountId, 'types-rrsp')
    await db('app_private.bank_account').where({ id }).update({ type: 'RETIREMENT', subtype: 'RRSP' })
    expect(await db('app_private.bank_account').where({ id }).first('type', 'subtype')).toEqual({
      type: 'RETIREMENT',
      subtype: 'RRSP',
    })
  })

  it('rejects types outside the list', async () => {
    const id = await createBankAccount(db, owner.accountId, 'types-bad')
    await expect(db('app_private.bank_account').where({ id }).update({ type: 'RRSP' })).rejects.toThrow(
      /bank_account_type_valid/,
    )
  })
})
