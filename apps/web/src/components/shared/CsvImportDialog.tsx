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
import { useQuery } from '@apollo/client/react'
import { useMutationWithToast } from '@/lib/useMutationWithToast'
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
  describeColumns,
  findAccountIdColumn,
  groupRowsByAccountId,
  hasAmountColumns,
  parseHeaders,
  parsePreview,
  parseRowDateAndAmount,
  readMemo,
  readName,
} from '@/lib/parsers/Csv'
import { detectMapping } from '@/lib/parsers/CsvDetect'
import {
  adaptTemplateToFile,
  changesRowIds,
  CsvTemplate,
  findChangedFormat,
  findTemplatesForFile,
  fingerprintFile,
  normalizeSavedMapping,
  resolveAccountColumn,
} from '@/lib/parsers/CsvTemplates'
import {
  AccountMatch,
  DatedAmount,
  extractFileNameIdentifiers,
  identifierMatchesAccount,
  matchAccount,
  scoreOverlap,
} from '@/lib/csvAccountMatching'
import { ACCOUNT_TYPES } from '@/lib/bankAccountTypes'
import { countDuplicateRows } from '@/lib/csvDuplicates'
import { useBankAccountLabel } from '@/components/shared/BankAccountLabel'

const NEW_ACCOUNT = 'new'
const PREVIEW_ROWS = 5

type AccountChoice = number | typeof NEW_ACCOUNT | ''

