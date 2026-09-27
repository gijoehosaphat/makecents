import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public`)

  await knex.schema.withSchema('app_private').alterTable('user', (table) => {
    table.text('password').nullable()
  })

  await knex.raw(`COMMENT ON COLUMN app_private.user.password IS '@omit'`)

  // Note: app_private.account is intentionally kept — despite its Auth.js-OAuth-shaped
  // columns, it doubles as this app's "workspace" table (category_group/custom_category_group
  // have NOT NULL FKs to it, and routing is keyed off its id). Only session/verification_token,
  // which have no dependents, are removed.
  await knex.schema.withSchema('app_private').dropTableIfExists('session')
  await knex.schema.withSchema('app_private').dropTableIfExists('verification_token')

  await knex.raw(`
    CREATE FUNCTION app_private.register_user(email text, password text, name text DEFAULT NULL)
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

  await knex.raw(`
    CREATE FUNCTION app_private.authenticate(email text, password text)
    RETURNS app_private.user
    AS $$
      SELECT u.*
      FROM app_private.user AS u
      WHERE u.email = authenticate.email
        AND u.password = public.crypt(authenticate.password, u.password);
    $$
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)

  await knex.raw(`
    CREATE FUNCTION app_private.change_user_password(user_id int, current_password text, new_password text)
    RETURNS boolean
    AS $$
    DECLARE
      matched boolean;
    BEGIN
      SELECT (password = public.crypt(current_password, password)) INTO matched
      FROM app_private.user
      WHERE id = user_id;

      IF matched IS NOT TRUE THEN
        RETURN false;
      END IF;

      UPDATE app_private.user
      SET password = public.crypt(new_password, public.gen_salt('bf'))
      WHERE id = user_id;

      RETURN true;
    END;
    $$
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS app_private.change_user_password(int, text, text)`)
  await knex.raw(`DROP FUNCTION IF EXISTS app_private.authenticate(text, text)`)
  await knex.raw(`DROP FUNCTION IF EXISTS app_private.register_user(text, text, text)`)

  await knex.schema.withSchema('app_private').createTable('session', function (table) {
    table.increments('id').primary().unique()
    table.timestamp('expires')
    table.string('session_token')
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.user')
      .index()
      .onDelete('CASCADE')
  })

  await knex.schema.withSchema('app_private').createTable('verification_token', function (table) {
    table.string('identifier')
    table.string('token')
    table.timestamp('expires')
  })

  await knex.schema.withSchema('app_private').alterTable('user', (table) => {
    table.dropColumn('password')
  })

  await knex.raw(`DROP EXTENSION IF EXISTS "pgcrypto"`)
}

export const configuration = { transaction: true }
