import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`CREATE SCHEMA IF NOT EXISTS app_private`)

  // https://www.postgresql.org/docs/current/uuid-ossp.html
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
  // https://www.postgresql.org/docs/current/hstore.html
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "hstore"`)
  // https://www.postgresql.org/docs/current/citext.html
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "citext"`)

  await knex.schema.withSchema('app_private').createTable('user', function (table) {
    table.increments('id').primary().unique()
    table.timestamps(false, true)
    table.string('name')
    table.string('email').unique()
    table.string('image')
  })

  await knex.schema.withSchema('app_private').createTable('account', function (table) {
    table.increments('id').primary().unique()
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.user')
      .index()
      .onDelete('CASCADE')
    table.string('type')
    table.string('provider')
    table.string('provider_account_id')
    table.unique(['provider', 'provider_account_id'])
    table.string('refresh_token')
    table.string('access_token')
    table.string('expires_at')
    table.string('token_type')
    table.string('scope')
    table.string('id_token', 1500)
    table.string('session_state')
  })

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

  await knex.schema.withSchema('app_private').createTable('bank_account', function (table) {
    table.increments('id').primary().unique()
    table.timestamps(false, true)
    table.string('bank_account_id').unique()
    table.string('type')
    table.string('name').nullable()
    table.string('currency')
    table.bigInteger('balance')
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.user')
      .index()
      .onDelete('CASCADE')
  })

  await knex.schema.withSchema('app_private').createTable('category', function (table) {
    table.increments('id').primary().unique()
    table.timestamps(false, true)
    table.string('name')
    table.string('regex')
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.user')
      .index()
      .onDelete('CASCADE')
  })

  await knex.schema.withSchema('app_private').createTable('transaction', function (table) {
    table.increments('id').primary().unique()
    table.timestamps(false, true)
    table.timestamp('posted')
    table.bigInteger('amount')
    table.string('type')
    table.string('name')
    table.string('memo')
    table.string('bank_transaction_id').unique()
    table
      .integer('bank_account_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.bank_account')
      .index()
      .onDelete('CASCADE')
  })

  await knex.schema.withSchema('app_private').createTable('transaction_category', function (table) {
    table.increments('id').primary().unique()
    table
      .integer('bank_transaction_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.transaction')
      .index()
      .onDelete('CASCADE')
    table
      .integer('category_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('app_private.category')
      .index()
      .onDelete('CASCADE')
    table.integer('amount').unsigned().notNullable()
    table.unique(['bank_transaction_id', 'category_id'])
  })

  await knex.raw(`
    CREATE FUNCTION app_private.update_timestamp()
    RETURNS TRIGGER
    AS
    $function$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
    $function$
    LANGUAGE plpgsql;
  `)

  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON app_private.user
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.update_timestamp();
  `)

  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON app_private.bank_account
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.update_timestamp();
  `)

  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON app_private.category
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.update_timestamp();
  `)

  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON app_private.transaction
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.update_timestamp();
  `)

  await knex.schema.alterTable('knex_migrations', (table) => {
    table.comment('@omit')
  })
  await knex.schema.alterTable('knex_migrations_lock', (table) => {
    table.comment('@omit')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').dropTableIfExists('transaction_category')
  await knex.schema.withSchema('app_private').dropTableIfExists('transaction')
  await knex.schema.withSchema('app_private').dropTableIfExists('category')
  await knex.schema.withSchema('app_private').dropTableIfExists('bank_account')
  await knex.schema.withSchema('app_private').dropTableIfExists('account')
  await knex.schema.withSchema('app_private').dropTableIfExists('session')
  await knex.schema.withSchema('app_private').dropTableIfExists('verification_token')
  await knex.schema.withSchema('app_private').dropTableIfExists('user')
  await knex.raw(`DROP FUNCTION IF EXISTS app_private.update_timestamp() CASCADE;`)

  await knex.schema.alterTable('knex_migrations', (table) => {
    table.comment('')
  })
  await knex.schema.alterTable('knex_migrations_lock', (table) => {
    table.comment('')
  })

  await knex.raw(`DROP EXTENSION IF EXISTS "uuid-ossp"`)
  await knex.raw(`DROP EXTENSION IF EXISTS "hstore"`)
  await knex.raw(`DROP EXTENSION IF EXISTS "citext"`)

  await knex.raw(`DROP SCHEMA IF EXISTS app_private CASCADE`)
}

export const configuration = { transaction: true }
