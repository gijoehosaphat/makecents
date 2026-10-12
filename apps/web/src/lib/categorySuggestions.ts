import { Transaction } from '@/graphql/types'

/** Why a category is suggested: the same payee at a similar amount, the same payee, or the days around it. */
export type HintTier = 'payee_amount' | 'payee' | 'nearby'

export interface CategoryHint {
  categoryId: number
  /** 0 to 1; roughly how often the evidence agreed, discounted when there is little of it. */
  confidence: number
  tier: HintTier
  /** How many of `total` comparable transactions were in this category. */
  matches: number
  total: number
}

/** Hints below this are noise ("Gifts, 4 of 352 times") and are left out of the category menu. */
export const MENU_MIN_CONFIDENCE = 0.25
/** Only a clear favourite earns the one-click chip on a row. */
export const CHIP_MIN_CONFIDENCE = 0.6
export const CHIP_MIN_MATCHES = 2

/** The translation key (under `common`) explaining each tier, taking `matches` and `total`. */
export const HINT_MESSAGE_KEYS = {
  payee_amount: 'categories.hintPayeeAmount',
  payee: 'categories.hintPayee',
  nearby: 'categories.hintNearby',
} as const satisfies Record<HintTier, string>

const TIERS: HintTier[] = ['payee_amount', 'payee', 'nearby']

type WithSuggestions = Pick<Transaction, 'suggestedCategories'> | null | undefined

/** The hints the API computed for a transaction, best first; empty when the query didn't ask for them. */
export function transactionHints(transaction: WithSuggestions): CategoryHint[] {
  const nodes = transaction?.suggestedCategories?.nodes ?? []
  const hints: CategoryHint[] = []
  for (const node of nodes) {
    if (!node || node.categoryId == null || !TIERS.includes(node.tier as HintTier)) continue
    hints.push({
      categoryId: node.categoryId,
      confidence: Number(node.confidence),
      tier: node.tier as HintTier,
      matches: node.matches ?? 0,
      total: node.total ?? 0,
    })
  }
  return hints.sort((a, b) => b.confidence - a.confidence)
}

/** The hints worth listing in the category menu. */
export function menuHints(hints: CategoryHint[]): CategoryHint[] {
  return hints.filter((hint) => hint.confidence >= MENU_MIN_CONFIDENCE)
}

/** The single hint strong enough to offer as a one-click chip, if any. */
export function chipHint(hints: CategoryHint[]): CategoryHint | undefined {
  const [best] = hints
  if (!best || best.confidence < CHIP_MIN_CONFIDENCE || best.matches < CHIP_MIN_MATCHES) return undefined
  return best
}
