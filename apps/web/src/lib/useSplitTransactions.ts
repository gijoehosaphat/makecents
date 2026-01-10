import { Transaction } from '@/graphql/types'
import { useMemo } from 'react'
import { useSuspenseQuery } from '@apollo/client/react'
import { GetTransactionWithSplitTransactionsDocument } from '@/graphql/operations'

export function useSplitTransactions({ transaction }: { transaction: Transaction }) {
  const query = useSuspenseQuery(GetTransactionWithSplitTransactionsDocument, {
    variables: {
      nodeId: transaction.nodeId,
    },
  })

  const splitTransactions: Transaction[] = useMemo(() => {
    return (query?.data?.transaction?.transactionsBySplitSourceId?.nodes as Transaction[]) || []
  }, [query?.data?.transaction?.transactionsBySplitSourceId?.nodes])

  return {
    splitTransactions,
  }
}
