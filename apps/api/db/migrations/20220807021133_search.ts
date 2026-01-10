import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.specificType('weighted_tsv', 'tsvector')
  })

  await knex.raw(`
    UPDATE app_private.transaction SET  
      weighted_tsv = x.weighted_tsv
    FROM (  
      SELECT id,
        setweight(to_tsvector('english', COALESCE(name,'')), 'A') ||
        setweight(to_tsvector('english', COALESCE(memo,'')), 'B')
        AS weighted_tsv
      FROM app_private.transaction
    ) AS x
    WHERE x.id = app_private.transaction.id;
  `)

  await knex.raw(`
    CREATE FUNCTION app_private.transaction_weighted_tsv_trigger() 
    RETURNS trigger 
    AS $function$  
      BEGIN  
        new.weighted_tsv :=
          setweight(to_tsvector('english', COALESCE(new.name,'')), 'A') ||
          setweight(to_tsvector('english', COALESCE(new.memo,'')), 'B');
        return new;
      END  
    $function$
    LANGUAGE plpgsql;
  `)

  await knex.raw(`
    CREATE TRIGGER upd_tsvector
    BEFORE INSERT OR UPDATE  
    ON app_private.transaction  
    FOR EACH ROW
    EXECUTE PROCEDURE app_private.transaction_weighted_tsv_trigger()
  `)

  await knex.raw(`CREATE INDEX weighted_tsv_idx ON app_private.transaction USING GIST (weighted_tsv)`)

  await knex.raw(`
    CREATE FUNCTION app_private.transaction_search(match text)
    RETURNS SETOF app_private.transaction 
    AS $function$
      begin
        RETURN QUERY SELECT * FROM app_private.transaction WHERE weighted_tsv @@ to_tsquery($1);
      end
    $function$
    LANGUAGE plpgsql IMMUTABLE;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('transaction', (table) => {
    table.dropColumn('weighted_tsv')
  })
  await knex.raw('DROP TRIGGER IF EXISTS upd_tsvector ON app_private.transaction')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_weighted_tsv_trigger()')
  await knex.raw('DROP FUNCTION IF EXISTS app_private.transaction_search(match text)')
}

export const configuration = { transaction: true }
