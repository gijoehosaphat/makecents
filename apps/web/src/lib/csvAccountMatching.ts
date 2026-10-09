import { addDays, format } from 'date-fns'

export interface MatchableAccount {
  id: number
  name?: string | null
  bankAccountId?: string | null
}

export interface DatedAmount {
  posted: Date
  amount: number
}

export interface ExistingTransaction extends DatedAmount {
  bankAccountId: number
}

export type AccountMatchReason = 'accountColumn' | 'fileName' | 'overlap'

export interface AccountMatch {
  accountId: number
  reason: AccountMatchReason
  /** The identifier (e.g. card ending) or overlapping-transaction count that justified the match. */
  detail: string
}

// Fewer overlapping transactions than this could plausibly be coincidence (a shared subscription,
// the same round-number payment on two cards), so it isn't enough to pick an account on its own.
const MIN_OVERLAP = 3
// The best account must beat the runner-up by this factor to count as a clear winner.
const OVERLAP_DOMINANCE = 3

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SEPARATED_DATE_PATTERNS = [/\d{4}[-_.]\d{1,2}[-_.]\d{1,2}/g, /\d{1,2}[-_.]\d{1,2}[-_.]\d{2,4}/g]

function isLikelyYear(value: string): boolean {
  const year = Number(value)
  return year >= 1990 && year <= 2099
}

/**
 * Pulls likely card/account endings out of a file name, e.g. "1234" from Chase's
 * "Chase1234_Activity20240101_20240201_20240202.CSV". Dates (separated or run together) and
 * bare years are ignored so a statement date isn't mistaken for an account.
 */
export function extractFileNameIdentifiers(fileName: string): string[] {
  let base = fileName.replace(/\.[^.]+$/, '')
  for (const pattern of SEPARATED_DATE_PATTERNS) {
    base = base.replace(pattern, ' ')
  }
  const matches = base.match(/(?<!\d)\d{4}(?!\d)/g) ?? []
  return Array.from(new Set(matches.filter((value) => !isLikelyYear(value))))
}

// A plain or masked account number ("1234", "XXXX1234", "••••1234", "-41003"). Alphanumeric ids
// like WealthSimple's "WK8QPKD35CAD" aren't, and their scattered digits mean nothing on their own.
const NUMERIC_OR_MASKED = /^[\dx*•.\s#-]+$/i

function lastFourDigits(value: string): string | undefined {
  if (!NUMERIC_OR_MASKED.test(value)) {
    return undefined
  }
  const digits = value.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : undefined
}

/**
 * Whether an identifier taken from the file (an account-column value or a file-name ending)
 * refers to this account: an exact bank account id, the same last four digits, or the ending
 * written into the account's name (e.g. "Sapphire ••1234").
 */
export function identifierMatchesAccount(identifier: string, account: MatchableAccount): boolean {
  const normalized = identifier.trim().toLowerCase()
  const bankAccountId = account.bankAccountId?.trim().toLowerCase() ?? ''
  if (normalized && normalized === bankAccountId) {
    return true
  }

  const ending = lastFourDigits(normalized)
  if (!ending) {
    return false
  }
  // Accounts created from a CSV before identifiers were detected got random UUIDs, whose
  // trailing characters mean nothing.
  if (bankAccountId && !UUID_PATTERN.test(bankAccountId) && lastFourDigits(bankAccountId) === ending) {
    return true
  }
  const nameEndings: string[] = account.name?.match(/(?<!\d)\d{4}(?!\d)/g) ?? []
  return nameEndings.includes(ending)
}

function dayKey(date: Date, amount: number): string {
  return `${format(date, 'yyyy-MM-dd')}|${Math.abs(amount)}`
}

/**
 * Counts, per account, how many of the file's rows already exist there (same amount, posted
 * within a day). Amounts are compared unsigned so a template with the wrong sign still matches,
 * and the day of slack absorbs transaction-date vs posted-date differences between exports.
 */
export function scoreOverlap(fileRows: DatedAmount[], existing: ExistingTransaction[]): Map<number, number> {
  const remainingByAccount = new Map<number, Map<string, number>>()
  for (const transaction of existing) {
    const remaining = remainingByAccount.get(transaction.bankAccountId) ?? new Map<string, number>()
    const key = dayKey(transaction.posted, transaction.amount)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
    remainingByAccount.set(transaction.bankAccountId, remaining)
  }

  const scores = new Map<number, number>()
  for (const [accountId, remaining] of remainingByAccount) {
    let score = 0
    for (const row of fileRows) {
      for (const offset of [0, -1, 1]) {
        const key = dayKey(addDays(row.posted, offset), row.amount)
        const count = remaining.get(key) ?? 0
        if (count > 0) {
          remaining.set(key, count - 1)
          score += 1
          break
        }
      }
    }
    scores.set(accountId, score)
  }
  return scores
}

function clearOverlapWinner(scores: Map<number, number>): { accountId: number; score: number } | undefined {
  const ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])
  const [best, runnerUp] = ranked
  if (!best || best[1] < MIN_OVERLAP || best[1] < (runnerUp?.[1] ?? 0) * OVERLAP_DOMINANCE) {
    return undefined
  }
  return { accountId: best[0], score: best[1] }
}

/**
 * Decides which existing account a single-account CSV belongs to, or returns undefined when the
 * evidence is missing or conflicting so the user is asked instead. A saved template is never
 * evidence: several accounts at the same bank export identical columns.
 */
export function matchAccount({
  accounts,
  accountColumnValue,
  fileName,
  overlapScores,
}: {
  accounts: MatchableAccount[]
  accountColumnValue?: string
  fileName: string
  overlapScores: Map<number, number>
}): AccountMatch | undefined {
  const identifierMatches: AccountMatch[] = []
  if (accountColumnValue) {
    for (const account of accounts) {
      if (identifierMatchesAccount(accountColumnValue, account)) {
        identifierMatches.push({ accountId: account.id, reason: 'accountColumn', detail: accountColumnValue })
      }
    }
  }
  // The file's own account column outranks a file name, which may have been renamed.
  if (!identifierMatches.length) {
    for (const identifier of extractFileNameIdentifiers(fileName)) {
      for (const account of accounts) {
        if (identifierMatchesAccount(identifier, account)) {
          identifierMatches.push({ accountId: account.id, reason: 'fileName', detail: identifier })
        }
      }
    }
  }

  const overlap = clearOverlapWinner(overlapScores)
  const identifierAccountIds = new Set(identifierMatches.map((match) => match.accountId))

  if (identifierAccountIds.size === 1) {
    const [match] = identifierMatches
    // The file says one account but its transactions clearly live in another: don't guess.
    return overlap && overlap.accountId !== match.accountId ? undefined : match
  }
  if (identifierAccountIds.size > 1) {
    // An ending shared by several accounts; overlap can break the tie.
    return overlap && identifierAccountIds.has(overlap.accountId)
      ? { accountId: overlap.accountId, reason: 'overlap', detail: String(overlap.score) }
      : undefined
  }
  return overlap ? { accountId: overlap.accountId, reason: 'overlap', detail: String(overlap.score) } : undefined
}
