import { describe, expect, it } from 'vitest'
import { canAddPart, clampPartCents, maxPartCents, remainingCents } from './splitMath'

describe('remainingCents', () => {
  it('is the total less the parts, ignoring signs', () => {
    expect(remainingCents(-1000, [300, -200])).toBe(500)
    expect(remainingCents(1000, [])).toBe(1000)
  })
})

describe('maxPartCents', () => {
  it('leaves a cent for the original row', () => {
    expect(maxPartCents(1000, [])).toBe(999)
    expect(maxPartCents(1000, [400])).toBe(599)
  })

  it('never drops below one cent', () => {
    expect(maxPartCents(1000, [999])).toBe(1)
    expect(maxPartCents(1, [])).toBe(1)
  })
})

describe('clampPartCents', () => {
  it('keeps in-range values', () => {
    expect(clampPartCents(250, 1000, [300])).toBe(250)
  })

  it('caps a part so the original row keeps a cent', () => {
    expect(clampPartCents(5000, 1000, [300])).toBe(699)
  })

  it('raises empty or zero parts to one cent', () => {
    expect(clampPartCents(0, 1000, [])).toBe(1)
  })

  it('always leaves the original row at least a cent', () => {
    for (const [value, others] of [
      [999, []],
      [500, [499]],
      [1, [998]],
      [10000, [1, 1, 1]],
    ] as [number, number[]][]) {
      const part = clampPartCents(value, 1000, others)
      expect(remainingCents(1000, [part, ...others])).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('canAddPart', () => {
  it('needs room for a new part and the original row', () => {
    expect(canAddPart(1000, [])).toBe(true)
    expect(canAddPart(1000, [998])).toBe(true)
    expect(canAddPart(1000, [999])).toBe(false)
    expect(canAddPart(1, [])).toBe(false)
  })
})
