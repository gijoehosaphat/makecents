import { Knex } from 'knex'

// Kept in step with ACCOUNT_TYPES in apps/web/src/lib/bankAccountTypes.ts.
const ACCOUNT_TYPES = [
  'CHECKING',
  'SAVINGS',
  'CASH',
  'INVESTMENT',
  'RETIREMENT',
  'CREDIT_CARD',
  'LINE_OF_CREDIT',
  'LOAN',
  'MORTGAGE',
  'OTHER',
]
const TYPE_LIST = ACCOUNT_TYPES.map((type) => `'${type}'`).join(', ')

// A bank account's type is one of a short fixed list the app understands (icons, asset or debt).
// Regional or bank-specific names such as RRSP, 401k or "Money market" go in the free-text subtype.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.withSchema('app_private').alterTable('bank_account', (table) => {
    table.string('subtype').nullable()
  })

  // OFX imports stored the bank's own type; roll those up, keeping the detail as the subtype.
  await knex.raw(`
    UPDATE app_private.bank_account
    SET type = 'SAVINGS', subtype = CASE type WHEN 'MONEYMRKT' THEN 'Money market' ELSE 'CD' END
    WHERE type IN ('MONEYMRKT', 'CD')
  `)
  await knex.raw(`UPDATE app_private.bank_account SET type = 'LINE_OF_CREDIT' WHERE type = 'CREDITLINE'`)
  await knex.raw(`
    UPDATE app_private.bank_account
    SET subtype = nullif(trim(type), ''), type = 'OTHER'
    WHERE type IS NULL OR type NOT IN (${TYPE_LIST})
  `)

  await knex.raw(`ALTER TABLE app_private.bank_account ALTER COLUMN type SET DEFAULT 'OTHER'`)
  await knex.raw(`ALTER TABLE app_private.bank_account ALTER COLUMN type SET NOT NULL`)
  await knex.raw(`
    ALTER TABLE app_private.bank_account
    ADD CONSTRAINT bank_account_type_valid CHECK (type IN (${TYPE_LIST}))
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE app_private.bank_account DROP CONSTRAINT IF EXISTS bank_account_type_valid`)
  await knex.raw(`ALTER TABLE app_private.bank_account ALTER COLUMN type DROP NOT NULL`)
  await knex.raw(`ALTER TABLE app_private.bank_account ALTER COLUMN type DROP DEFAULT`)

  // The new types have no older equivalent; put back what the OFX roll-up changed and keep the rest.
  await knex.raw(
    `UPDATE app_private.bank_account SET type = 'MONEYMRKT' WHERE type = 'SAVINGS' AND subtype = 'Money market'`,
  )
  await knex.raw(`UPDATE app_private.bank_account SET type = 'CD' WHERE type = 'SAVINGS' AND subtype = 'CD'`)
  await knex.raw(`UPDATE app_private.bank_account SET type = 'CREDITLINE' WHERE type = 'LINE_OF_CREDIT'`)
  await knex.raw(`UPDATE app_private.bank_account SET type = subtype WHERE type = 'OTHER' AND subtype IS NOT NULL`)

  await knex.schema.withSchema('app_private').alterTable('bank_account', (table) => {
    table.dropColumn('subtype')
  })
}

export const configuration = { transaction: true }
