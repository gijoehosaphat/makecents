import { Knex } from 'knex'

const MEMBER_ROLE = 'makecents_member'

// The money a household already had when envelope budgeting started (the start month), not yet given a job. Once it
// is set, Ready to Assign starts from it, less what budgets already held (their opening balances), instead of from
// envelope_starting_balance: real cash already reflects money that was spent, which is all the conversion's starting
// balance stood in for. Null until someone enters it, so nothing changes before then. Pay then adds to it as usual.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('account', (table) => {
    table.bigInteger('envelope_cash_on_hand').nullable()
  })

  // Members can only rename an account, and only owners can update it at all, but editors manage the budget; this
  // sets just this column for anyone who can write to the account. Null clears it.
  await knex.raw(`
    CREATE FUNCTION app_private.set_envelope_cash_on_hand(account_id int, cash_on_hand bigint)
    RETURNS app_private.account
    AS $$
      DECLARE
        updated app_private.account;
      BEGIN
        UPDATE app_private.account AS a
        SET envelope_cash_on_hand = set_envelope_cash_on_hand.cash_on_hand
        WHERE a.id = set_envelope_cash_on_hand.account_id
          AND a.id IN (SELECT app_private.current_user_account_ids(true))
        RETURNING a.* INTO updated;
        IF updated.id IS NULL THEN
          RAISE EXCEPTION 'You cannot change the budget of this account' USING ERRCODE = 'insufficient_privilege';
        END IF;
        RETURN updated;
      END;
    $$
    LANGUAGE plpgsql
    VOLATILE
    SECURITY DEFINER
    SET search_path = app_private, pg_temp;
  `)
  await knex.raw(`REVOKE EXECUTE ON FUNCTION app_private.set_envelope_cash_on_hand(int, bigint) FROM PUBLIC`)
  await knex.raw(`GRANT EXECUTE ON FUNCTION app_private.set_envelope_cash_on_hand(int, bigint) TO ${MEMBER_ROLE}`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION app_private.set_envelope_cash_on_hand(int, bigint)`)
  await knex.schema.withSchema('app_private').alterTable('account', (table) => {
    table.dropColumn('envelope_cash_on_hand')
  })
}

export const configuration = { transaction: true }
