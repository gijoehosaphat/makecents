import { useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import { toCents } from './formatMoney'
import { TransactionDirection } from './transactionRowFilter'

function parseCents(value: string | null | undefined) {
  if (!value) {
    return undefined
  }
  const dollars = Number(value)
  return Number.isFinite(dollars) && dollars >= 0 ? toCents(dollars) : undefined
}

/** Reads the `type` (withdrawals | deposits), `amountMin` and `amountMax` params; amounts are in cents. */
export function useTransactionAmountParams() {
  const searchParams = useSearchParams()
  const typeParam = searchParams?.get('type')
  const minParam = searchParams?.get('amountMin')
  const maxParam = searchParams?.get('amountMax')

  return useMemo(() => {
    const direction: TransactionDirection | undefined =
      typeParam === 'withdrawals' || typeParam === 'deposits' ? typeParam : undefined
    return { direction, amountMin: parseCents(minParam), amountMax: parseCents(maxParam) }
  }, [typeParam, minParam, maxParam])
}
