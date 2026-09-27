import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('account', (table) => {
    table.text('name').nullable()
  })

  await knex.schema.withSchema('app_private').createTable('account_member', function (table) {
    table
      .integer('account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.account')
      .onDelete('CASCADE')
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.user')
      .index()
      .onDelete('CASCADE')
    table.text('role').notNullable().defaultTo('editor')
    table.timestamps(false, true)
    table.primary(['account_id', 'user_id'])
  })

  await knex.raw(`
    ALTER TABLE app_private.account_member
    ADD CONSTRAINT account_member_role_check CHECK (role IN ('owner', 'editor', 'viewer'))
  `)

  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON app_private.account_member
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.update_timestamp();
  `)

  // Every existing account becomes owned by the user it already belongs to.
  await knex.raw(`
    INSERT INTO app_private.account_member (account_id, user_id, role)
    SELECT id, user_id, 'owner'
    FROM app_private.account
  `)

  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.register_user(email text, password text, name text DEFAULT NULL)
    RETURNS app_private.user
    AS $$
    DECLARE
      new_user app_private.user;
      new_account app_private.account;
    BEGIN
      INSERT INTO app_private.user (email, password, name)
      VALUES (email, public.crypt(password, public.gen_salt('bf')), name)
      RETURNING * INTO new_user;

      INSERT INTO app_private.account (user_id) VALUES (new_user.id)
      RETURNING * INTO new_account;

      INSERT INTO app_private.account_member (account_id, user_id, role)
      VALUES (new_account.id, new_user.id, 'owner');

      RETURN new_user;
    END;
    $$
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.register_user(email text, password text, name text DEFAULT NULL)
    RETURNS app_private.user
    AS $$
    DECLARE
      new_user app_private.user;
    BEGIN
      INSERT INTO app_private.user (email, password, name)
      VALUES (email, public.crypt(password, public.gen_salt('bf')), name)
      RETURNING * INTO new_user;

      INSERT INTO app_private.account (user_id) VALUES (new_user.id);

      RETURN new_user;
    END;
    $$
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)

  await knex.schema.withSchema('app_private').dropTableIfExists('account_member')

  await knex.schema.withSchema('app_private').alterTable('account', (table) => {
    table.dropColumn('name')
  })
}

export const configuration = { transaction: true }
