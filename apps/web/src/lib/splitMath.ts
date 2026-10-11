/** Every part of a split, the original row included, must keep at least one cent. */
export const MIN_PART_CENTS = 1

function sumAbs(amounts: number[]) {
  return amounts.reduce((sum, amount) => sum + Math.abs(amount), 0)
}

/** What the original row keeps: the transaction total less everything split off it. */
export function remainingCents(totalCents: number, partCents: number[]) {
  return Math.abs(totalCents) - sumAbs(partCents)
}

/** The most one part can take while the original row keeps its minimum. */
export function maxPartCents(totalCents: number, otherPartCents: number[]) {
  return Math.max(MIN_PART_CENTS, Math.abs(totalCents) - MIN_PART_CENTS - sumAbs(otherPartCents))
}

export function clampPartCents(cents: number, totalCents: number, otherPartCents: number[]) {
  return Math.min(Math.max(Math.abs(cents), MIN_PART_CENTS), maxPartCents(totalCents, otherPartCents))
}

/** A new part starts at the minimum, so there must be room for it and for the original row. */
export function canAddPart(totalCents: number, partCents: number[]) {
  return remainingCents(totalCents, partCents) >= MIN_PART_CENTS * 2
}
