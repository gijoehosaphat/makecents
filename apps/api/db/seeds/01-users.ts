import { Knex } from 'knex'

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex('app_private.user').del()

  // Inserts seed entries
  await knex('app_private.user').insert([
    {
      id: 1,
      email: 'joeleonard@gmail.com',
      role: 'authenticated_users',
      password: '$2a$06$cSBCXjPrUCgdzQ9wzQ8UoOHLpvByDG1JdqtiSPCMmXIgu9N/geNOC',
    },
    {
      id: 2,
      email: 'joeleonard+test@gmail.com',
      role: 'authenticated_users',
      password: '$2a$06$cSBCXjPrUCgdzQ9wzQ8UoOHLpvByDG1JdqtiSPCMmXIgu9N/geNOC',
    },
  ])
}
