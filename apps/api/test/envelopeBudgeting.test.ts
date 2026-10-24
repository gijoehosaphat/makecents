import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Knex } from 'knex'
import { asRole, connect, createBankAccount, registerUser } from './helpers'
import { ACCRUED_AMOUNT_FUNCTION, convertAccruingBudgets } from '../db/migrations/20261019130000_envelope-budgeting'

const HALIFAX = 'America/Halifax'
const BERLIN = 'Europe/Berlin'

class Rollback extends Error {}

/** Runs `fn` in a transaction that is always rolled back. */
async function rolledBack(db: Knex, fn: (trx: Knex.Transaction) => Promise<void>) {
  await db
    .transaction(async (trx) => {
      await fn(trx)
      throw new Rollback()
    })
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error
    })
}

type Owner = { userId: number; accountId: number; bankAccountId: number }

async function createOwner(db: Knex, email: string): Promise<Owner> {
  const user = await registerUser(db, email)
  return { ...user, bankAccountId: await createBankAccount(db, user.accountId, email) }
}

async function createCategory(db: Knex, accountId: number, name: string, kind = 'spending') {
  const [row] = await db('app_private.category').insert({ account_id: accountId, name, kind }).returning('id')
  return row.id as number
}

async function createBudget(db: Knex, accountId: number, name: string, categoryIds: number[]) {
  const [row] = await db('app_private.budget').insert({ account_id: accountId, name, amount: 10000 }).returning('id')
  for (const categoryId of categoryIds) {
    await db('app_private.budget_category').insert({
      account_id: accountId,
      budget_id: row.id,
      category_id: categoryId,
    })
  }
  return row.id as number
}

let transactionCount = 0

/**
 * Posted at local midnight in Atlantic time (UTC-3 in summer), as imported transactions are; `date` can also be a
 * full timestamp.
 */
async function createTransaction(
  db: Knex,
  bankAccountId: number,
  date: string,
  amount: number,
  categoryId: number | null,
  extra: Record<string, unknown> = {},
) {
  const [row] = await db('app_private.transaction')
    .insert({
      bank_account_id: bankAccountId,
      bank_transaction_id: `envelope-${++transactionCount}`,
      posted: date.includes('T') ? date : `${date}T03:00:00Z`,
      amount,
      original_amount: amount,
      category_id: categoryId,
      ...extra,
    })
    .returning('id')
  return row.id as number
}

describe('accrued amount used to convert accruing budgets', () => {
  let db: Knex

  beforeAll(() => {
    db = connect()
  })

  afterAll(async () => {
    await db.destroy()
  })

  // The same cases as accruedAmount in apps/web/src/lib/budgetMath.test.ts.
  it.each([
    ['is zero before the effective month', 31000, '2026-10-15', '2026-09-30', 0],
    ['prorates a whole effective month', 31000, '2026-10-01', '2026-10-31', 31000],
    ['counts the effective day', 31000, '2026-10-15', '2026-10-31', 17000],
    ['counts a single day', 31000, '2026-10-15', '2026-10-15', 1000],
    ['adds a full amount per later month', 31000, '2026-10-15', '2026-11-30', 17000 + 31000],
    ['spans whole months', 10000, '2026-01-01', '2026-03-31', 30000],
    ['handles an effective date on the 31st', 31000, '2026-01-31', '2026-02-28', 1000 + 31000],
    ['rounds the prorated month down', 20000, '2024-01-02', '2024-01-31', 19354],
    ['spans years', 20000, '2024-01-02', '2026-09-30', 19354 + 32 * 20000],
  ])('%s', async (_name, monthly, effective, asOf, expected) => {
    const result = await db.transaction(async (trx) => {
      await trx.raw(ACCRUED_AMOUNT_FUNCTION)
      const { rows } = await trx.raw(`SELECT pg_temp.accrued_amount(?, ?::date, ?::date) AS amount`, [
        monthly,
        effective,
        asOf,
      ])
      await trx.raw(`DROP FUNCTION pg_temp.accrued_amount(bigint, date, date)`)
      return rows[0].amount
    })
    expect(Number(result)).toBe(expected)
  })
})

