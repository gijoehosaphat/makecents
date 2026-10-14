import { Knex } from 'knex'

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries (bank accounts, transactions and the rest cascade from the account)
  await knex('app_private.account').del()

  // The workspace the seed user logs in to, owned by user 1 (see 01-users.ts)
  await knex('app_private.account').insert({ id: 1, user_id: 1, name: 'Demo' })
  await knex('app_private.account_member').insert({ account_id: 1, user_id: 1, role: 'owner' })

  // One of each main account type. The type values match what an OFX import produces.
  await knex('app_private.bank_account').insert([
    {
      id: 1,
      account_id: 1,
      bank_account_id: '1111222233334444',
      type: 'CHECKING',
      name: 'Everyday Checking',
      currency: 'CAD',
      user_id: 1,
    },
    {
      id: 2,
      account_id: 1,
      bank_account_id: '5555666677778888',
      type: 'SAVINGS',
      name: 'High Interest Savings',
      currency: 'CAD',
      user_id: 1,
    },
    {
      id: 3,
      account_id: 1,
      bank_account_id: '4500123412341234',
      type: 'CREDIT_CARD',
      name: 'Rewards Visa',
      currency: 'CAD',
      user_id: 1,
    },
  ])

  // Seeds use explicit ids, so move the sequences past them for rows created later
  for (const table of ['account', 'bank_account']) {
    await knex.raw(
      `SELECT setval(pg_get_serial_sequence('app_private.${table}', 'id'), (SELECT MAX(id) FROM app_private.${table}))`,
    )
  }
  // Opening balances are written by 04-transactions.ts, which knows what the transactions add up to
}
