import { Knex } from 'knex'

// PostGraphile connects as the database owner and switches to one of these roles per request
// (see pgSettings in postgraphileMiddleware.ts). Roles are cluster-wide, hence the prefix.
const ANONYMOUS_ROLE = 'makecents_anonymous'
const MEMBER_ROLE = 'makecents_member'

// Tables that carry account_id directly.
const ACCOUNT_TABLES = [
  'bank_account',
  'category',
  'budget',
  'budget_category',
  'bank_csv_definition',
  'category_group',
  'custom_category_group',
]

// Tables whose user_id records the row's creator (see 20260927130000_account-owned-data).
const CREATOR_TABLES = ['bank_account', 'category', 'budget', 'budget_category', 'bank_csv_definition']

const bankAccountIds = (writable: boolean) =>
  `SELECT id FROM app_private.bank_account WHERE account_id IN (SELECT app_private.current_user_account_ids(${writable}))`

const transactionIds = (writable: boolean) =>
  `SELECT id FROM app_private.transaction WHERE bank_account_id IN (${bankAccountIds(writable)})`

// Tables reached through a parent; each maps to its visibility condition.
const CHILD_TABLES: Record<string, (writable: boolean) => string> = {
  transaction: (writable) => `bank_account_id IN (${bankAccountIds(writable)})`,
  bank_account_reconciliation: (writable) => `bank_account_id IN (${bankAccountIds(writable)})`,
  budget_reconsiliation: (writable) =>
    `budget_id IN (SELECT id FROM app_private.budget WHERE account_id IN (SELECT app_private.current_user_account_ids(${writable})))`,
  transfer: (writable) =>
    `transaction_source_id IN (${transactionIds(writable)}) AND transaction_target_id IN (${transactionIds(writable)})`,
}

