import { describe, expect, it } from 'vitest'
import { Transaction } from '@/graphql/types'
import { chipHint, menuHints, transactionHints } from './categorySuggestions'

function withNodes(nodes: unknown[]) {
  return { suggestedCategories: { nodes } } as unknown as Pick<Transaction, 'suggestedCategories'>
}

const node = (categoryId: number, confidence: string, tier: string, matches: number, total: number) => ({
  categoryId,
  confidence,
  tier,
  matches,
  total,
  autoApply: false,
})

describe('transactionHints', () => {
  it('reads the API nodes, best first, with numeric confidence', () => {
    const hints = transactionHints(withNodes([node(2, '0.3077', 'payee', 4, 12), node(1, '0.8839', 'payee', 312, 352)]))
    expect(hints.map((hint) => hint.categoryId)).toEqual([1, 2])
    expect(hints[0]).toEqual({ categoryId: 1, confidence: 0.8839, tier: 'payee', matches: 312, total: 352 })
  })

  it('is empty when the transaction carries no suggestions', () => {
    expect(transactionHints(undefined)).toEqual([])
    expect(transactionHints({} as Pick<Transaction, 'suggestedCategories'>)).toEqual([])
  })

  it('ignores tiers it does not know how to explain', () => {
    expect(transactionHints(withNodes([node(1, '0.9', 'mystery', 9, 9)]))).toEqual([])
  })
})

describe('menuHints', () => {
  it('drops weak hints', () => {
    const hints = transactionHints(withNodes([node(1, '0.8839', 'payee', 312, 352), node(3, '0.0453', 'payee', 16, 352)]))
    expect(menuHints(hints).map((hint) => hint.categoryId)).toEqual([1])
  })
})

describe('chipHint', () => {
  it('offers a clear favourite', () => {
    expect(chipHint(transactionHints(withNodes([node(1, '0.8839', 'payee', 312, 352)])))?.categoryId).toBe(1)
  })

  it('does not offer a guess from a single past transaction', () => {
    expect(chipHint(transactionHints(withNodes([node(1, '0.5', 'payee', 1, 1)])))).toBeUndefined()
  })

  it('does not offer a split decision', () => {
    expect(chipHint(transactionHints(withNodes([node(1, '0.3077', 'payee', 4, 12)])))).toBeUndefined()
  })
})
