import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.transaction_weighted_tsv_trigger()
    RETURNS trigger
    AS $function$
      BEGIN
        new.weighted_tsv :=
          setweight(to_tsvector('english', COALESCE(new.custom_name, new.name, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(new.custom_memo, new.memo, '')), 'B');
        return new;
      END
    $function$
    LANGUAGE plpgsql;
  `)

  await knex.raw(`
    UPDATE app_private.transaction SET
      weighted_tsv = x.weighted_tsv
    FROM (
      SELECT id,
        setweight(to_tsvector('english', COALESCE(custom_name, name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(custom_memo, memo, '')), 'B')
        AS weighted_tsv
      FROM app_private.transaction
    ) AS x
    WHERE x.id = app_private.transaction.id;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION app_private.transaction_weighted_tsv_trigger()
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
}

export const configuration = { transaction: true }