export async function up(knex: Knex): Promise<void> {
  for (const role of [ANONYMOUS_ROLE, MEMBER_ROLE]) {
    await knex.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
          CREATE ROLE ${role} NOLOGIN;
        END IF;
      END
      $$;
    `)
    // Lets a non-superuser connection role switch into it; a no-op for superusers.
    await knex.raw(`GRANT ${role} TO CURRENT_USER`)
    await knex.raw(`GRANT USAGE ON SCHEMA app_private, public TO ${role}`)
  }

  await knex.raw(`
    CREATE FUNCTION app_private.current_user_id()
    RETURNS int
    AS $$
      SELECT nullif(current_setting('jwt.claims.user_id', true), '')::int;
    $$
    LANGUAGE sql
    STABLE;
  `)

  // SECURITY DEFINER so policies can read account_member without recursing into its own policy.
  await knex.raw(`
    CREATE FUNCTION app_private.current_user_account_ids(writable boolean DEFAULT false)
    RETURNS SETOF int
    AS $$
      SELECT account_id
      FROM app_private.account_member
      WHERE user_id = app_private.current_user_id()
        AND (NOT writable OR role IN ('owner', 'editor'));
    $$
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)

  await knex.raw(`COMMENT ON FUNCTION app_private.current_user_id() IS '@omit'`)
  await knex.raw(`COMMENT ON FUNCTION app_private.current_user_account_ids(boolean) IS '@omit'`)

  // Record who created a row now that the database knows who is asking.
  for (const tableName of CREATOR_TABLES) {
    await knex.raw(`ALTER TABLE app_private.${tableName} ALTER COLUMN user_id SET DEFAULT app_private.current_user_id()`)
  }

  // Members can see and use data in their accounts. Nothing is granted by default, so a new
  // table stays inaccessible until a migration grants it and gives it a policy.
  await knex.raw(`GRANT SELECT (id, created_at, updated_at, name, email, image, "emailVerified") ON app_private.user TO ${MEMBER_ROLE}`)
  await knex.raw(`GRANT SELECT, UPDATE (name) ON app_private.account TO ${MEMBER_ROLE}`)
  await knex.raw(`GRANT SELECT ON app_private.account_member TO ${MEMBER_ROLE}`)
  for (const tableName of [...ACCOUNT_TABLES, ...Object.keys(CHILD_TABLES)]) {
    await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON app_private.${tableName} TO ${MEMBER_ROLE}`)
  }
  await knex.raw(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app_private TO ${MEMBER_ROLE}`)

  await knex.raw(`ALTER TABLE app_private.user ENABLE ROW LEVEL SECURITY`)
  await knex.raw(`
    CREATE POLICY user_select ON app_private.user FOR SELECT
    USING (
      id = app_private.current_user_id()
      OR id IN (SELECT user_id FROM app_private.account_member WHERE account_id IN (SELECT app_private.current_user_account_ids()))
    )
  `)

  await knex.raw(`ALTER TABLE app_private.account ENABLE ROW LEVEL SECURITY`)
  await knex.raw(`
    CREATE POLICY account_select ON app_private.account FOR SELECT
    USING (id IN (SELECT app_private.current_user_account_ids()))
  `)
  await knex.raw(`
    CREATE POLICY account_update ON app_private.account FOR UPDATE
    USING (id IN (SELECT account_id FROM app_private.account_member WHERE user_id = app_private.current_user_id() AND role = 'owner'))
  `)

  await knex.raw(`ALTER TABLE app_private.account_member ENABLE ROW LEVEL SECURITY`)
  await knex.raw(`
    CREATE POLICY account_member_select ON app_private.account_member FOR SELECT
    USING (account_id IN (SELECT app_private.current_user_account_ids()))
  `)

  const tablePolicies: [string, (writable: boolean) => string][] = [
    ...ACCOUNT_TABLES.map((tableName): [string, (writable: boolean) => string] => [
      tableName,
      (writable) => `account_id IN (SELECT app_private.current_user_account_ids(${writable}))`,
    ]),
    ...Object.entries(CHILD_TABLES),
  ]
  for (const [tableName, condition] of tablePolicies) {
    await knex.raw(`ALTER TABLE app_private.${tableName} ENABLE ROW LEVEL SECURITY`)
    await knex.raw(`CREATE POLICY ${tableName}_select ON app_private.${tableName} FOR SELECT USING (${condition(false)})`)
    // Viewers only match the select policy; owners and editors can also write.
    await knex.raw(`
      CREATE POLICY ${tableName}_write ON app_private.${tableName} FOR ALL
      USING (${condition(true)})
      WITH CHECK (${condition(true)})
    `)
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableNames = ['user', 'account', 'account_member', ...ACCOUNT_TABLES, ...Object.keys(CHILD_TABLES)]
  for (const tableName of tableNames) {
    const policies = await knex.raw(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'app_private' AND tablename = ?`,
      [tableName]
    )
    for (const { policyname } of policies.rows) {
      await knex.raw(`DROP POLICY ${policyname} ON app_private.${tableName}`)
    }
    await knex.raw(`ALTER TABLE app_private.${tableName} DISABLE ROW LEVEL SECURITY`)
  }

  for (const tableName of CREATOR_TABLES) {
    await knex.raw(`ALTER TABLE app_private.${tableName} ALTER COLUMN user_id DROP DEFAULT`)
  }

  await knex.raw(`DROP FUNCTION app_private.current_user_account_ids(boolean)`)
  await knex.raw(`DROP FUNCTION app_private.current_user_id()`)

  for (const role of [ANONYMOUS_ROLE, MEMBER_ROLE]) {
    await knex.raw(`REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM ${role}`)
    await knex.raw(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_private FROM ${role}`)
    await knex.raw(`REVOKE ALL ON SCHEMA app_private, public FROM ${role}`)
    // Another database on the same server may still use the role; leave it in that case.
    await knex.raw(`
      DO $$
      BEGIN
        DROP ROLE IF EXISTS ${role};
      EXCEPTION WHEN dependent_objects_still_exist THEN
        RAISE NOTICE 'Role ${role} is still in use elsewhere; not dropped';
      END
      $$;
    `)
  }
}

export const configuration = { transaction: true }
