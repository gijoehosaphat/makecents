import { ApolloLink } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import { useAppContext } from '@/components/context/AppContextProvider'
import {
  UpsertBankAccountDocument,
  UpsertBankAccountReconciliationDocument,
  GetUserAndAccountsAndBankAccountsByEmailDocument,
  CreateTransactionDocument,
  CreateTransaction,
} from '@/graphql/operations'
import { useSnackbar } from 'notistack'
import { useTranslations } from 'next-intl'

export function useUploadHandler() {
  const t = useTranslations('common')
  const { enqueueSnackbar } = useSnackbar()
  const { user } = useAppContext()
  const [createTransaction] = useMutation(CreateTransactionDocument, {
    refetchQueries: [
      {
        query: GetUserAndAccountsAndBankAccountsByEmailDocument,
        variables: {
          email: user?.email || '',
        },
      },
    ],
  })
  const [upsertBankAccount] = useMutation(UpsertBankAccountDocument)
  const [upsertBankAccountReconciliation] = useMutation(UpsertBankAccountReconciliationDocument)

  async function createTransactionsForAccount(
    bankAccountId: number,
    transactions: InputTransaction[]
  ): Promise<{ createdCount: number; duplicateCount: number }> {
    let createdCount = 0
    let duplicateCount = 0
    const promises: Promise<void | ApolloLink.Result<CreateTransaction>>[] = transactions.map((transaction) =>
      createTransaction({
        variables: {
          bankAccountId,
          ...transaction,
          originalAmount: transaction.amount,
          originalPosted: transaction.posted,
        },
      })
        .then(() => {
          createdCount += 1
        })
        .catch((error) => {
          if (error.name === 'ApolloError') {
            for (const graphQLError of error.graphQLErrors) {
              // Key (bank_transaction_id)=(<bank_transaction_id>) already exists.
              if (graphQLError.code !== '23505') {
                console.error(error)
              } else {
                duplicateCount += 1
              }
            }
          } else {
            console.error(error)
          }
        })
    )
    await Promise.all(promises)
    return { createdCount, duplicateCount }
  }

  function notifyUploadResult(numAccounts: number, createdCount: number, duplicateCount: number, success: boolean) {
    if (success) {
      let message = t('upload.successCreated', {
        numAccounts,
        numCreated: createdCount,
      })
      if (duplicateCount !== 0 && createdCount === 0) {
        message = t('upload.successDuplicates', {
          numAccounts,
          numDuplicates: duplicateCount,
        })
      } else if (duplicateCount !== 0 && createdCount !== 0) {
        message = t('upload.successMixed', {
          numAccounts,
          numCreated: createdCount,
          numDuplicates: duplicateCount,
        })
      }
      enqueueSnackbar(message, {
        variant: 'success',
      })
    } else {
      enqueueSnackbar(t('upload.error'), {
        variant: 'error',
      })
    }
  }

  async function uploadHandler(accountGroups: AccountGroup[]): Promise<void> {
    let success = true
    let createdCount = 0
    let duplicateCount = 0
    for (const accountGroup of accountGroups) {
      const { account, reconciliation, transactions } = accountGroup

      //Upsert Account
      await upsertBankAccount({ variables: account })
        .then(async (response) => {
          const bankAccountId = response?.data?.upsertBankAccount?.bankAccount?.id
          if (bankAccountId && reconciliation) {
            await upsertBankAccountReconciliation({
              variables: {
                bankAccountId,
                balance: reconciliation.balance,
                asOf: reconciliation.asOf,
              },
            })
          }
          if (bankAccountId && transactions) {
            const result = await createTransactionsForAccount(bankAccountId, transactions)
            createdCount += result.createdCount
            duplicateCount += result.duplicateCount
          }
        })
        .catch((error) => {
          console.error(error)
          success = false
        })
    }

    notifyUploadResult(accountGroups.length, createdCount, duplicateCount, success)
  }

  async function importCsvTransactions(bankAccountId: number, transactions: InputTransaction[]): Promise<void> {
    const { createdCount, duplicateCount } = await createTransactionsForAccount(bankAccountId, transactions)
    notifyUploadResult(1, createdCount, duplicateCount, true)
  }

  return {
    uploadHandler,
    importCsvTransactions,
  }
}
