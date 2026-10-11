export const HIDDEN_AMOUNT_PLACEHOLDER = '••••••'

export function formatMoney(number: number, currency: string, hidden = false) {
  if (hidden) return HIDDEN_AMOUNT_PLACEHOLDER
  //TODO: Language/locale should be user defined setting.
  return isNaN(number) ? '0' : number.toLocaleString(navigator.language || 'en-CA', { style: 'currency', currency })
}

/** Dollars (or any major unit) to whole cents; rounds away binary float error, e.g. 0.29 * 100 = 28.999999999999996. */
export function toCents(amount: number) {
  return Math.round(amount * 100)
}

/** Whole cents to dollars, to two decimal places. */
export function fromCents(cents: number) {
  return Math.round(cents) / 100
}

export function formatMoneyCents(number: number, currency: string, hidden = false) {
  return formatMoney(fromCents(number), currency, hidden)
}
