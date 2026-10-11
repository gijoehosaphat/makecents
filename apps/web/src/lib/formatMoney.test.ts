import { describe, expect, it } from 'vitest'
import { fromCents, toCents } from './formatMoney'

describe('toCents', () => {
  it('rounds away binary float error instead of truncating', () => {
    expect(0.29 * 100).not.toBe(29)
    expect(toCents(0.29)).toBe(29)
    expect(toCents(1.15)).toBe(115)
  })

  it('handles negative amounts and whole dollars', () => {
    expect(toCents(-12.34)).toBe(-1234)
    expect(toCents(5)).toBe(500)
    expect(toCents(0)).toBe(0)
  })

  it('rounds sub-cent amounts to whole cents', () => {
    expect(toCents(12.345)).toBe(1235)
  })
})

describe('fromCents', () => {
  it('converts whole cents to dollars', () => {
    expect(fromCents(1234)).toBe(12.34)
    expect(fromCents(-5)).toBe(-0.05)
    expect(fromCents(0)).toBe(0)
  })

  it('round-trips with toCents', () => {
    for (const cents of [1, 29, 99, 100, 1015, 123456]) {
      expect(toCents(fromCents(cents))).toBe(cents)
    }
  })
})
