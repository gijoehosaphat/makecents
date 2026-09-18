import { Knex } from 'knex'

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries
  await knex('app_private.user').del()

  // Both seed users log in locally with the password "devpassword123"
  await knex('app_private.user').insert([
    {
      id: 1,
      email: 'joeleonard@gmail.com',
      password: knex.raw("public.crypt('devpassword123', public.gen_salt('bf'))"),
    },
    {
      id: 2,
      email: 'joeleonard+test@gmail.com',
      password: knex.raw("public.crypt('devpassword123', public.gen_salt('bf'))"),
    },
  ])
}
