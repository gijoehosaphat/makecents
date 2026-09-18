import React, { useCallback, useState } from 'react'
// import { useSnackbar } from 'notistack'
import { Box, Backdrop, Paper, Typography, LinearProgress, Divider } from '@mui/material'
import { useDropzone } from 'react-dropzone'
import { parseFile } from '../../lib/parsers/OpenFinancialExchange'
import type {
  OpenFinancialExchangeFormat,
  StatementTransaction,
  BankAccount,
  CreditCardAccount,
} from '../../lib/parsers/OpenFinancialExchange'
import { parse } from 'date-fns'
import { useTheme } from '@mui/material/styles'
import { useAppContext } from '@/components/context/AppContextProvider'
import { useTranslations } from 'next-intl'
import { useUploadHandler } from '@/lib/useUploadHandler'
import { useSnackbar } from 'notistack'
import { CsvImportDialog } from './CsvImportDialog'

function parseDate(dateString: string) {
  const dateParts = String(dateString).split('[')
  const timezone = Number(dateParts[1].replace(']', '')).toLocaleString('en-US', {
    minimumIntegerDigits: 2,
  })
  return parse(`${dateParts[0]}[${timezone}]`, 'yyyyMMddHHmmss[x]', new Date())
}

export function Dropzone({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common')
  const { enqueueSnackbar } = useSnackbar()
  const { user } = useAppContext()
  const theme = useTheme()
  const { uploadHandler } = useUploadHandler()
  const [isProcessing, setIsProcessing] = useState(false)
  const [csvQueue, setCsvQueue] = useState<{ fileName: string; text: string }[]>([])

  const processOfxData = useCallback(
    (parsedFiles: OpenFinancialExchangeFormat[]) => {
      const userId = user?.id
      if (userId) {
        const accountGroups: AccountGroup[] = []

        const addAccountGroup = (newAccountGroup: AccountGroup) => {
          const index = accountGroups.findIndex(
            (accountGroup) => accountGroup.account.bankAccountId === newAccountGroup.account.bankAccountId
          )
          if (index === -1) {
            accountGroups.push(newAccountGroup)
            return accountGroups.length - 1
          }
          return index
        }

        parsedFiles.forEach((ofxData) => {
          const addTransactionsToAccountGroup = (
            statementTransactions: StatementTransaction[],
            accountGroupIndex: number
          ) => {
            statementTransactions.forEach((statementTransaction) => {
              const newTransaction = {
                posted: parseDate(statementTransaction.DTPOSTED),
                amount: Number((Number(statementTransaction.TRNAMT) * 100).toFixed(2)),
                bankTransactionId: statementTransaction.FITID,
                name: statementTransaction.NAME,
                memo: statementTransaction.MEMO,
                type: statementTransaction.TRNTYPE,
              }
              const index = accountGroups[accountGroupIndex].transactions.findIndex(
                (transaction) => transaction.bankTransactionId === newTransaction.bankTransactionId
              )
              if (index === -1) {
                accountGroups[accountGroupIndex].transactions.push(newTransaction)
              }
            })
          }

          const handleBankAccount = (bankAccount: BankAccount) => {
            const accountGroup = {
              account: {
                bankAccountId: bankAccount.STMTRS.BANKACCTFROM.ACCTID,
                type: bankAccount.STMTRS.BANKACCTFROM.ACCTTYPE,
                currency: bankAccount.STMTRS.CURDEF,
                userId,
              },
              reconciliation: {
                balance: Number((Number(bankAccount.STMTRS.LEDGERBAL.BALAMT) * 100).toFixed(2)),
                asOf: parseDate(bankAccount.STMTRS.LEDGERBAL.DTASOF),
              },
              transactions: [],
            }
            const index = addAccountGroup(accountGroup)
            const transactionStatements = bankAccount?.STMTRS?.BANKTRANLIST?.STMTTRN
            addTransactionsToAccountGroup(
              Array.isArray(transactionStatements) ? transactionStatements : [transactionStatements],
              index
            )
          }

          const handleCreditCardAccount = (creditCardAccount: CreditCardAccount) => {
            const accountGroup = {
              account: {
                bankAccountId: creditCardAccount.CCSTMTRS.CCACCTFROM.ACCTID,
                type: 'CREDIT_CARD',
                currency: creditCardAccount.CCSTMTRS.CURDEF,
                userId,
              },
              reconciliation: {
                balance: Number((Number(creditCardAccount.CCSTMTRS.LEDGERBAL.BALAMT) * 100).toFixed(2)),
                asOf: parseDate(creditCardAccount.CCSTMTRS.LEDGERBAL.DTASOF),
              },
              transactions: [],
            }
            const index = addAccountGroup(accountGroup)
            const transactionStatements = creditCardAccount?.CCSTMTRS?.BANKTRANLIST?.STMTTRN
            addTransactionsToAccountGroup(
              Array.isArray(transactionStatements) ? transactionStatements : [transactionStatements],
              index
            )
          }

          //Bank Accounts (Savings, Checking, etc)
          const bankAccounts = ofxData?.OFX?.BANKMSGSRSV1?.STMTTRNRS
          if (bankAccounts) {
            if (Array.isArray(bankAccounts)) {
              bankAccounts.forEach(handleBankAccount)
            } else {
              handleBankAccount(bankAccounts)
            }
          }

          //Credit Card Accounts
          const creditCardAccounts = ofxData?.OFX?.CREDITCARDMSGSRSV1?.CCSTMTTRNRS
          if (creditCardAccounts) {
            if (Array.isArray(creditCardAccounts)) {
              creditCardAccounts.forEach(handleCreditCardAccount)
            } else {
              handleCreditCardAccount(creditCardAccounts)
            }
          }
        })
        uploadHandler(accountGroups).then(() => {
          setIsProcessing(false)
        })
      }
    },
    [uploadHandler, user?.id]
  )

  const processParsedFiles = useCallback(
    (parsedFiles: OpenFinancialExchangeFormat[]) => {
      parsedFiles.sort((a, b) => {
        const aDate = parseDate(a.OFX.SIGNONMSGSRSV1.SONRS.DTSERVER).getTime()
        const bDate = parseDate(b.OFX.SIGNONMSGSRSV1.SONRS.DTSERVER).getTime()
        if (aDate > bDate) {
          return -1
        } else if (bDate > aDate) {
          return 1
        } else {
          return 0
        }
      })
      processOfxData(parsedFiles)
    },
    [processOfxData]
  )

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const csvFiles = acceptedFiles.filter((file) => file.name.toLowerCase().endsWith('.csv'))
      const ofxFiles = acceptedFiles.filter((file) => !csvFiles.includes(file))

      csvFiles.forEach((file) => {
        const reader = new FileReader()
        reader.readAsText(file)

        reader.onload = () => {
          const text = String(reader.result || '')
          if (text) {
            setCsvQueue((queue) => [...queue, { fileName: file.name, text }])
          }
        }

        reader.onerror = () => {
          console.error(reader.error)
          enqueueSnackbar(t('upload.error'), {
            variant: 'error',
          })
        }
      })

      if (!ofxFiles.length) {
        return
      }

      setIsProcessing(true)
      const parsedFiles: OpenFinancialExchangeFormat[] = []

      //Large files may be slow to read/process? Webworkers might help?
      ofxFiles.forEach(async (file: File) => {
        const reader = new FileReader()
        reader.readAsText(file)

        reader.onload = () => {
          const result = String(reader.result)
          if (result) {
            parseFile(result).then((ofxData) => {
              parsedFiles.push(ofxData)

              if (ofxFiles.length === parsedFiles.length) {
                processParsedFiles(parsedFiles)
              }
            })
          }
        }

        reader.onerror = () => {
          console.error(reader.error)
          enqueueSnackbar(t('upload.error'), {
            variant: 'error',
          })
          setIsProcessing(false)
        }
      })
    },
    [processParsedFiles, enqueueSnackbar, t]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop,
  })

  const styles = {
    dropzone: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    },
    backdrop: {
      zIndex: theme.zIndex.drawer + 1,
      color: '#fff',
    },
  }

  return (
    <Box {...getRootProps()} sx={styles.dropzone}>
      <input {...getInputProps()} />
      {children}
      {/* <pre>{JSON.stringify(input, null, 2)}</pre> */}
      <Backdrop sx={styles.backdrop} open={isDragActive}>
        <Paper>
          <Box p={4}>
            <Typography variant={'h1'} sx={{ mb: 4 }}>
              {t('upload.instructions')}
            </Typography>
            <LinearProgress color="secondary" />
          </Box>
        </Paper>
      </Backdrop>
      <Backdrop sx={styles.backdrop} open={isProcessing}>
        <Paper>
          <Box p={4}>
            <Typography variant={'h1'} sx={{ mb: 4 }}>
              {t('upload.processing')}
            </Typography>
            <LinearProgress color="secondary" />
          </Box>
        </Paper>
      </Backdrop>
      {csvQueue[0] && (
        <CsvImportDialog
          fileName={csvQueue[0].fileName}
          csvText={csvQueue[0].text}
          onClose={() => setCsvQueue((queue) => queue.slice(1))}
        />
      )}
    </Box>
  )
}