function toTemplate(definition: BankCsvDefinition): CsvTemplate {
  return {
    id: definition.id,
    nodeId: definition.nodeId,
    name: definition.name ?? '',
    fingerprint: definition.fingerprint,
    mapping: normalizeSavedMapping(definition.mapping),
    bankAccountIds: (definition.bankAccountIds ?? []).filter((id): id is number => typeof id === 'number'),
  }
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
export function CsvImportDialog({
  fileName,
  csvText,
  onClose,
}: {
  fileName: string
  csvText: string
  onClose: () => void
}) {
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
  const definitionsRefetch = [
    { query: GetBankCsvDefinitionsDocument, variables: { accountId: Number(currentAccountId) } },
  ]
  const detected = useMemo(() => detectMapping(csvText), [csvText])
  const templates = useMemo(
    () => ((definitionsData?.allBankCsvDefinitions?.nodes as BankCsvDefinition[]) ?? []).map(toTemplate),
    [definitionsData],
  )
  // Templates are identified by the file's format, so only those made for exactly this format
  // apply. Without one, a template for an earlier version of the format (the bank has since added
  // or dropped a few columns) is carried over to the new columns.
  const matchingTemplates = useMemo(
    () => findTemplatesForFile(csvText, templates, detected.mapping),
    [csvText, templates, detected],
  )
  const changedFormat = useMemo(
    () => (matchingTemplates.length ? undefined : findChangedFormat(csvText, templates, detected.mapping)),
    [matchingTemplates, csvText, templates, detected],
  )
  const changedFormatMapping = useMemo(
    () =>
      changedFormat
        ? adaptTemplateToFile(
            changedFormat.template.mapping,
            detected.mapping,
            parseHeaders(csvText, detected.mapping),
            changedFormat.added,
          )
        : undefined,
    [changedFormat, detected, csvText],
  )

  // How to read the file before we know its account. A template only describes the file's
  // *format*, never which account it belongs to: several accounts at one bank export identical
  // columns, and share the template.
  const baseMapping = matchingTemplates[0]?.mapping ?? changedFormatMapping ?? detected.mapping
  const basePreview = useMemo(() => parsePreview(csvText, baseMapping), [csvText, baseMapping])

  // The column holding the bank's own account identifier (e.g. "account_number", "Card No."), and
  // the distinct values it takes across the file's rows.
  const accountIdColumn = useMemo(
    () => resolveAccountColumn(baseMapping, basePreview.headers, findAccountIdColumn),
    [baseMapping, basePreview.headers],
  )
  const distinctAccountIds = useMemo(
    () => (accountIdColumn ? Array.from(groupRowsByAccountId(basePreview.rows, accountIdColumn).keys()) : []),
    [accountIdColumn, basePreview.rows],
  )

  // When the file references more than one account, there's no single account to select at
  // all — each group of rows gets matched (or created) by its own account id on import.
  const isMultiAccountFile = distinctAccountIds.length > 1

  const baseRows = useMemo(
    () =>
      basePreview.rows
        .map((row) => parseRowDateAndAmount(row, baseMapping))
        .filter((row): row is DatedAmount => Boolean(row)),
    [basePreview.rows, baseMapping],
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
    variables: {
      filter: overlapFilter ?? {},
      deletedFilter: { bankAccountId: { in: overlapFilter?.bankAccountId.in ?? [] } },
    },
    skip: !overlapFilter,
    // An earlier import in this session may have added transactions since this was cached.
    fetchPolicy: 'network-only',
  })
  const existingTransactions = useMemo(
    () => (existingData?.allTransactions?.nodes ?? []).flatMap((node) => (node ? [node] : [])),
    [existingData],
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
      templateAccountIds: (matchingTemplates[0] ?? changedFormat?.template)?.bankAccountIds,
    })
  }, [
    isMultiAccountFile,
    isDetecting,
    bankAccounts,
    existingTransactions,
    distinctAccountIds,
    fileName,
    baseRows,
    matchingTemplates,
    changedFormat,
  ])

  const matchedAccount = useMemo(
    () => (accountMatch ? bankAccounts?.find((account) => account.id === accountMatch.accountId) : undefined),
    [accountMatch, bankAccounts],
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

  // Two formats can only look alike without a header row (same column count); then the one this
  // account used before wins. With no template at all, the detected columns are used and saved.
  const matchedTemplate = useMemo(
    () =>
      (selectedAccountId
        ? matchingTemplates.find((template) => template.bankAccountIds.includes(selectedAccountId))
        : undefined) ?? matchingTemplates[0],
    [matchingTemplates, selectedAccountId],
  )
  const savedMapping = matchedTemplate?.mapping ?? changedFormatMapping
  const activeMapping: CsvColumnMapping = editedMapping ?? savedMapping ?? detected.mapping
  const activeAccountColumn = useMemo(
    () => resolveAccountColumn(activeMapping, parseHeaders(csvText, activeMapping), findAccountIdColumn),
    [activeMapping, csvText],
  )
  // Carrying a template over to a changed format gives rows new ids when the columns they're
  // built from changed, so rows imported before can come in again.
  const changedFormatChangesIds =
    !!changedFormat && changesRowIds(changedFormat.template.mapping, editedMapping ?? changedFormatMapping!)

  const preview = useMemo(() => parsePreview(csvText, activeMapping), [csvText, activeMapping])
  const columnLabels = useMemo(() => describeColumns(csvText, activeMapping), [csvText, activeMapping])
  const parsedRows = useMemo(
    () =>
      preview.rows
        .map((row) => parseRowDateAndAmount(row, activeMapping))
        .filter((row): row is DatedAmount => Boolean(row)),
    [preview.rows, activeMapping],
  )
  const isMappingUsable =
    parsedRows.length > 0 && activeMapping.nameColumns.length > 0 && hasAmountColumns(activeMapping)
  const isColumnsOpen = showColumns || !isMappingUsable

  const dateRange = useMemo(() => {
    if (!parsedRows.length) {
      return undefined
    }
    const times = parsedRows.map((row) => row.posted.getTime())
    return { start: new Date(Math.min(...times)), end: new Date(Math.max(...times)) }
  }, [parsedRows])

  // How many of the file's rows the chosen account already has, as the import will decide it.
  const [duplicateCount, setDuplicateCount] = useState(0)
  useEffect(() => {
    if (!selectedAccountId || isMultiAccountFile || !isMappingUsable) {
      setDuplicateCount(0)
      return
    }
    const existingRows = existingTransactions
      .filter((node) => node.bankAccountId === selectedAccountId)
      .map((node) => ({
        posted: new Date(node.originalPosted ?? node.posted),
        amount: Number(node.originalAmount ?? node.amount),
        name: node.name,
        bankTransactionId: node.bankTransactionId,
      }))
    const deletedIds = new Set(
      (existingData?.allDeletedTransactions?.nodes ?? []).flatMap((node) =>
        node?.bankAccountId === selectedAccountId && node.bankTransactionId ? [node.bankTransactionId] : [],
      ),
    )
    let isCancelled = false
    buildTransactions(preview.rows, activeMapping, String(selectedAccountId)).then((transactions) => {
      if (!isCancelled) {
        setDuplicateCount(countDuplicateRows(transactions, existingRows, deletedIds))
      }
    })
    return () => {
      isCancelled = true
    }
  }, [
    selectedAccountId,
    isMultiAccountFile,
    isMappingUsable,
    existingTransactions,
    existingData,
    preview.rows,
    activeMapping,
  ])

  const [createBankCsvDefinition] = useMutationWithToast(CreateBankCsvDefinitionDocument, {
    refetchQueries: definitionsRefetch,
    reportErrors: false,
  })
  const [updateBankCsvDefinition] = useMutationWithToast(UpdateBankCsvDefinitionDocument, { reportErrors: false })
  const [upsertBankAccount] = useMutationWithToast(UpsertBankAccountDocument, { reportErrors: false })
  const [updateBankAccountName] = useMutationWithToast(UpdateBankAccountNameDocument, {
    reportErrors: false,
    refetchQueries: [
      { query: GetUserAndAccountsAndBankAccountsByEmailDocument, variables: { email: user?.email || '' } },
    ],
  })

  const accountLabel = useBankAccountLabel()

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
      case 'template':
        return t('csvImport.autoMatchedByTemplate', { account })
      case 'overlap':
        return t('csvImport.autoMatchedByOverlap', { account, count: Number(accountMatch.detail) })
    }
  }

  function updateMapping(patch: Partial<CsvColumnMapping>) {
    setEditedMapping({ ...activeMapping, ...patch })
  }

  /**
   * Remembers how this file's format was read, without asking for a template name, so the next
   * file in this format (for any account) reads the same way, and which accounts it went into. A
   * template for an earlier version of the format is replaced rather than joined by a second one.
   */
  async function saveTemplate(accountId: number, importedInto: number[], name: string) {
    const fingerprint = fingerprintFile(csvText, activeMapping)
    const template = matchedTemplate ?? changedFormat?.template
    if (!template) {
      await createBankCsvDefinition({
        variables: { accountId, name, fingerprint, mapping: activeMapping, bankAccountIds: importedInto },
      })
      return
    }
    const bankAccountIds = Array.from(new Set([...template.bankAccountIds, ...importedInto]))
    const isChanged = !!editedMapping || !matchedTemplate || fingerprint !== template.fingerprint
    if (!isChanged && bankAccountIds.length === template.bankAccountIds.length) {
      return
    }
    await updateBankCsvDefinition({
      variables: {
        nodeId: template.nodeId,
        bankAccountIds,
        ...(isChanged ? { fingerprint, mapping: activeMapping } : {}),
      },
    })
  }

  async function handleImport() {
    if (!currentAccountId) {
      return
    }
    setIsProcessing(true)
    try {
      if (isMultiAccountFile && activeAccountColumn) {
        const groups = groupRowsByAccountId(preview.rows, activeAccountColumn)
        const importGroups: { bankAccountId: number; transactions: InputTransaction[] }[] = []
        for (const [accountId, rows] of groups) {
          const identifierMatches =
            bankAccounts?.filter((account) => identifierMatchesAccount(accountId, account)) ?? []
          const existingAccount =
            bankAccounts?.find((account) => account.bankAccountId === accountId) ??
            (identifierMatches.length === 1 ? identifierMatches[0] : undefined)
          let bankAccountId = existingAccount?.id
          if (!bankAccountId) {
            const response = await upsertBankAccount({
              variables: {
                accountId: currentAccountId,
                type: 'CHECKING',
                currency: defaultCurrency,
                bankAccountId: accountId,
              },
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
        await saveTemplate(
          currentAccountId,
          importGroups.map((group) => group.bankAccountId),
          fileName.replace(/\.csv$/i, ''),
        ).catch(console.error)
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
          await updateBankAccountName({
            variables: { id: bankAccountId, accountId: currentAccountId, name: accountName },
          })
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
      await saveTemplate(currentAccountId, [bankAccountId], accountName || fileName.replace(/\.csv$/i, '')).catch(
        console.error,
      )
      onClose()
    } catch (error) {
      console.error(error)
      enqueueSnackbar(t('upload.error'), { variant: 'error' })
    } finally {
      setIsProcessing(false)
    }
  }

  const canImport = !isProcessing && !isDetecting && isMappingUsable && (isMultiAccountFile || effectiveChoice !== '')

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
                  onChange={(e) =>
                    setAccountChoice(e.target.value === NEW_ACCOUNT ? NEW_ACCOUNT : Number(e.target.value))
                  }
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
                          {t(`bankAccounts.types.${type}`)}
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

            {changedFormat && (
              <Alert severity={changedFormatChangesIds ? 'warning' : 'info'}>
                {t('csvImport.formatChanged', {
                  added: changedFormat.added.join(', ') || t('csvImport.noColumns'),
                  removed: changedFormat.removed.join(', ') || t('csvImport.noColumns'),
                })}
                {changedFormatChangesIds && ` ${t('csvImport.formatChangedIds')}`}
              </Alert>
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
              <MappingEditor
                mapping={activeMapping}
                headers={preview.headers}
                columnLabels={columnLabels}
                onChange={updateMapping}
              />
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
  columnLabels,
  onChange,
}: {
  mapping: CsvColumnMapping
  headers: string[]
  /** Shown beside numbered columns (files read without a header row). */
  columnLabels: Record<string, string>
  onChange: (patch: Partial<CsvColumnMapping>) => void
}) {
  const t = useTranslations('common')
  const columnLabel = (header: string) => (columnLabels[header] ? `${header} (${columnLabels[header]})` : header)
  // Multi-selects hand back a list (or, autofilled, a comma-separated string), in the order picked.
  const selectedColumns = (value: unknown) => (typeof value === 'string' ? value.split(',') : (value as string[]))
  const renderColumns = (selected: unknown) => (selected as string[]).map(columnLabel).join(' + ')
  const columnOptions = headers.map((header) => (
    <MenuItem key={header} value={header}>
      {columnLabel(header)}
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
          label={t('csvImport.timeColumn')}
          value={mapping.timeColumn || ''}
          onChange={(e) =>
            onChange({ timeColumn: e.target.value || null, timeFormat: mapping.timeFormat || 'H:mm:ss' })
          }
          sx={{ flex: 1 }}
        >
          <MenuItem value={''}>{t('csvImport.none')}</MenuItem>
          {columnOptions}
        </TextField>
        <TextField
          label={t('csvImport.timeFormat')}
          value={mapping.timeFormat || ''}
          onChange={(e) => onChange({ timeFormat: e.target.value })}
          disabled={!mapping.timeColumn}
          sx={{ flex: 1 }}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField
          select
          label={t('csvImport.nameColumns')}
          value={mapping.nameColumns}
          onChange={(e) => onChange({ nameColumns: selectedColumns(e.target.value) })}
          SelectProps={{ multiple: true, renderValue: renderColumns }}
          helperText={t('csvImport.nameColumnsHelp')}
          sx={{ flex: 1 }}
        >
          {columnOptions}
        </TextField>
        <TextField
          select
          label={t('csvImport.memoColumns')}
          value={mapping.memoColumns}
          onChange={(e) => onChange({ memoColumns: selectedColumns(e.target.value) })}
          SelectProps={{ multiple: true, renderValue: renderColumns }}
          helperText={t('csvImport.memoColumnsHelp')}
          sx={{ flex: 1 }}
        >
          {columnOptions}
        </TextField>
      </Box>

      <TextField
        select
        label={t('csvImport.accountColumn')}
        value={mapping.accountColumn ?? (mapping.hasHeaderRow ? (findAccountIdColumn(headers) ?? '') : '')}
        onChange={(e) => onChange({ accountColumn: e.target.value || null })}
        helperText={t('csvImport.accountColumnHelp')}
        sx={{ width: '50%' }}
      >
        <MenuItem value={''}>{t('csvImport.none')}</MenuItem>
        {columnOptions}
      </TextField>

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
              <TableCell>
                {parsed ? format(parsed.posted, mapping.timeColumn ? 'MMM d, yyyy h:mm a' : 'MMM d, yyyy') : '—'}
              </TableCell>
              <TableCell>{readName(row, mapping)}</TableCell>
              <TableCell>{readMemo(row, mapping)}</TableCell>
              <TableCell align={'right'}>{parsed ? formatMoneyCents(parsed.amount, 'USD', hidden) : '—'}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
