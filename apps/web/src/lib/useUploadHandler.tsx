import { useApolloClient, useMutation } from '@apollo/client/react'
import { Button } from '@mui/material'
import {
  UpsertBankAccountDocument,
  UpsertBankAccountReconciliationDocument,
  ImportTransactionsDocument,
  UndoImportBatchDocument,
} from '@/graphql/operations'
import { useSnackbar } from 'notistack'
import { useTranslations } from 'next-intl'

// Long enough to notice a wrong import and undo it; Settings → Imports works after that too.
const UNDO_SNACKBAR_DURATION = 15000

export function useUploadHandler() {
  const t = useTranslations('common')
  const { enqueueSnackbar, closeSnackbar } = useSnackbar()
  const client = useApolloClient()
  const [importTransactions] = useMutation(ImportTransactionsDocument)
  const [undoImportBatch] = useMutation(UndoImportBatchDocument)

  // Imports and undos can touch any visible list, total or balance; refresh them once per
  // file rather than once per bank account in it.
  async function refreshActiveQueries() {
    try {
      await client.refetchQueries({ include: 'active' })
    } catch (error) {
      // A failed refresh shouldn't turn a finished import into an error.
      console.error(error)
    }
  }
  const [upsertBankAccount] = useMutation(UpsertBankAccountDocument)
  const [upsertBankAccountReconciliation] = useMutation(UpsertBankAccountReconciliationDocument)

  /** Imports in one request; rows the account already has are skipped by the database. */
  async function createTransactionsForAccount(
    bankAccountId: number,
    transactions: InputTransaction[],
    fileName?: string
  ): Promise<{ createdCount: number; duplicateCount: number; batchId?: number }> {
    const response = await importTransactions({
      variables: {
        bankAccountId,
        fileName: fileName || null,
        transactions: transactions.map(({ posted, amount, name, memo, type, bankTransactionId }) => ({
          posted,
          amount,
          name,
          memo,
          type,
          bankTransactionId,
        })),
      },
    })
    const batch = response.data?.importTransactions?.importBatch
    return {
      createdCount: batch?.createdCount ?? 0,
      duplicateCount: batch?.duplicateCount ?? 0,
      // An import that added nothing leaves no batch behind to undo.
      batchId: batch?.createdCount ? batch.id : undefined,
    }
  }

  async function undoImports(batchIds: number[]) {
    try {
      for (const batchId of batchIds) {
        await undoImportBatch({ variables: { batchId } })
      }
      await refreshActiveQueries()
      enqueueSnackbar(t('upload.undone'), { variant: 'info' })
    } catch (error) {
      console.error(error)
      enqueueSnackbar(t('upload.undoError'), { variant: 'error' })
    }
  }

  function notifyUploadResult(
    numAccounts: number,
    createdCount: number,
    duplicateCount: number,
    success: boolean,
    batchIds: number[] = []
  ) {
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
        autoHideDuration: batchIds.length ? UNDO_SNACKBAR_DURATION : undefined,
        action: batchIds.length
          ? (key) => (
              <Button
                color={'inherit'}
                onClick={() => {
                  closeSnackbar(key)
                  undoImports(batchIds)
                }}
              >
                {t('upload.undo')}
              </Button>
            )
          : undefined,
      })
    } else {
      enqueueSnackbar(t('upload.error'), {
        variant: 'error',
      })
    }
  }

  async function uploadHandler(accountGroups: AccountGroup[], fileName?: string): Promise<void> {
    let success = true
    let createdCount = 0
    let duplicateCount = 0
    const batchIds: number[] = []
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
            const result = await createTransactionsForAccount(bankAccountId, transactions, fileName)
            createdCount += result.createdCount
            duplicateCount += result.duplicateCount
            if (result.batchId) {
              batchIds.push(result.batchId)
            }
          }
        })
        .catch((error) => {
          console.error(error)
          success = false
        })
    }

    await refreshActiveQueries()
    notifyUploadResult(accountGroups.length, createdCount, duplicateCount, success, batchIds)
  }

  /** Imports a CSV's rows for one or more bank accounts that already exist, with a single result message. */
  async function importCsvTransactions(
    groups: { bankAccountId: number; transactions: InputTransaction[] }[],
    fileName?: string
  ): Promise<void> {
    let createdCount = 0
    let duplicateCount = 0
    const batchIds: number[] = []
    try {
      for (const { bankAccountId, transactions } of groups) {
        const result = await createTransactionsForAccount(bankAccountId, transactions, fileName)
        createdCount += result.createdCount
        duplicateCount += result.duplicateCount
        if (result.batchId) {
          batchIds.push(result.batchId)
        }
      }
      notifyUploadResult(groups.length, createdCount, duplicateCount, true, batchIds)
    } catch (error) {
      console.error(error)
      notifyUploadResult(groups.length, createdCount, duplicateCount, false)
    }
    await refreshActiveQueries()
  }

  return {
    uploadHandler,
    importCsvTransactions,
  }
}
