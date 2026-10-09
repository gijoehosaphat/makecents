export const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT_CARD'] as const

type Translate = (key: string) => string

/** Accounts created from a CSV have random ids, so fall back to "Credit card ••1a2b" rather than a bare id. */
export function bankAccountLabel(
  account: { name?: string | null; type?: string | null; bankAccountId?: string | null },
  t: Translate
): string {
  if (account.name) {
    return account.name
  }
  const isKnownType = ACCOUNT_TYPES.some((type) => type === account.type)
  const type = isKnownType ? t(`csvImport.accountTypes.${account.type}`) : (account.type ?? '')
  return `${type} ••${(account.bankAccountId ?? '').slice(-4)}`
}
