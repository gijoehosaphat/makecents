import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import { GetTransactionTabCountsDocument, GetTransactionTabCountsBySearchDocument } from '@/graphql/operations'
import { buildTransactionSearchQuery } from './buildTransactionSearchQuery'
import { buildTransactionListFilter } from './buildTransactionListFilter'
import { TransactionDirection } from './transactionRowFilter'

/**
 * Number of top-level transactions that are all / uncategorized / categorized for the current date range,
 * bank accounts and search text. The category and categorized filters are deliberately ignored so the
 * counts stay stable while switching between tabs.
 */
export function useTransactionTabCounts({
  bankAccountIds,
  dateFrom,
  dateTo,
  direction,
  amountMin,
  amountMax,
  search,
}: {
  bankAccountIds: number[]
  dateFrom?: Date
  dateTo?: Date
  direction?: TransactionDirection
  amountMin?: number
  amountMax?: number
  search?: string
}) {
  const match = useMemo(() => buildTransactionSearchQuery(search || ''), [search])

  const variables = useMemo(() => {
    const base = { bankAccountIds, dateFrom, dateTo, direction, amountMin, amountMax }
    return {
      allFilter: buildTransactionListFilter(base),
      uncategorizedFilter: buildTransactionListFilter({ ...base, categorized: false }),
      categorizedFilter: buildTransactionListFilter({ ...base, categorized: true }),
    }
  }, [bankAccountIds, dateFrom, dateTo, direction, amountMin, amountMax])

  const document = match ? GetTransactionTabCountsBySearchDocument : GetTransactionTabCountsDocument
  const query = useSuspenseQuery(document as any, {
    variables: (match ? { ...variables, match } : variables) as any,
  })

  const data = query.data as {
    all?: { totalCount: number } | null
    uncategorized?: { totalCount: number } | null
    categorized?: { totalCount: number } | null
  }

  return {
    all: data?.all?.totalCount ?? 0,
    uncategorized: data?.uncategorized?.totalCount ?? 0,
    categorized: data?.categorized?.totalCount ?? 0,
  }
}
