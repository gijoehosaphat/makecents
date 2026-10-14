import knex, { Knex } from 'knex'
import { inject } from 'vitest'

export function connect(): Knex {
  return knex({ client: 'pg', connection: inject('databaseUrl'), pool: { min: 0, max: 2 } })
}

type Role = 'makecents_member' | 'makecents_anonymous'

/**
 * Runs `fn` the way the API does for a request: in a transaction, as a restricted role, with the
 * user id claim set. The transaction is always rolled back, so tests leave no data behind.
 */
export async function asRole<T>(
  db: Knex,
  role: Role,
  userId: number | null,
  fn: (trx: Knex.Transaction) => Promise<T>,
) {
  let result!: T
  await db
    .transaction(async (trx) => {
      await trx.raw(`SET LOCAL ROLE ${role}`)
      if (userId !== null) {
        await trx.raw(`SELECT set_config('jwt.claims.user_id', ?, true)`, [String(userId)])
      }
      result = await fn(trx)
      throw new Rollback()
    })
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error
    })
  return result
}

class Rollback extends Error {}

/** Registers a user (which also creates their account) and returns the ids. */
export async function registerUser(db: Knex, email: string) {
  const {
    rows: [user],
  } = await db.raw(`SELECT id FROM app_private.register_user(?, 'a-long-enough-password', ?)`, [email, email])
  const {
    rows: [member],
  } = await db.raw(`SELECT account_id FROM app_private.account_member WHERE user_id = ?`, [user.id])
  return { userId: user.id as number, accountId: member.account_id as number }
}

export async function createBankAccount(db: Knex, accountId: number, name: string) {
  const [row] = await db('app_private.bank_account')
    .insert({ account_id: accountId, name, bank_account_id: `${name}-${accountId}`, currency: 'CAD', type: 'CHECKING' })
    .returning('id')
  return row.id as number
}
