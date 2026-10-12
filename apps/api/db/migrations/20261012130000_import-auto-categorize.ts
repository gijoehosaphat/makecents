import { Knex } from 'knex'
import { IMPORT_TRANSACTIONS_V2 } from './20261009140000_import-batch-ids-in-database'

function replaceOnce(sql: string, search: string, replacement: string): string {
  if (sql.split(search).length !== 2) {
    throw new Error(`Expected exactly one occurrence of: ${search}`)
  }
  return sql.replace(search, replacement)
}

// Imports categorize the transactions the history is certain about: the same payee at a similar
// amount, 8 or more times, always in the same category (transaction_suggested_categories flags
// these auto_apply; replayed over the existing history that was right 99.4% of the time). They are
// marked category_source = 'auto' so they can be reviewed, and never teach later suggestions.
// Exported so later migrations can restore this version on rollback.
export const IMPORT_TRANSACTIONS_V3 = replaceOnce(
  IMPORT_TRANSACTIONS_V2,
  `RETURN batch;`,
  `IF inserted > 0 THEN
          batch.auto_categorized_count := app_private.auto_categorize_import_batch(batch.id);
        END IF;
        RETURN batch;`
)

export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('import_batch', (table) => {
    table.integer('auto_categorized_count').notNullable().defaultTo(0)
  })

  await knex.raw(`
    CREATE FUNCTION app_private.auto_categorize_import_batch(batch_id int)
    RETURNS int
    AS $$
      #variable_conflict use_column
      DECLARE
        applied int;
      BEGIN
        UPDATE app_private.transaction AS t
        SET category_id = s.category_id, category_source = 'auto'
        FROM (
          SELECT x.id,
            (SELECT suggestion.category_id
             FROM app_private.transaction_suggested_categories(x, 3) AS suggestion
             WHERE suggestion.auto_apply
             ORDER BY suggestion.confidence DESC
             LIMIT 1) AS category_id
          FROM app_private.transaction AS x
          WHERE x.import_batch_id = auto_categorize_import_batch.batch_id
            AND x.category_id IS NULL
            AND x.split_source_id IS NULL
        ) AS s
        WHERE t.id = s.id AND s.category_id IS NOT NULL;
        GET DIAGNOSTICS applied = ROW_COUNT;

        UPDATE app_private.import_batch
        SET auto_categorized_count = applied
        WHERE id = auto_categorize_import_batch.batch_id;
        RETURN applied;
      END;
    $$
    LANGUAGE plpgsql
    VOLATILE;
  `)
  await knex.raw(`COMMENT ON FUNCTION app_private.auto_categorize_import_batch(int) IS '@omit'`)

  await knex.raw(IMPORT_TRANSACTIONS_V3)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(IMPORT_TRANSACTIONS_V2)
  await knex.raw('DROP FUNCTION IF EXISTS app_private.auto_categorize_import_batch(int)')
  await knex.schema.withSchema('app_private').alterTable('import_batch', (table) => {
    table.dropColumn('auto_categorized_count')
  })
}
