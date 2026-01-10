import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.transaction_search(match text)
    RETURNS SETOF app_private.transaction 
    AS $function$
      begin
        RETURN QUERY SELECT * FROM app_private.transaction WHERE weighted_tsv @@ to_tsquery($1) ORDER BY posted DESC;
      end
    $function$
    LANGUAGE plpgsql IMMUTABLE;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.transaction_search(match text)
    RETURNS SETOF app_private.transaction 
    AS $function$
      begin
        RETURN QUERY SELECT * FROM app_private.transaction WHERE weighted_tsv @@ to_tsquery($1);
      end
    $function$
    LANGUAGE plpgsql IMMUTABLE;
  `)
}
