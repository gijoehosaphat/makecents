import { Knex } from 'knex'

const MEMBER_ROLE = 'makecents_member'

// How a category counts towards the monthly plan: 'payroll' categories are the basis for expected income;
// everything else is 'spending'. Budgets are no longer reconciled month by month (a budget is simply held to its
// own amount), so the reconciliation table goes away. Rolling that back recreates the empty table, not the rows.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('category', (table) => {
    // Indexed so PostGraphile exposes it as a filter (ignoreIndexes is off).
    table.text('kind').notNullable().defaultTo('spending').index()
  })
  await knex.raw(`
    ALTER TABLE app_private.category
    ADD CONSTRAINT category_kind_check CHECK (kind IN ('spending', 'payroll'))
  `)

  // A starting point inferred from existing names; it can be changed per category in the app.
  await knex.raw(`
    UPDATE app_private.category
    SET kind = 'payroll'
    WHERE name ILIKE 'payroll%' AND name NOT ILIKE '%expense%'
  `)

  await knex.schema.withSchema('app_private').dropTableIfExists('budget_reconsiliation')
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').createTable('budget_reconsiliation', function (table) {
    table.increments('id').primary().unique()
    table.timestamps(false, true)
    table
      .integer('budget_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('app_private.budget')
      .index()
      .onDelete('CASCADE')
    table.bigInteger('amount').notNullable()
    table.integer('year').unsigned().notNullable().index()
    table.integer('month').unsigned().notNullable().index()
    table.unique(['budget_id', 'year', 'month'])
  })

  const visible = (writable: boolean) =>
    `budget_id IN (SELECT id FROM app_private.budget WHERE account_id IN (SELECT app_private.current_user_account_ids(${writable})))`
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON app_private.budget_reconsiliation TO ${MEMBER_ROLE}`)
  await knex.raw(`ALTER TABLE app_private.budget_reconsiliation ENABLE ROW LEVEL SECURITY`)
  await knex.raw(`CREATE POLICY budget_reconsiliation_select ON app_private.budget_reconsiliation FOR SELECT USING (${visible(false)})`)
  await knex.raw(`
    CREATE POLICY budget_reconsiliation_write ON app_private.budget_reconsiliation FOR ALL
    USING (${visible(true)}) WITH CHECK (${visible(true)})
  `)

  await knex.raw(`ALTER TABLE app_private.category DROP CONSTRAINT category_kind_check`)
  await knex.schema.withSchema('app_private').alterTable('category', (table) => {
    table.dropColumn('kind')
  })
}

export const configuration = { transaction: true }
