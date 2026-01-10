export function formatMoney(number: number, currency: string) {
  //TODO: Language/locale should be user defined setting.
  return isNaN(number) ? '0' : number.toLocaleString(navigator.language || 'en-CA', { style: 'currency', currency })
}

export function formatMoneyCents(number: number, currency: string) {
  const amount = Number((number / 100).toFixed(2))
  return formatMoney(amount, currency)
}
