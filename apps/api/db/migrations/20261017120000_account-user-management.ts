import { Knex } from 'knex'

// The owner of an account is its primary user: the only member who can add or remove other
// users. Each account has exactly one.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE UNIQUE INDEX account_member_one_owner
    ON app_private.account_member (account_id)
    WHERE role = 'owner'
  `)

  // Members cannot write to app_private.user, so these are SECURITY DEFINER and check for
  // themselves that the caller owns the account.
  await knex.raw(`
    CREATE FUNCTION app_private.is_account_owner(account_id int)
    RETURNS boolean
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM app_private.account_member AS m
        WHERE m.account_id = is_account_owner.account_id
          AND m.user_id = app_private.current_user_id()
          AND m.role = 'owner'
      );
    $$
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)
  await knex.raw(`COMMENT ON FUNCTION app_private.is_account_owner(int) IS '@omit'`)

  await knex.raw(`
    CREATE FUNCTION app_private.add_account_user(account_id int, email text, password text, name text DEFAULT NULL)
    RETURNS app_private.user
    AS $$
    DECLARE
      new_user app_private.user;
    BEGIN
      IF NOT app_private.is_account_owner(add_account_user.account_id) THEN
        RAISE EXCEPTION 'Only the primary user can add users' USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF length(coalesce(add_account_user.password, '')) < 8 THEN
        RAISE EXCEPTION 'Password must be at least 8 characters' USING ERRCODE = 'check_violation';
      END IF;

      -- Adding an existing user would let the owner reach their other accounts, so only new
      -- users can be created here.
      IF EXISTS (SELECT 1 FROM app_private.user AS u WHERE lower(u.email) = lower(add_account_user.email)) THEN
        RAISE EXCEPTION 'A user with that email already exists' USING ERRCODE = 'unique_violation';
      END IF;

      INSERT INTO app_private.user (email, password, name)
      VALUES (
        add_account_user.email,
        public.crypt(add_account_user.password, public.gen_salt('bf')),
        nullif(add_account_user.name, '')
      )
      RETURNING * INTO new_user;

      INSERT INTO app_private.account_member (account_id, user_id, role)
      VALUES (add_account_user.account_id, new_user.id, 'editor');

      RETURN new_user;
    END;
    $$
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)

  // Removes a user from the account. A user left with no accounts is deleted too, since they
  // would otherwise be able to sign in to nothing and keep their email taken.
  await knex.raw(`
    CREATE FUNCTION app_private.remove_account_user(account_id int, user_id int)
    RETURNS boolean
    AS $$
    BEGIN
      IF NOT app_private.is_account_owner(remove_account_user.account_id) THEN
        RAISE EXCEPTION 'Only the primary user can remove users' USING ERRCODE = 'insufficient_privilege';
      END IF;

      DELETE FROM app_private.account_member AS m
      WHERE m.account_id = remove_account_user.account_id
        AND m.user_id = remove_account_user.user_id
        AND m.role <> 'owner';

      IF NOT FOUND THEN
        RETURN false;
      END IF;

      DELETE FROM app_private.user AS u
      WHERE u.id = remove_account_user.user_id
        AND NOT EXISTS (SELECT 1 FROM app_private.account_member AS m WHERE m.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM app_private.account AS a WHERE a.user_id = u.id);

      RETURN true;
    END;
    $$
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)

  // Anonymous requests can call any function by default; keep these to signed-in members.
  for (const signature of ['add_account_user(int, text, text, text)', 'remove_account_user(int, int)']) {
    await knex.raw(`REVOKE EXECUTE ON FUNCTION app_private.${signature} FROM PUBLIC`)
    await knex.raw(`GRANT EXECUTE ON FUNCTION app_private.${signature} TO makecents_member`)
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS app_private.remove_account_user(int, int)`)
  await knex.raw(`DROP FUNCTION IF EXISTS app_private.add_account_user(int, text, text, text)`)
  await knex.raw(`DROP FUNCTION IF EXISTS app_private.is_account_owner(int)`)
  await knex.raw(`DROP INDEX IF EXISTS app_private.account_member_one_owner`)
}

export const configuration = { transaction: true }
