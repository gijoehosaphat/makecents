import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').createTable('bank_csv_definition', function (table) {
    table.increments('id').primary().unique()
    table.timestamps(false, true)
    table.string('name').notNullable()
    table.jsonb('mapping').notNullable()
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.user')
      .index()
      .onDelete('CASCADE')
  })

  await knex.raw(`
    CREATE TRIGGER update_timestamp
    BEFORE UPDATE
    ON app_private.bank_csv_definition
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.update_timestamp();
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').dropTableIfExists('bank_csv_definition')
}
