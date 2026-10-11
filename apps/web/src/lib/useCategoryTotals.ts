import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import { useAppContext } from '@/components/context/AppContextProvider'
import { GetCategoryTotalsDocument } from '@/graphql/operations'
import { useDateFilterParams } from '@/lib/useDateFilterParams'

/**
 * Net amount in cents per category id over the selected dates, summed by the database. Transfers
 * and uncategorized transactions are left out, so every chart built on this agrees.
 */
export function useCategoryTotals() {
  const { bankAccounts } = useAppContext()
  const { dateFrom, dateTo } = useDateFilterParams()
  const bankAccountIds = useMemo(() => bankAccounts.map((ba) => ba.id), [bankAccounts])

  const { data } = useSuspenseQuery(GetCategoryTotalsDocument, {
    variables: {
      filter: {
        bankAccountId: { in: bankAccountIds },
        // Uncategorized rows would group under a null key, which the schema's non-null `keys` can't return.
        categoryId: { isNull: false },
        ...(dateFrom !== undefined && dateTo !== undefined
          ? { posted: { greaterThanOrEqualTo: dateFrom, lessThan: dateTo } }
          : {}),
        transferByTransactionSourceIdExists: false,
        transferByTransactionTargetIdExists: false,
      },
    },
  })

  return useMemo(() => {
    const totals = new Map<string, number>()
    for (const group of data.allTransactions?.groupedAggregates ?? []) {
      const categoryId = group.keys?.[0]
      if (categoryId == null) continue
      totals.set(categoryId, Number(group.sum?.amount ?? 0))
    }
    return totals
  }, [data])
}
