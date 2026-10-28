import React, { useCallback, useEffect, useState } from 'react'
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
import { toCents } from '@/lib/formatMoney'
import { accountTypeFromOfx } from '@/lib/bankAccountTypes'

const INTERNAL_DRAG_TYPE = 'application/x-makecents-internal'

// While dragging, browsers expose each file's MIME type but not its name. OFX/QFX/QBO files usually have no type or a
// vendor/text one, so only files whose type rules them out (e.g. application/pdf, image/png) count as unsupported; the
// rest are checked by content once dropped.
function isPossiblyImportableType(type: string) {
  return (
    !type ||
    type.startsWith('text/') ||
    type.startsWith('application/vnd.intu.') ||
    [
      'application/csv',
      'application/vnd.ms-excel',
      'application/x-ofx',
      'application/ofx',
      'application/x-qfx',
      'application/x-qbo',
      'application/xml',
      'application/octet-stream',
    ].includes(type)
  )
}

function isUnsupportedDrag(dataTransfer: DataTransfer | null) {
  const types = Array.from(dataTransfer?.types ?? [])
  if (types.includes(INTERNAL_DRAG_TYPE)) {
    return false
  }
  if (!types.includes('Files') && !types.includes('application/x-moz-file')) {
    return true
  }
  const fileTypes = Array.from(dataTransfer?.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.type)
  // Mixed drags still show the import overlay; the unsupported files are reported once dropped.
  return fileTypes.length > 0 && !fileTypes.some(isPossiblyImportableType)
}

function parseDate(dateString: string) {
  const dateParts = String(dateString).split('[')

  if (!dateParts[1]) {
    const paddedDatePart = dateParts[0].padEnd(14, '0').slice(0, 14)
    return parse(paddedDatePart, 'yyyyMMddHHmmss', new Date())
  }

  const timezone = Number(dateParts[1].replace(']', '')).toLocaleString('en-US', {
    minimumIntegerDigits: 2,
  })
  return parse(`${dateParts[0]}[${timezone}]`, 'yyyyMMddHHmmss[x]', new Date())
}

