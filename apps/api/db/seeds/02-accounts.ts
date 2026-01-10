import { Knex } from 'knex'

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex('app_private.account').del()

  // Inserts seed entries
  await knex('app_private.account').insert([
    { id: 1, bank_account_id: '123456', type: 'Checking', name: 'Checking', currency: 'CAD', balance: 0, user_id: 2 },
    { id: 2, bank_account_id: 'abc123', type: 'Savings', name: 'Savings', currency: 'CAD', balance: 0, user_id: 2 },
    { id: 3, bank_account_id: 'asdfgh', type: 'Checking', name: 'Checking', currency: 'CAD', balance: 0, user_id: 2 },
  ])
}
