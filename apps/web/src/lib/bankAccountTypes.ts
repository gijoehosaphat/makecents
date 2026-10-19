// Kept in step with the bank_account_type_valid constraint (apps/api/db/migrations/20261017150000_bank-account-types.ts).
export const ACCOUNT_TYPES = [
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
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** Whether an account holds money (asset) or money owed (debt). */
export type AccountKind = 'asset' | 'debt'

export const ACCOUNT_TYPE_KIND: Record<AccountType, AccountKind> = {
  CHECKING: 'asset',
  SAVINGS: 'asset',
  CASH: 'asset',
  INVESTMENT: 'asset',
  RETIREMENT: 'asset',
  CREDIT_CARD: 'debt',
  LINE_OF_CREDIT: 'debt',
  LOAN: 'debt',
  MORTGAGE: 'debt',
  OTHER: 'asset',
}

/**
 * Common names offered for an account's subtype. They are proper names (RRSP, 401k), so they are
 * not translated, and any other subtype can be typed in.
 */
export const SUBTYPE_SUGGESTIONS: Record<AccountType, string[]> = {
  CHECKING: ['Joint'],
  SAVINGS: ['High-interest savings', 'Money market', 'GIC', 'CD'],
  CASH: ['Wallet', 'Petty cash', 'Prepaid card'],
  INVESTMENT: ['Non-registered', 'Brokerage', 'TFSA', 'FHSA', 'RESP', '529', 'HSA'],
  RETIREMENT: ['RRSP', 'Spousal RRSP', 'RRIF', 'LIRA', 'Pension', '401k', '403b', 'IRA', 'Roth IRA'],
  CREDIT_CARD: [],
  LINE_OF_CREDIT: ['Personal', 'HELOC', 'Overdraft'],
  LOAN: ['Auto', 'Student', 'Personal'],
  MORTGAGE: [],
  OTHER: [],
}

export function isAccountType(type: string | null | undefined): type is AccountType {
  return ACCOUNT_TYPES.some((known) => known === type)
}

/** Maps an OFX <ACCTTYPE> onto our types, keeping the bank's more specific name as the subtype. */
export function accountTypeFromOfx(ofxType: string | null | undefined): { type: AccountType; subtype: string | null } {
  switch (ofxType?.trim().toUpperCase()) {
    case 'CHECKING':
      return { type: 'CHECKING', subtype: null }
    case 'SAVINGS':
      return { type: 'SAVINGS', subtype: null }
    case 'MONEYMRKT':
      return { type: 'SAVINGS', subtype: 'Money market' }
    case 'CD':
      return { type: 'SAVINGS', subtype: 'CD' }
    case 'CREDITLINE':
      return { type: 'LINE_OF_CREDIT', subtype: null }
    default:
      return { type: 'OTHER', subtype: ofxType?.trim() || null }
  }
}
