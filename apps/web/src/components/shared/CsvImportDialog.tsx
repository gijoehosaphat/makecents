import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Link,
  MenuItem,
  Radio,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslations } from 'next-intl'
import { useSnackbar } from 'notistack'
import { addDays, format } from 'date-fns'
import { useMutation, useQuery } from '@apollo/client/react'
import { useAppContext } from '@/components/context/AppContextProvider'
import { useUploadHandler } from '@/lib/useUploadHandler'
import { formatMoneyCents } from '@/lib/formatMoney'
import { useAmountVisibility } from '@/components/context/AmountVisibilityContext'
import {
  GetBankCsvDefinitionsDocument,
  CreateBankCsvDefinitionDocument,
  GetTransactionsForCsvAccountMatchingDocument,
  GetUserAndAccountsAndBankAccountsByEmailDocument,
  UpdateBankAccountNameDocument,
  UpdateBankCsvDefinitionDocument,
  UpsertBankAccountDocument,
} from '@/graphql/operations'
import { BankCsvDefinition } from '@/graphql/types'
import {
  buildTransactions,
  findAccountIdColumn,
  getMappedColumns,
  groupRowsByAccountId,
  hasAmountColumns,
  parseHeaders,
  parsePreview,
  parseRowDateAndAmount,
} from '@/lib/parsers/Csv'
import { detectMapping } from '@/lib/parsers/CsvDetect'
import {
  AccountMatch,
  DatedAmount,
  extractFileNameIdentifiers,
  identifierMatchesAccount,
  matchAccount,
  scoreOverlap,
} from '@/lib/csvAccountMatching'
import { ACCOUNT_TYPES, bankAccountLabel } from '@/lib/bankAccountLabel'

const NEW_ACCOUNT = 'new'
const PREVIEW_ROWS = 5

type AccountChoice = number | typeof NEW_ACCOUNT | ''

/** Whether a saved template fits this file: every column it uses exists when read with its own settings. */
function definitionFitsFile(definition: BankCsvDefinition, csvText: string): boolean {
  const mapping = definition.mapping as CsvColumnMapping
  const headers = parseHeaders(csvText, mapping)
  const referenced = getMappedColumns(mapping)
  return referenced.length > 0 && referenced.every((column) => headers.includes(column))
}

/** "Chase ••1234" for Chase's "Chase1234_Activity…" exports, otherwise the bare file name. */
function defaultAccountName(fileName: string): string {
  const base = fileName.replace(/\.csv$/i, '')
  const identifiers = extractFileNameIdentifiers(fileName)
  const institution = base.match(/^[A-Za-z]+/)?.[0]
  return identifiers.length === 1 && institution ? `${institution} ••${identifiers[0]}` : base
}

/**
 * Imports one CSV on a single screen. Everything is worked out from the file — its columns, and
 * which account it belongs to — so in the common case the only action is "Import". The user is
 * asked for an account only when the file gives no clear evidence, and the column editor stays
 * hidden unless detection failed or they ask for it.
 */
