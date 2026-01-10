import { ApolloLink } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import { useAppContext } from '@/components/context/AppContextProvider'
import {
  UpsertBankAccountDocument,
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

  async function uploadHandler(accountGroups: AccountGroup[]): Promise<void> {
    let success = true
    let createdCount = 0
    let duplicateCount = 0
    for (const accountGroup of accountGroups) {
      const { account, transactions } = accountGroup

      //Upsert Account
      await upsertBankAccount({ variables: account })
        .then(async (response) => {
          const bankAccountId = response?.data?.upsertBankAccount?.bankAccount?.id
          if (bankAccountId && transactions) {
            let promises: Promise<void | ApolloLink.Result<CreateTransaction>>[] = []
            for (const transaction of transactions) {
              promises.push(
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
            }
          }
        })
        .catch((error) => {
          console.error(error)
          success = false
        })
    }

    if (success) {
      let message = t('upload.successCreated', {
        numAccounts: accountGroups.length,
        numCreated: createdCount,
      })
      if (duplicateCount !== 0 && createdCount === 0) {
        message = t('upload.successDuplicates', {
          numAccounts: accountGroups.length,
          numDuplicates: duplicateCount,
        })
      } else if (duplicateCount !== 0 && createdCount !== 0) {
        message = t('upload.successMixed', {
          numAccounts: accountGroups.length,
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

  return {
    uploadHandler,
  }
}
