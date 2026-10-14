import { Knex } from 'knex'

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries (bank accounts, transactions and the rest cascade from the account)
  await knex('app_private.account').del()

  // The workspace the seed user logs in to, owned by user 1 (see 01-users.ts)
  await knex('app_private.account').insert({ id: 1, user_id: 1, name: 'Demo' })
  await knex('app_private.account_member').insert({ account_id: 1, user_id: 1, role: 'owner' })

  await knex('app_private.bank_account').insert([
    {
      id: 1,
      account_id: 1,
      bank_account_id: '123456',
      type: 'Checking',
      name: 'Checking',
      currency: 'CAD',
      user_id: 1,
    },
    { id: 2, account_id: 1, bank_account_id: 'abc123', type: 'Savings', name: 'Savings', currency: 'CAD', user_id: 1 },
    {
      id: 3,
      account_id: 1,
      bank_account_id: 'asdfgh',
      type: 'Checking',
      name: 'Checking',
      currency: 'CAD',
      user_id: 1,
    },
  ])

  // Starting balances; transactions are summed on top of these
  await knex('app_private.bank_account_reconciliation').insert(
    [1, 2, 3].map((bank_account_id) => ({ bank_account_id, balance: 0, as_of: '2000-01-01' })),
  )

  // Seeds use explicit ids, so move the sequences past them for rows created later
  for (const table of ['account', 'bank_account']) {
    await knex.raw(
      `SELECT setval(pg_get_serial_sequence('app_private.${table}', 'id'), (SELECT MAX(id) FROM app_private.${table}))`,
    )
  }
}
