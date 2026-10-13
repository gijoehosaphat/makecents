import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import { TransactionFilter } from '@/graphql/types'
import {
  GetFilteredTransactionTotalsByBankAccounts,
  GetFilteredTransactionTotalsByBankAccountsDocument,
  GetFilteredTransactionTotalsBySearchDocument,
} from '@/graphql/operations'
import { buildTransactionSearchQuery } from './buildTransactionSearchQuery'
import { EXCLUDE_TRANSFERS_FILTER, ONLY_TRANSFERS_FILTER } from '@/components/shared/CurrencyTotals'
import { TransactionDirection, buildTransactionRowFilter } from './transactionRowFilter'

type GroupedSums = NonNullable<GetFilteredTransactionTotalsByBankAccounts['deposits']>['groupedAggregates']

function sumsByBankAccount(groups: GroupedSums): Record<number, number> {
  const sums: Record<number, number> = {}
  for (const group of groups || []) {
    const bankAccountId = Number(group.keys?.[0])
    sums[bankAccountId] = (sums[bankAccountId] || 0) + Number(group.sum?.amount || 0)
  }
  return sums
}

/**
 * Deposit and withdrawal totals (in cents, per bank account), with transfers between accounts reported separately, across every transaction matching the filters,
 * ignoring pagination. Every row is summed on its own, splits included: a split parent's amount is only the
 * remainder not covered by its splits, so nothing is double counted.
 */
export function useFilteredTransactionTotals({
  dateFrom,
  dateTo,
  bankAccountIds,
  categorized,
  categoryIds,
  autoCategorized,
  direction,
  amountMin,
  amountMax,
  search,
}: {
  dateFrom?: Date
  dateTo?: Date
  bankAccountIds: number[]
  categorized?: boolean
  categoryIds?: number[]
  autoCategorized?: boolean
  direction?: TransactionDirection
  amountMin?: number
  amountMax?: number
  search?: string
}) {
  const match = useMemo(() => buildTransactionSearchQuery(search || ''), [search])

  const variables = useMemo(() => {
    const and: TransactionFilter[] = [{ bankAccountId: { in: bankAccountIds } }]

    const rowFilter = buildTransactionRowFilter({ categorized, categoryIds, autoCategorized, direction, amountMin, amountMax })
    if (rowFilter) {
      and.push(rowFilter)
    }

    if (dateFrom !== undefined && dateTo !== undefined) {
      and.push({ posted: { greaterThanOrEqualTo: dateFrom, lessThan: dateTo } })
    }

    const deposit: TransactionFilter = { amount: { greaterThan: '0' } }
    const withdrawal: TransactionFilter = { amount: { lessThan: '0' } }

    return {
      depositFilter: { and: [...and, EXCLUDE_TRANSFERS_FILTER, deposit] },
      withdrawalFilter: { and: [...and, EXCLUDE_TRANSFERS_FILTER, withdrawal] },
      transferDepositFilter: { and: [...and, ONLY_TRANSFERS_FILTER, deposit] },
      transferWithdrawalFilter: { and: [...and, ONLY_TRANSFERS_FILTER, withdrawal] },
    }
  }, [bankAccountIds, categorized, categoryIds, autoCategorized, direction, amountMin, amountMax, dateFrom, dateTo])

  const document = match ? GetFilteredTransactionTotalsBySearchDocument : GetFilteredTransactionTotalsByBankAccountsDocument
  const documentVariables = match ? { ...variables, match } : variables

  const query = useSuspenseQuery(document as any, {
    variables: documentVariables as any,
  })

  const data = query?.data as GetFilteredTransactionTotalsByBankAccounts

  const deposits = useMemo(() => sumsByBankAccount(data?.deposits?.groupedAggregates), [data?.deposits])
  const withdrawals = useMemo(() => sumsByBankAccount(data?.withdrawals?.groupedAggregates), [data?.withdrawals])

  const transferDeposits = useMemo(() => sumsByBankAccount(data?.transferDeposits?.groupedAggregates), [data?.transferDeposits])
  const transferWithdrawals = useMemo(
    () => sumsByBankAccount(data?.transferWithdrawals?.groupedAggregates),
    [data?.transferWithdrawals],
  )

  return { deposits, withdrawals, transferDeposits, transferWithdrawals }
}