export function CsvImportDialog({ fileName, csvText, onClose }: { fileName: string; csvText: string; onClose: () => void }) {
  const t = useTranslations('common')
  const { currentAccountId, bankAccounts, user } = useAppContext()
  const { importCsvTransactions } = useUploadHandler()
  const { enqueueSnackbar } = useSnackbar()
  const [isProcessing, setIsProcessing] = useState(false)

  // New accounts take the household's usual currency rather than asking.
  const defaultCurrency = useMemo(() => {
    const counts = new Map<string, number>()
    for (const account of bankAccounts ?? []) {
      if (account.currency) {
        counts.set(account.currency, (counts.get(account.currency) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD'
  }, [bankAccounts])

  // '' means "whatever we matched automatically"; any explicit choice overrides that.
  const [accountChoice, setAccountChoice] = useState<AccountChoice>(bankAccounts?.length ? '' : NEW_ACCOUNT)
  const [newAccountName, setNewAccountName] = useState(() => defaultAccountName(fileName))
  const [newAccountType, setNewAccountType] = useState<string>('CHECKING')

  const [editedMapping, setEditedMapping] = useState<CsvColumnMapping | null>(null)
  const [showColumns, setShowColumns] = useState(false)

  const { data: definitionsData, loading: isLoadingDefinitions } = useQuery(GetBankCsvDefinitionsDocument, {
    variables: { accountId: Number(currentAccountId) },
    skip: !currentAccountId,
  })
  const definitionsRefetch = [{ query: GetBankCsvDefinitionsDocument, variables: { accountId: Number(currentAccountId) } }]
  const fittingDefinitions = useMemo(
    () =>
      ((definitionsData?.allBankCsvDefinitions?.nodes as BankCsvDefinition[]) ?? []).filter((definition) =>
        definitionFitsFile(definition, csvText)
      ),
    [definitionsData, csvText]
  )

  const detected = useMemo(() => detectMapping(csvText), [csvText])

  // How to read the file before we know its account: a saved template that fits, else detection.
  // Note a template only describes the file's *format*, never which account it belongs to — two
  // cards from the same bank export identical columns.
  const baseMapping = (fittingDefinitions[0]?.mapping as CsvColumnMapping | undefined) ?? detected.mapping
  const basePreview = useMemo(() => parsePreview(csvText, baseMapping), [csvText, baseMapping])

  // A column that looks like it holds the bank's own account identifier (e.g. "Card No."), and
  // the distinct values it takes across the file's rows.
  const accountIdColumn = useMemo(() => findAccountIdColumn(basePreview.headers), [basePreview.headers])
  const distinctAccountIds = useMemo(
    () => (accountIdColumn ? Array.from(groupRowsByAccountId(basePreview.rows, accountIdColumn).keys()) : []),
    [accountIdColumn, basePreview.rows]
  )

  // When the file references more than one account, there's no single account to select at
  // all — each group of rows gets matched (or created) by its own account id on import.
  const isMultiAccountFile = distinctAccountIds.length > 1

  const baseRows = useMemo(
    () =>
      basePreview.rows
        .map((row) => parseRowDateAndAmount(row, baseMapping))
        .filter((row): row is DatedAmount => Boolean(row)),
    [basePreview.rows, baseMapping]
  )

  // Existing transactions in the file's date range, to recognize the account by overlap and to
  // count rows that were already imported.
  const overlapFilter = useMemo(() => {
    if (isMultiAccountFile || !baseRows.length || !bankAccounts?.length) {
      return undefined
    }
    const times = baseRows.map((row) => row.posted.getTime())
    return {
      bankAccountId: { in: bankAccounts.map((account) => account.id) },
      splitSourceId: { isNull: true },
      posted: {
        greaterThanOrEqualTo: addDays(new Date(Math.min(...times)), -2).toISOString(),
        lessThanOrEqualTo: addDays(new Date(Math.max(...times)), 2).toISOString(),
      },
    }
  }, [isMultiAccountFile, baseRows, bankAccounts])

  const { data: existingData, error: existingError } = useQuery(GetTransactionsForCsvAccountMatchingDocument, {
    variables: { filter: overlapFilter ?? {} },
    skip: !overlapFilter,
    // An earlier import in this session may have added transactions since this was cached.
    fetchPolicy: 'network-only',
  })
  const existingTransactions = useMemo(
    () => (existingData?.allTransactions?.nodes ?? []).flatMap((node) => (node ? [node] : [])),
    [existingData]
  )

  const isDetecting = isLoadingDefinitions || (!!overlapFilter && !existingData && !existingError)

  const accountMatch: AccountMatch | undefined = useMemo(() => {
    if (isMultiAccountFile || isDetecting || !bankAccounts?.length) {
      return undefined
    }
    const existing = existingTransactions.map((node) => ({
      bankAccountId: node.bankAccountId,
      posted: new Date(node.originalPosted ?? node.posted),
      amount: Number(node.originalAmount ?? node.amount),
    }))
    return matchAccount({
      accounts: bankAccounts,
      accountColumnValue: distinctAccountIds.length === 1 ? distinctAccountIds[0] : undefined,
      fileName,
      overlapScores: scoreOverlap(baseRows, existing),
    })
  }, [isMultiAccountFile, isDetecting, bankAccounts, existingTransactions, distinctAccountIds, fileName, baseRows])

  const matchedAccount = useMemo(
    () => (accountMatch ? bankAccounts?.find((account) => account.id === accountMatch.accountId) : undefined),
    [accountMatch, bankAccounts]
  )

  const effectiveChoice: AccountChoice = accountChoice !== '' ? accountChoice : (matchedAccount?.id ?? '')
  const selectedAccountId = typeof effectiveChoice === 'number' ? effectiveChoice : undefined
  const isAccountAutoMatched = !!matchedAccount && selectedAccountId === matchedAccount.id

  // An account identifier found in the file, kept as a new account's bank account id so later
  // files for the same account (e.g. "Chase1234_…") are recognized without asking.
  const detectedIdentifier = useMemo(() => {
    if (distinctAccountIds.length === 1) {
      return distinctAccountIds[0]
    }
    const fileNameIdentifiers = extractFileNameIdentifiers(fileName)
    return fileNameIdentifiers.length === 1 ? fileNameIdentifiers[0] : undefined
  }, [distinctAccountIds, fileName])

  // The template saved for this account wins over any other that merely fits the file; with none
  // saved, the detected columns are used and saved on import.
  const sourceDefinition = useMemo(
    () =>
      (selectedAccountId
        ? fittingDefinitions.find((definition) => definition.bankAccountId === selectedAccountId)
        : undefined) ?? fittingDefinitions[0],
    [fittingDefinitions, selectedAccountId]
  )
  const activeMapping: CsvColumnMapping =
    editedMapping ?? (sourceDefinition?.mapping as CsvColumnMapping | undefined) ?? detected.mapping

  const preview = useMemo(() => parsePreview(csvText, activeMapping), [csvText, activeMapping])
  const parsedRows = useMemo(
    () =>
      preview.rows
        .map((row) => parseRowDateAndAmount(row, activeMapping))
        .filter((row): row is DatedAmount => Boolean(row)),
    [preview.rows, activeMapping]
  )
  const isMappingUsable = parsedRows.length > 0 && !!activeMapping.descriptionColumn && hasAmountColumns(activeMapping)
  const isColumnsOpen = showColumns || !isMappingUsable

  const dateRange = useMemo(() => {
    if (!parsedRows.length) {
      return undefined
    }
    const times = parsedRows.map((row) => row.posted.getTime())
    return { start: new Date(Math.min(...times)), end: new Date(Math.max(...times)) }
  }, [parsedRows])

  // How many of the file's rows the chosen account already has (same id we'd give them on import).
  const [duplicateCount, setDuplicateCount] = useState(0)
  useEffect(() => {
    if (!selectedAccountId || isMultiAccountFile || !isMappingUsable) {
      setDuplicateCount(0)
      return
    }
    const existingIds = new Set(
      existingTransactions
        .filter((node) => node.bankAccountId === selectedAccountId)
        .map((node) => node.bankTransactionId)
    )
    let isCancelled = false
    buildTransactions(preview.rows, activeMapping, String(selectedAccountId)).then((transactions) => {
      if (!isCancelled) {
        setDuplicateCount(transactions.filter((transaction) => existingIds.has(transaction.bankTransactionId)).length)
      }
    })
    return () => {
      isCancelled = true
    }
  }, [selectedAccountId, isMultiAccountFile, isMappingUsable, existingTransactions, preview.rows, activeMapping])

  const [createBankCsvDefinition] = useMutation(CreateBankCsvDefinitionDocument, { refetchQueries: definitionsRefetch })
  const [updateBankCsvDefinition] = useMutation(UpdateBankCsvDefinitionDocument)
  const [upsertBankAccount] = useMutation(UpsertBankAccountDocument)
  const [updateBankAccountName] = useMutation(UpdateBankAccountNameDocument, {
    refetchQueries: [{ query: GetUserAndAccountsAndBankAccountsByEmailDocument, variables: { email: user?.email || '' } }],
  })

  const accountLabel = (account: Parameters<typeof bankAccountLabel>[0]) => bankAccountLabel(account, t)

  function autoMatchMessage() {
    if (!accountMatch || !matchedAccount) {
      return ''
    }
    const account = accountLabel(matchedAccount)
    switch (accountMatch.reason) {
      case 'accountColumn':
        return t('csvImport.autoDetectedAccount', { account })
      case 'fileName':
        return t('csvImport.autoMatchedByFileName', { account, identifier: accountMatch.detail })
      case 'overlap':
        return t('csvImport.autoMatchedByOverlap', { account, count: Number(accountMatch.detail) })
    }
  }

  function updateMapping(patch: Partial<CsvColumnMapping>) {
    setEditedMapping({ ...activeMapping, ...patch })
  }

  /**
   * Remembers how this file was read, without asking for a template name: columns we detected
   * (or the user corrected) are saved against the account so its next file reads the same way.
   */
  async function saveTemplate(accountId: number, bankAccountId: number | undefined, name: string) {
    if (sourceDefinition && !editedMapping) {
      return
    }
    if (sourceDefinition && bankAccountId && sourceDefinition.bankAccountId === bankAccountId) {
      await updateBankCsvDefinition({ variables: { nodeId: sourceDefinition.nodeId, mapping: activeMapping } })
      return
    }
    await createBankCsvDefinition({ variables: { accountId, name, mapping: activeMapping, bankAccountId } })
  }

  async function handleImport() {
    if (!currentAccountId) {
      return
    }
    setIsProcessing(true)
    try {
      if (isMultiAccountFile && accountIdColumn) {
        const groups = groupRowsByAccountId(preview.rows, accountIdColumn)
        const importGroups: { bankAccountId: number; transactions: InputTransaction[] }[] = []
        for (const [accountId, rows] of groups) {
          const identifierMatches = bankAccounts?.filter((account) => identifierMatchesAccount(accountId, account)) ?? []
          const existingAccount =
            bankAccounts?.find((account) => account.bankAccountId === accountId) ??
            (identifierMatches.length === 1 ? identifierMatches[0] : undefined)
          let bankAccountId = existingAccount?.id
          if (!bankAccountId) {
            const response = await upsertBankAccount({
              variables: { accountId: currentAccountId, type: 'CHECKING', currency: defaultCurrency, bankAccountId: accountId },
            })
            bankAccountId = response.data?.upsertBankAccount?.bankAccount?.id
          }
          if (!bankAccountId) {
            // Stop before importing anything rather than silently leaving this account's rows out.
            throw new Error(`No bank account for ${accountId}`)
          }
          // Ids are built from our own bank account id, like single-account files, so the same
          // rows dedupe however they're imported and app_private.csv_transaction_id can recompute them.
          const transactions = await buildTransactions(rows, activeMapping, String(bankAccountId))
          importGroups.push({ bankAccountId, transactions })
        }

        await importCsvTransactions(importGroups, fileName)
        await saveTemplate(currentAccountId, undefined, fileName.replace(/\.csv$/i, '')).catch(console.error)
        onClose()
        return
      }

      let bankAccountId: number | undefined
      let accountName: string
      if (effectiveChoice === NEW_ACCOUNT) {
        const response = await upsertBankAccount({
          variables: {
            accountId: currentAccountId,
            type: newAccountType,
            currency: defaultCurrency,
            bankAccountId:
              detectedIdentifier && !bankAccounts?.some((account) => account.bankAccountId === detectedIdentifier)
                ? detectedIdentifier
                : crypto.randomUUID(),
          },
        })
        bankAccountId = response.data?.upsertBankAccount?.bankAccount?.id
        accountName = newAccountName.trim()
        if (bankAccountId && accountName) {
          await updateBankAccountName({ variables: { id: bankAccountId, accountId: currentAccountId, name: accountName } })
        }
      } else {
        bankAccountId = selectedAccountId
        const account = bankAccounts?.find((candidate) => candidate.id === selectedAccountId)
        accountName = account ? accountLabel(account) : ''
      }

      if (!bankAccountId) {
        return
      }

      const transactions = await buildTransactions(preview.rows, activeMapping, String(bankAccountId))
      await importCsvTransactions([{ bankAccountId, transactions }], fileName)
      // After the import, so a template that fails to save never blocks the transactions.
      await saveTemplate(currentAccountId, bankAccountId, accountName || fileName.replace(/\.csv$/i, '')).catch(
        console.error
      )
      onClose()
    } catch (error) {
      console.error(error)
      enqueueSnackbar(t('upload.error'), { variant: 'error' })
    } finally {
      setIsProcessing(false)
    }
  }

  const canImport =
    !isProcessing && !isDetecting && isMappingUsable && (isMultiAccountFile || effectiveChoice !== '')

  return (
    <Dialog open maxWidth={'md'} fullWidth onClose={onClose}>
      <DialogTitle>{t('csvImport.title')}</DialogTitle>
      <DialogContent>
        {isDetecting ? (
          <LinearProgress sx={{ my: 4 }} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {dateRange && (
              <Typography>
                {t('csvImport.summary', {
                  count: parsedRows.length,
                  start: format(dateRange.start, 'MMM d, yyyy'),
                  end: format(dateRange.end, 'MMM d, yyyy'),
                })}
              </Typography>
            )}

            {isMultiAccountFile ? (
              <Alert severity={'info'}>
                {t('csvImport.autoDetectedMultiAccount', { count: distinctAccountIds.length })}
              </Alert>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <TextField
                  select
                  fullWidth
                  label={t('csvImport.account')}
                  value={effectiveChoice}
                  onChange={(e) => setAccountChoice(e.target.value === NEW_ACCOUNT ? NEW_ACCOUNT : Number(e.target.value))}
                >
                  {bankAccounts?.map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      {accountLabel(account)}
                    </MenuItem>
                  ))}
                  <MenuItem value={NEW_ACCOUNT}>{t('csvImport.newAccount')}</MenuItem>
                </TextField>
                {isAccountAutoMatched && (
                  <Typography variant={'body2'} color={'text.secondary'}>
                    {autoMatchMessage()}
                  </Typography>
                )}
                {effectiveChoice === '' && (
                  <Typography variant={'body2'} color={'text.secondary'}>
                    {t('csvImport.chooseAccount')}
                  </Typography>
                )}
                {effectiveChoice === NEW_ACCOUNT && (
                  <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                    <TextField
                      label={t('csvImport.accountName')}
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      sx={{ flex: 2 }}
                    />
                    <TextField
                      select
                      label={t('csvImport.accountType')}
                      value={newAccountType}
                      onChange={(e) => setNewAccountType(e.target.value)}
                      sx={{ flex: 1 }}
                    >
                      {ACCOUNT_TYPES.map((type) => (
                        <MenuItem key={type} value={type}>
                          {t(`csvImport.accountTypes.${type}`)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                )}
              </Box>
            )}

            {duplicateCount > 0 && (
              <Typography variant={'body2'} color={'text.secondary'}>
                {duplicateCount >= parsedRows.length
                  ? t('csvImport.allAlreadyImported')
                  : t('csvImport.alreadyImported', { count: duplicateCount })}
              </Typography>
            )}

            {!isMappingUsable && <Alert severity={'warning'}>{t('csvImport.columnsUndetected')}</Alert>}

            {isMappingUsable && (
              <PreviewTable
                rows={preview.rows.filter((row) => parseRowDateAndAmount(row, activeMapping)).slice(0, PREVIEW_ROWS)}
                mapping={activeMapping}
              />
            )}

            {isMappingUsable && (
              <Box>
                <Link component={'button'} variant={'body2'} onClick={() => setShowColumns((show) => !show)}>
                  {showColumns ? t('csvImport.hideColumns') : t('csvImport.adjustColumns')}
                </Link>
              </Box>
            )}

            <Collapse in={isColumnsOpen}>
              <MappingEditor mapping={activeMapping} headers={preview.headers} onChange={updateMapping} />
            </Collapse>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('shared.cancel')}</Button>
        <Button variant={'contained'} onClick={handleImport} disabled={!canImport}>
          {t('csvImport.import')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function MappingEditor({
  mapping,
  headers,
  onChange,
}: {
  mapping: CsvColumnMapping
  headers: string[]
  onChange: (patch: Partial<CsvColumnMapping>) => void
}) {
  const t = useTranslations('common')
  const columnOptions = headers.map((header) => (
    <MenuItem key={header} value={header}>
      {header}
    </MenuItem>
  ))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField
          select
          label={t('csvImport.dateColumn')}
          value={mapping.dateColumn}
          onChange={(e) => onChange({ dateColumn: e.target.value })}
          sx={{ flex: 1 }}
        >
          {columnOptions}
        </TextField>
        <TextField
          label={t('csvImport.dateFormat')}
          value={mapping.dateFormat}
          onChange={(e) => onChange({ dateFormat: e.target.value })}
          sx={{ flex: 1 }}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField
          select
          label={t('csvImport.descriptionColumn')}
          value={mapping.descriptionColumn}
          onChange={(e) => onChange({ descriptionColumn: e.target.value })}
          sx={{ flex: 1 }}
        >
          {columnOptions}
        </TextField>
        <TextField
          select
          label={t('csvImport.memoColumn')}
          value={mapping.memoColumn || ''}
          onChange={(e) => onChange({ memoColumn: e.target.value || undefined })}
          sx={{ flex: 1 }}
        >
          <MenuItem value={''}>{t('csvImport.none')}</MenuItem>
          {columnOptions}
        </TextField>
      </Box>

      <RadioGroup
        row
        value={mapping.amountMode}
        onChange={(e) => onChange({ amountMode: e.target.value as CsvAmountMode })}
      >
        <FormControlLabel value={'single'} control={<Radio />} label={t('csvImport.amountModeSingle')} />
        <FormControlLabel value={'debitCredit'} control={<Radio />} label={t('csvImport.amountModeDebitCredit')} />
      </RadioGroup>

      {mapping.amountMode === 'single' ? (
        <TextField
          select
          label={t('csvImport.amountColumn')}
          value={mapping.amountColumn || ''}
          onChange={(e) => onChange({ amountColumn: e.target.value })}
          fullWidth
        >
          {columnOptions}
        </TextField>
      ) : (
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            select
            label={t('csvImport.debitColumn')}
            value={mapping.debitColumn || ''}
            onChange={(e) => onChange({ debitColumn: e.target.value })}
            sx={{ flex: 1 }}
          >
            {columnOptions}
          </TextField>
          <TextField
            select
            label={t('csvImport.creditColumn')}
            value={mapping.creditColumn || ''}
            onChange={(e) => onChange({ creditColumn: e.target.value })}
            sx={{ flex: 1 }}
          >
            {columnOptions}
          </TextField>
        </Box>
      )}

      <FormControlLabel
        control={
          <Checkbox
            checked={mapping.amountSign === 'flipped'}
            onChange={(e) => onChange({ amountSign: e.target.checked ? 'flipped' : 'asIs' })}
          />
        }
        label={t('csvImport.amountSignFlipped')}
      />

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField
          label={t('csvImport.delimiter')}
          value={mapping.delimiter}
          onChange={(e) => onChange({ delimiter: e.target.value })}
          sx={{ width: 120 }}
        />
        <TextField
          label={t('csvImport.skipRows')}
          type={'number'}
          value={mapping.skipRows}
          onChange={(e) => onChange({ skipRows: Number(e.target.value) || 0 })}
          sx={{ width: 200 }}
        />
        <FormControlLabel
          control={
            <Checkbox checked={mapping.hasHeaderRow} onChange={(e) => onChange({ hasHeaderRow: e.target.checked })} />
          }
          label={t('csvImport.hasHeaderRow')}
        />
      </Box>
    </Box>
  )
}

function PreviewTable({ rows, mapping }: { rows: Record<string, string>[]; mapping: CsvColumnMapping }) {
  const t = useTranslations('common')
  const { hidden } = useAmountVisibility()
  return (
    <Table size={'small'}>
      <TableHead>
        <TableRow>
          <TableCell>{t('csvImport.previewDate')}</TableCell>
          <TableCell>{t('csvImport.previewName')}</TableCell>
          <TableCell>{t('csvImport.previewMemo')}</TableCell>
          <TableCell align={'right'}>{t('csvImport.previewAmount')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, index) => {
          // Show the date as we parsed it, so a wrong date format is obvious before importing.
          const parsed = parseRowDateAndAmount(row, mapping)
          return (
            <TableRow key={index}>
              <TableCell>{parsed ? format(parsed.posted, 'MMM d, yyyy') : '—'}</TableCell>
              <TableCell>{row[mapping.descriptionColumn]}</TableCell>
              <TableCell>{mapping.memoColumn ? row[mapping.memoColumn] : ''}</TableCell>
              <TableCell align={'right'}>{parsed ? formatMoneyCents(parsed.amount, 'USD', hidden) : '—'}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
