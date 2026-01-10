import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.transaction_transfer_count(transaction app_private.transaction)
    RETURNS NUMERIC AS
    $function$
      DECLARE count NUMERIC;
      BEGIN
        SELECT
          COUNT(id)
        FROM
          app_private.transfer
        WHERE
          transfer.transaction_source_id = transaction.id 
        OR
          transfer.transaction_target_id = transaction.id
        INTO
          count;
        RETURN count;
      END
    $function$
    LANGUAGE plpgsql IMMUTABLE;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_has_transfer(transaction app_private.transaction)')
}