describe('envelope budgeting', () => {
  let db: Knex
  let alice: Owner
  let bob: Owner
  let groceries: number
  let dining: number
  let payroll: number
  let gifts: number
  let groceriesBudget: number
  let diningBudget: number
  let bobBudget: number

  beforeAll(async () => {
    db = connect()
    alice = await createOwner(db, 'alice-envelope@example.com')
    bob = await createOwner(db, 'bob-envelope@example.com')
    groceries = await createCategory(db, alice.accountId, 'Groceries')
    dining = await createCategory(db, alice.accountId, 'Dining')
    payroll = await createCategory(db, alice.accountId, 'Payroll', 'payroll')
    gifts = await createCategory(db, alice.accountId, 'Gifts received')
    groceriesBudget = await createBudget(db, alice.accountId, 'Groceries', [groceries])
    diningBudget = await createBudget(db, alice.accountId, 'Dining', [dining])
    bobBudget = await createBudget(db, bob.accountId, 'Bob', [await createCategory(db, bob.accountId, 'Bob')])
    // A fixed start, so the tests do not depend on the month they run in.
    await db('app_private.account').where({ id: alice.accountId }).update({ envelope_start_month: '2026-10-01' })

    // October: groceries spent with a refund, one transaction on each side of the month boundary.
    await createTransaction(db, alice.bankAccountId, '2026-09-30', -999, groceries)
    await createTransaction(db, alice.bankAccountId, '2026-10-01', -5000, groceries)
    await createTransaction(db, alice.bankAccountId, '2026-10-12', 700, groceries)
    await createTransaction(db, alice.bankAccountId, '2026-10-31', -1000, groceries)
    await createTransaction(db, alice.bankAccountId, '2026-11-01', -333, groceries)
    // A split: 3000 total, 1200 of it dining, the 1800 remainder groceries.
    const parent = await createTransaction(db, alice.bankAccountId, '2026-10-20', -3000, groceries)
    await createTransaction(db, alice.bankAccountId, '2026-10-20', -1200, dining, { split_source_id: parent })
    // A transfer between Alice's own accounts, categorized as groceries by mistake: not activity.
    const savings = await createBankAccount(db, alice.accountId, 'alice-envelope-savings')
    const out = await createTransaction(db, alice.bankAccountId, '2026-10-05', -50000, groceries)
    const into = await createTransaction(db, savings, '2026-10-05', 50000, null)
    await db('app_private.transfer').insert({ transaction_source_id: out, transaction_target_id: into })
    // Money outside any envelope.
    await createTransaction(db, alice.bankAccountId, '2026-10-15', 400000, payroll)
    await createTransaction(db, alice.bankAccountId, '2026-10-16', 2500, gifts)
    await createTransaction(db, alice.bankAccountId, '2026-10-17', -800, null)
    await createTransaction(db, alice.bankAccountId, '2026-10-18', -200, gifts)
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('starts a new account in the month it was created', async () => {
    const { rows } = await db.raw(
      `SELECT envelope_start_month = date_trunc('month', now())::date AS current, envelope_starting_balance::int AS balance
       FROM app_private.account WHERE id = ?`,
      [bob.accountId],
    )
    expect(rows[0]).toEqual({ current: true, balance: 0 })
  })

  it('only allows a category in one budget', async () => {
    await expect(
      db('app_private.budget_category').insert({
        account_id: alice.accountId,
        budget_id: diningBudget,
        category_id: groceries,
      }),
    ).rejects.toThrow(/budget_category_category_id_unique/)
  })

  it('sums activity per budget and month from the start month, leaving out transfers', async () => {
    const rows = await asRole(db, 'makecents_member', alice.userId, async (trx) => {
      const { rows } = await trx.raw(
        `SELECT budget_id, month::text, activity::int FROM app_private.budget_monthly_activity(?, '2026-11-01', ?) ORDER BY month, budget_id`,
        [alice.accountId, HALIFAX],
      )
      return rows
    })
    expect(rows).toEqual([
      { budget_id: groceriesBudget, month: '2026-10-01', activity: -5000 + 700 - 1000 - 1800 },
      { budget_id: diningBudget, month: '2026-10-01', activity: -1200 },
      { budget_id: groceriesBudget, month: '2026-11-01', activity: -333 },
    ])
  })

  it('reports another account as having no activity', async () => {
    const rows = await asRole(db, 'makecents_member', bob.userId, async (trx) => {
      const { rows } = await trx.raw(`SELECT * FROM app_private.budget_monthly_activity(?, '2026-11-01', ?)`, [
        alice.accountId,
        HALIFAX,
      ])
      return rows
    })
    expect(rows).toEqual([])
  })

  it('splits money outside the envelopes into payroll, inflow and outflow', async () => {
    const rows = await asRole(db, 'makecents_member', alice.userId, async (trx) => {
      const { rows } = await trx.raw(
        `SELECT month::text, payroll::int, unbudgeted_inflow::int, unbudgeted_outflow::int
         FROM app_private.envelope_unbudgeted_monthly(?, '2026-10-01', ?)`,
        [alice.accountId, HALIFAX],
      )
      return rows
    })
    expect(rows).toEqual([{ month: '2026-10-01', payroll: 400000, unbudgeted_inflow: 2500, unbudgeted_outflow: -1000 }])
  })

  it('lets a viewer read the monthly figures of a shared account', async () => {
    await db('app_private.account_member').insert({ account_id: alice.accountId, user_id: bob.userId, role: 'viewer' })
    try {
      const counts = await asRole(db, 'makecents_member', bob.userId, async (trx) => {
        const activity = await trx.raw(`SELECT * FROM app_private.budget_monthly_activity(?, '2026-11-01', ?)`, [
          alice.accountId,
          HALIFAX,
        ])
        const unbudgeted = await trx.raw(`SELECT * FROM app_private.envelope_unbudgeted_monthly(?, '2026-11-01', ?)`, [
          alice.accountId,
          HALIFAX,
        ])
        return [activity.rows.length, unbudgeted.rows.length]
      })
      expect(counts).toEqual([3, 1])
    } finally {
      await db('app_private.account_member').where({ account_id: alice.accountId, user_id: bob.userId }).del()
    }
  })

  it('buckets by local month in a time zone ahead of UTC', async () => {
    const carol = await createOwner(db, 'carol-envelope@example.com')
    const food = await createCategory(db, carol.accountId, 'Food')
    const foodBudget = await createBudget(db, carol.accountId, 'Food', [food])
    const salary = await createCategory(db, carol.accountId, 'Salary', 'payroll')
    await db('app_private.account').where({ id: carol.accountId }).update({ envelope_start_month: '2026-10-01' })
    // Local midnight in Berlin: Oct 1 is still Sep 30 in UTC, and Nov 1 is still Oct 31.
    await createTransaction(db, carol.bankAccountId, '2026-09-29T22:00:00Z', -111, food) // Sep 30, before the start
    await createTransaction(db, carol.bankAccountId, '2026-09-30T22:00:00Z', -1000, food) // Oct 1
    await createTransaction(db, carol.bankAccountId, '2026-10-31T23:00:00Z', -2000, food) // Nov 1
    await createTransaction(db, carol.bankAccountId, '2026-10-31T23:00:00Z', 300000, salary) // Nov 1

    const { activity, unbudgeted } = await asRole(db, 'makecents_member', carol.userId, async (trx) => ({
      activity: (
        await trx.raw(
          `SELECT budget_id, month::text, activity::int FROM app_private.budget_monthly_activity(?, '2026-11-01', ?) ORDER BY month`,
          [carol.accountId, BERLIN],
        )
      ).rows,
      unbudgeted: (
        await trx.raw(
          `SELECT month::text, payroll::int FROM app_private.envelope_unbudgeted_monthly(?, '2026-11-01', ?)`,
          [carol.accountId, BERLIN],
        )
      ).rows,
    }))
    expect(activity).toEqual([
      { budget_id: foodBudget, month: '2026-10-01', activity: -1000 },
      { budget_id: foodBudget, month: '2026-11-01', activity: -2000 },
    ])
    expect(unbudgeted).toEqual([{ month: '2026-11-01', payroll: 300000 }])
  })

  describe('move_budget_money', () => {
    const move = (
      trx: Knex.Transaction,
      from: number | null,
      to: number | null,
      amount: number,
      month = '2026-10-15',
    ) =>
      trx.raw(`SELECT * FROM app_private.move_budget_money(?, ?::date, ?, ?, ?)`, [
        alice.accountId,
        month,
        from,
        to,
        amount,
      ])

    const assignments = (trx: Knex.Transaction) =>
      trx('app_private.budget_assignment')
        .where({ account_id: alice.accountId })
        .orderBy('budget_id')
        .select('budget_id', db.raw('month::text'), db.raw('amount::int'))

    it('assigns from Ready to Assign and moves between budgets on the first of the month', async () => {
      const rows = await asRole(db, 'makecents_member', alice.userId, async (trx) => {
        await move(trx, null, groceriesBudget, 30000)
        await move(trx, groceriesBudget, diningBudget, 4000)
        await move(trx, diningBudget, null, 1000)
        return assignments(trx)
      })
      expect(rows).toEqual([
        { budget_id: groceriesBudget, month: '2026-10-01', amount: 26000 },
        { budget_id: diningBudget, month: '2026-10-01', amount: 3000 },
      ])
    })

    it('rejects non-positive amounts, the same budget twice and months before the start', async () => {
      await expect(
        asRole(db, 'makecents_member', alice.userId, (trx) => move(trx, null, diningBudget, 0)),
      ).rejects.toThrow(/must be positive/)
      await expect(
        asRole(db, 'makecents_member', alice.userId, (trx) => move(trx, diningBudget, diningBudget, 100)),
      ).rejects.toThrow(/two different budgets/)
      await expect(
        asRole(db, 'makecents_member', alice.userId, (trx) => move(trx, null, diningBudget, 100, '2026-09-30')),
      ).rejects.toThrow(/before the budget start month/)
    })

    it('rejects a budget from another account', async () => {
      await expect(
        asRole(db, 'makecents_member', alice.userId, (trx) => move(trx, groceriesBudget, bobBudget, 100)),
      ).rejects.toThrow(/belongs to another account/)
    })

    it('does not let a viewer move money', async () => {
      await db('app_private.account_member').insert({
        account_id: alice.accountId,
        user_id: bob.userId,
        role: 'viewer',
      })
      try {
        await expect(
          asRole(db, 'makecents_member', bob.userId, (trx) =>
            trx.raw(`SELECT * FROM app_private.move_budget_money(?, '2026-10-01', NULL, ?, 100)`, [
              alice.accountId,
              groceriesBudget,
            ]),
          ),
        ).rejects.toThrow(/row-level security/)
      } finally {
        await db('app_private.account_member').where({ account_id: alice.accountId, user_id: bob.userId }).del()
      }
    })
  })

  it('stops a member reading or writing another account’s assignments', async () => {
    await db('app_private.budget_assignment').insert({
      account_id: bob.accountId,
      budget_id: bobBudget,
      month: '2026-10-01',
      amount: 500,
    })
    const visible = await asRole(db, 'makecents_member', alice.userId, (trx) =>
      trx('app_private.budget_assignment').where({ budget_id: bobBudget }).select('id'),
    )
    expect(visible).toEqual([])
    await expect(
      asRole(db, 'makecents_member', alice.userId, (trx) =>
        trx('app_private.budget_assignment').insert({
          account_id: bob.accountId,
          budget_id: bobBudget,
          month: '2026-11-01',
          amount: 1,
        }),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it('rejects an assignment month that is not the first of the month', async () => {
    await expect(
      db('app_private.budget_assignment').insert({
        account_id: alice.accountId,
        budget_id: groceriesBudget,
        month: '2026-10-02',
        amount: 1,
      }),
    ).rejects.toThrow(/budget_assignment_month_first/)
  })
})

describe('converting accruing budgets', () => {
  let db: Knex
  let dana: Owner

  beforeAll(async () => {
    db = connect()
    dana = await createOwner(db, 'dana-convert@example.com')
  })

  afterAll(async () => {
    await db.destroy()
  })

  it('opens funds with their balance, takes overspent funds from Ready to Assign and assigns planned amounts', async () => {
    await rolledBack(db, async (trx) => {
      // The column the conversion reads; the migration dropped it afterwards.
      await trx.raw(`ALTER TABLE app_private.budget ADD COLUMN effective_date timestamptz`)
      await trx('app_private.account').where({ id: dana.accountId }).update({ envelope_start_month: '2026-10-01' })
      const { rows: before } = await trx.raw(`SELECT current_setting('TimeZone') AS zone`)

      const saved = await createCategory(trx, dana.accountId, 'Saved')
      const spent = await createCategory(trx, dana.accountId, 'Spent')
      const fixed = await createCategory(trx, dana.accountId, 'Fixed')
      const addBudget = async (category: number, amount: number, effective: string | null, starting = 0) => {
        const [row] = await trx('app_private.budget')
          .insert({
            account_id: dana.accountId,
            name: `b${category}`,
            amount,
            effective_date: effective,
            starting_amount: starting,
          })
          .returning('id')
        await trx('app_private.budget_category').insert({
          account_id: dana.accountId,
          budget_id: row.id,
          category_id: category,
        })
        return row.id as number
      }
      // Entered on the evening of Sep 1 in Halifax, already Sep 2 in UTC: a full September accrues.
      const savedFund = await addBudget(saved, 10000, '2026-09-02T01:00:00Z', 500)
      const spentFund = await addBudget(spent, 5000, '2026-09-01T03:00:00Z')
      const fixedBudget = await addBudget(fixed, 20000, null)

      await createTransaction(trx, dana.bankAccountId, '2026-08-30', -100, saved) // before the effective date
      await createTransaction(trx, dana.bankAccountId, '2026-09-20', -2000, saved)
      await createTransaction(trx, dana.bankAccountId, '2026-10-03', -700, saved) // after the start month
      await createTransaction(trx, dana.bankAccountId, '2026-09-10', -8000, spent)

      await convertAccruingBudgets(trx, { timeZone: HALIFAX, accountIds: [dana.accountId] })

      const opening = await trx('app_private.budget')
        .where({ account_id: dana.accountId })
        .orderBy('id')
        .select('id', trx.raw('starting_amount::int'))
      expect(opening).toEqual([
        { id: savedFund, starting_amount: 500 + 10000 - 2000 },
        { id: spentFund, starting_amount: 0 },
        { id: fixedBudget, starting_amount: 0 },
      ])
      const account = await trx('app_private.account')
        .where({ id: dana.accountId })
        .first(trx.raw('envelope_starting_balance::int AS balance'))
      expect(account.balance).toBe(5000 - 8000)
      const assignments = await trx('app_private.budget_assignment')
        .where({ account_id: dana.accountId })
        .orderBy('budget_id')
        .select('budget_id', trx.raw('month::text'), trx.raw('amount::int'))
      expect(assignments).toEqual([
        { budget_id: savedFund, month: '2026-10-01', amount: 10000 },
        { budget_id: spentFund, month: '2026-10-01', amount: 5000 },
        { budget_id: fixedBudget, month: '2026-10-01', amount: 20000 },
      ])
      const { rows: after } = await trx.raw(`SELECT current_setting('TimeZone') AS zone`)
      expect(after).toEqual(before)
    })
  })
})

describe('cash on hand', () => {
  let db: Knex
  let erin: Owner
  let frank: Owner

  beforeAll(async () => {
    db = connect()
    erin = await createOwner(db, 'erin-cash@example.com')
    frank = await createOwner(db, 'frank-cash@example.com')
  })

  afterAll(async () => {
    await db.destroy()
  })

  const setCash = (trx: Knex.Transaction, accountId: number, amount: number | null) =>
    trx.raw(`SELECT envelope_cash_on_hand::int AS cash FROM app_private.set_envelope_cash_on_hand(?, ?)`, [
      accountId,
      amount,
    ])

  it('is unset for a new account', async () => {
    const row = await db('app_private.account').where({ id: erin.accountId }).first('envelope_cash_on_hand')
    expect(row.envelope_cash_on_hand).toBeNull()
  })

  it('lets an owner or editor set and clear it', async () => {
    await db('app_private.account_member').insert({ account_id: erin.accountId, user_id: frank.userId, role: 'editor' })
    try {
      const results = await asRole(db, 'makecents_member', frank.userId, async (trx) => [
        (await setCash(trx, erin.accountId, 1234567)).rows[0].cash,
        (await setCash(trx, erin.accountId, null)).rows[0].cash,
      ])
      expect(results).toEqual([1234567, null])
    } finally {
      await db('app_private.account_member').where({ account_id: erin.accountId, user_id: frank.userId }).del()
    }
  })

  it('does not let a viewer or another account change it', async () => {
    await expect(
      asRole(db, 'makecents_member', frank.userId, (trx) => setCash(trx, erin.accountId, 100)),
    ).rejects.toThrow(/cannot change the budget/)
    await db('app_private.account_member').insert({ account_id: erin.accountId, user_id: frank.userId, role: 'viewer' })
    try {
      await expect(
        asRole(db, 'makecents_member', frank.userId, (trx) => setCash(trx, erin.accountId, 100)),
      ).rejects.toThrow(/cannot change the budget/)
    } finally {
      await db('app_private.account_member').where({ account_id: erin.accountId, user_id: frank.userId }).del()
    }
  })
})