export function Dropzone({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common')
  const { enqueueSnackbar } = useSnackbar()
  const { currentAccountId } = useAppContext()
  const theme = useTheme()
  const { uploadHandler } = useUploadHandler()
  const [isProcessing, setIsProcessing] = useState(false)
  const [csvQueue, setCsvQueue] = useState<{ id: string; fileName: string; text: string }[]>([])

  const processOfxData = useCallback(
    (parsedFiles: OpenFinancialExchangeFormat[], fileName: string) => {
      const accountId = currentAccountId
      if (accountId) {
        const accountGroups: AccountGroup[] = []

        const addAccountGroup = (newAccountGroup: AccountGroup) => {
          const index = accountGroups.findIndex(
            (accountGroup) => accountGroup.account.bankAccountId === newAccountGroup.account.bankAccountId,
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
            accountGroupIndex: number,
          ) => {
            statementTransactions.forEach((statementTransaction) => {
              const newTransaction = {
                posted: parseDate(statementTransaction.DTPOSTED),
                amount: toCents(Number(statementTransaction.TRNAMT)),
                bankTransactionId: statementTransaction.FITID,
                name: statementTransaction.NAME,
                memo: statementTransaction.MEMO,
                type: statementTransaction.TRNTYPE,
              }
              const index = accountGroups[accountGroupIndex].transactions.findIndex(
                (transaction) => transaction.bankTransactionId === newTransaction.bankTransactionId,
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
                ...accountTypeFromOfx(bankAccount.STMTRS.BANKACCTFROM.ACCTTYPE),
                currency: bankAccount.STMTRS.CURDEF,
                accountId,
              },
              reconciliation: {
                balance: toCents(Number(bankAccount.STMTRS.LEDGERBAL.BALAMT)),
                asOf: parseDate(bankAccount.STMTRS.LEDGERBAL.DTASOF),
              },
              transactions: [],
            }
            const index = addAccountGroup(accountGroup)
            const transactionStatements = bankAccount?.STMTRS?.BANKTRANLIST?.STMTTRN
            addTransactionsToAccountGroup(
              Array.isArray(transactionStatements) ? transactionStatements : [transactionStatements],
              index,
            )
          }

          const handleCreditCardAccount = (creditCardAccount: CreditCardAccount) => {
            const accountGroup = {
              account: {
                bankAccountId: creditCardAccount.CCSTMTRS.CCACCTFROM.ACCTID,
                type: 'CREDIT_CARD',
                currency: creditCardAccount.CCSTMTRS.CURDEF,
                accountId,
              },
              reconciliation: {
                balance: toCents(Number(creditCardAccount.CCSTMTRS.LEDGERBAL.BALAMT)),
                asOf: parseDate(creditCardAccount.CCSTMTRS.LEDGERBAL.DTASOF),
              },
              transactions: [],
            }
            const index = addAccountGroup(accountGroup)
            const transactionStatements = creditCardAccount?.CCSTMTRS?.BANKTRANLIST?.STMTTRN
            addTransactionsToAccountGroup(
              Array.isArray(transactionStatements) ? transactionStatements : [transactionStatements],
              index,
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
        uploadHandler(accountGroups, fileName).then(() => {
          setIsProcessing(false)
        })
      }
    },
    [uploadHandler, currentAccountId],
  )

  const processParsedFiles = useCallback(
    (parsedFiles: OpenFinancialExchangeFormat[], fileName: string) => {
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
      processOfxData(parsedFiles, fileName)
    },
    [processOfxData],
  )

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      let readFiles: { file: File; text: string }[]
      try {
        readFiles = await Promise.all(acceptedFiles.map(async (file) => ({ file, text: await file.text() })))
      } catch (error) {
        console.error(error)
        enqueueSnackbar(t('upload.error'), {
          variant: 'error',
        })
        return
      }

      // Recognized by content rather than extension (banks use .ofx, .qfx, .qbo, ...), so anything else is
      // reported as unsupported instead of failing inside the OFX parser.
      const ofxFiles: { file: File; text: string }[] = []
      const unsupportedFileNames: string[] = []
      readFiles.forEach(({ file, text }) => {
        if (file.name.toLowerCase().endsWith('.csv')) {
          if (text) {
            setCsvQueue((queue) => [...queue, { id: crypto.randomUUID(), fileName: file.name, text }])
          }
        } else if (text.includes('<OFX>')) {
          ofxFiles.push({ file, text })
        } else {
          unsupportedFileNames.push(file.name)
        }
      })

      if (unsupportedFileNames.length) {
        enqueueSnackbar(t('upload.unsupportedFiles', { fileNames: unsupportedFileNames.join(', ') }), {
          variant: 'warning',
        })
      }

      if (!ofxFiles.length) {
        return
      }

      setIsProcessing(true)
      try {
        const parsedFiles = await Promise.all(ofxFiles.map(({ text }) => parseFile(text)))
        processParsedFiles(parsedFiles, ofxFiles.map(({ file }) => file.name).join(', '))
      } catch (error) {
        console.error(error)
        enqueueSnackbar(t('upload.error'), {
          variant: 'error',
        })
        setIsProcessing(false)
      }
    },
    [processParsedFiles, enqueueSnackbar, t],
  )

  // Track drags that can't be imported (no files at all, e.g. links, text or a file the browser can't hand over, or only
  // files of an unsupported type) to tell the user so instead of showing the import overlay. Drags started within the
  // page (e.g. reordering bank accounts) are left alone.
  const [unsupportedDragDepth, setUnsupportedDragDepth] = useState(0)

  useEffect(() => {
    // Tag drags that start within the page, since the drag data is all a drop target can see of where a drag came from
    const handleDragStart = (event: DragEvent) => event.dataTransfer?.setData(INTERNAL_DRAG_TYPE, '1')
    window.addEventListener('dragstart', handleDragStart)
    return () => window.removeEventListener('dragstart', handleDragStart)
  }, [])

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
    <Box
      {...getRootProps({
        onDragEnter: (event) => {
          if (isUnsupportedDrag(event.dataTransfer)) {
            setUnsupportedDragDepth((depth) => depth + 1)
          }
        },
        onDragLeave: () => setUnsupportedDragDepth((depth) => Math.max(depth - 1, 0)),
        onDrop: () => setUnsupportedDragDepth(0),
      })}
      sx={styles.dropzone}
    >
      <input {...getInputProps()} />
      {children}
      {/* <pre>{JSON.stringify(input, null, 2)}</pre> */}
      <Backdrop sx={styles.backdrop} open={isDragActive && unsupportedDragDepth === 0}>
        <Paper>
          <Box p={4}>
            <Typography variant={'h1'} sx={{ mb: 4 }}>
              {t('upload.instructions')}
            </Typography>
            <LinearProgress color="secondary" />
          </Box>
        </Paper>
      </Backdrop>
      <Backdrop sx={styles.backdrop} open={unsupportedDragDepth > 0}>
        <Paper>
          <Box p={4}>
            <Typography variant={'h1'} sx={{ mb: 2 }}>
              {t('upload.unsupported')}
            </Typography>
            <Typography>{t('upload.supportedTypes')}</Typography>
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
          // Keyed per file so each queued file starts fresh instead of inheriting the previous
          // file's chosen account and template.
          key={csvQueue[0].id}
          fileName={csvQueue[0].fileName}
          csvText={csvQueue[0].text}
          onClose={() => setCsvQueue((queue) => queue.slice(1))}
        />
      )}
    </Box>
  )
}
