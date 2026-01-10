import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.transaction_sans_transfers_filtered(excludeCategoryIds int[])
    RETURNS SETOF app_private.transaction 
    AS $function$
      begin
        RETURN QUERY SELECT
          *
        FROM
          app_private.transaction tr
        WHERE NOT EXISTS (
          SELECT
            1 
          FROM
            app_private.transfer tf 
          WHERE 
            tr.id = tf.transaction_source_id or tr.id = tf.transaction_target_id
        ) and not exists (
          SELECT
            1
          FROM
            app_private.transaction_category tc
          WHERE
            tc.category_id in (SELECT unnest($1))
          AND
            tr.id = tc.bank_transaction_id
        );
      end
    $function$
    LANGUAGE plpgsql IMMUTABLE;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_sans_transfers_filtered(excludeCategoryIds int[])')
}
