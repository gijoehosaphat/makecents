import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery } from '@apollo/client/react'
import { useAppContext } from '@/components/context/AppContextProvider'
import { useUploadHandler } from '@/lib/useUploadHandler'
import { formatMoneyCents } from '@/lib/formatMoney'
import { useAmountVisibility } from '@/components/context/AmountVisibilityContext'
import {
  GetBankCsvDefinitionsDocument,
  CreateBankCsvDefinitionDocument,
  UpsertBankAccountDocument,
} from '@/graphql/operations'
import { BankCsvDefinition } from '@/graphql/types'
import {
  buildTransactions,
  computeAmount,
  findAccountIdColumn,
  getMappedColumns,
  groupRowsByAccountId,
  parsePreview,
} from '@/lib/parsers/Csv'

const DEFAULT_MAPPING: CsvColumnMapping = {
  delimiter: ',',
  hasHeaderRow: true,
  skipRows: 0,
  dateColumn: '',
  dateFormat: 'MM/dd/yyyy',
  descriptionColumn: '',
  memoColumn: '',
  amountMode: 'single',
  amountColumn: '',
  debitColumn: '',
  creditColumn: '',
  amountSign: 'asIs',
}

type Step = 'account' | 'definition' | 'confirm'

function matchesHeaders(mapping: CsvColumnMapping, headers: string[]): boolean {
  const referenced = getMappedColumns(mapping)
  return referenced.length > 0 && referenced.every((column) => headers.includes(column))
}

/** Finds the definition previously saved for this specific bank account, if its mapping still fits the file. */
function findDefinitionForAccount(
  definitions: BankCsvDefinition[],
  bankAccountId: number,
  headers: string[]
): BankCsvDefinition | undefined {
  return definitions.find(
    (definition) => definition.bankAccountId === bankAccountId && matchesHeaders(definition.mapping as CsvColumnMapping, headers)
  )
}

export function CsvImportDialog({ fileName, csvText, onClose }: { fileName: string; csvText: string; onClose: () => void }) {
  const t = useTranslations('common')
  const { user, bankAccounts } = useAppContext()
  const { importCsvTransactions, uploadHandler } = useUploadHandler()

  const [step, setStep] = useState<Step>('account')
  const [isProcessing, setIsProcessing] = useState(false)

  const [existingAccountId, setExistingAccountId] = useState<number | ''>(bankAccounts?.[0]?.id ?? '')
  const [useNewAccount, setUseNewAccount] = useState(!bankAccounts?.length)
  const [newAccountName, setNewAccountName] = useState(fileName.replace(/\.csv$/i, ''))
  const [newAccountType, setNewAccountType] = useState('CHECKING')
  const [newAccountCurrency, setNewAccountCurrency] = useState('USD')

  const { data: definitionsData } = useQuery(GetBankCsvDefinitionsDocument, {
    variables: { userId: user?.id },
    skip: !user?.id,
  })
  const definitions: BankCsvDefinition[] = useMemo(
    () => (definitionsData?.allBankCsvDefinitions?.nodes as BankCsvDefinition[]) ?? [],
    [definitionsData]
  )

  const [mapping, setMapping] = useState<CsvColumnMapping>(DEFAULT_MAPPING)
  const rawPreview = useMemo(
    () => parsePreview(csvText, mapping),
    [csvText, mapping.delimiter, mapping.hasHeaderRow, mapping.skipRows]
  )
  const headerPreview = rawPreview.headers
  const suggestedDefinition = useMemo(
    () => definitions.find((definition) => matchesHeaders(definition.mapping as CsvColumnMapping, headerPreview)),
    [definitions, headerPreview]
  )

  // A column that looks like it holds the bank's own account identifier (e.g. "account_id"),
  // and the distinct values it takes across the file's rows.
  const accountIdColumn = useMemo(() => findAccountIdColumn(headerPreview), [headerPreview])
  const distinctAccountIds = useMemo(() => {
    if (!accountIdColumn) {
      return []
    }
    const seen = new Set<string>()
    for (const row of rawPreview.rows) {
      const value = row[accountIdColumn]?.trim()
      if (value) {
        seen.add(value)
      }
    }
    return Array.from(seen)
  }, [accountIdColumn, rawPreview.rows])

  // A single account referenced directly by the file itself rather than inferred from a
  // previously saved definition. When the file names an account we already have, there's no
  // need to make the user pick it again.
  const matchedAccountFromCsv = useMemo(() => {
    if (distinctAccountIds.length !== 1) {
      return undefined
    }
    return bankAccounts?.find((account) => account.bankAccountId === distinctAccountIds[0])
  }, [distinctAccountIds, bankAccounts])

  // When the CSV itself told us which account this is, prefer the template that was saved
  // specifically for that account over any other template that merely shares its headers.
  const matchedAccountDefinition = useMemo(
    () =>
      matchedAccountFromCsv ? findDefinitionForAccount(definitions, matchedAccountFromCsv.id, headerPreview) : undefined,
    [definitions, matchedAccountFromCsv, headerPreview]
  )

  // When the file references more than one account, there's no single account to select at
  // all — each group of rows gets matched (or created) by its own account id on import.
  const isMultiAccountFile = distinctAccountIds.length > 1
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<number | ''>('')
  const [useNewDefinition, setUseNewDefinition] = useState(!suggestedDefinition)
  const [definitionName, setDefinitionName] = useState('')

  // A definition that matches this file's headers AND was previously saved against a bank
  // account we still have — i.e. we recognize both the format and the account. When that
  // happens we skip the account/definition steps entirely instead of prompting.
  const knownAccountDefinition = useMemo(
    () =>
      definitions.find(
        (definition) =>
          matchesHeaders(definition.mapping as CsvColumnMapping, headerPreview) &&
          definition.bankAccountId != null &&
          bankAccounts?.some((account) => account.id === definition.bankAccountId)
      ),
    [definitions, headerPreview, bankAccounts]
  )
  const [hasAutoJumped, setHasAutoJumped] = useState(false)

  useEffect(() => {
    if (hasAutoJumped) {
      return
    }
    if (isMultiAccountFile) {
      if (suggestedDefinition) {
        setSelectedDefinitionId(suggestedDefinition.id)
        setUseNewDefinition(false)
        setStep('confirm')
      } else {
        setStep('definition')
      }
      setHasAutoJumped(true)
      return
    }
    if (matchedAccountFromCsv) {
      setExistingAccountId(matchedAccountFromCsv.id)
      setUseNewAccount(false)
      // Prefer the template saved for this exact account; fall back to any template that
      // merely matches the headers if this account hasn't been imported with one before.
      const definition = matchedAccountDefinition ?? suggestedDefinition
      if (definition) {
        setSelectedDefinitionId(definition.id)
        setUseNewDefinition(false)
        setStep('confirm')
      } else {
        setStep('definition')
      }
      setHasAutoJumped(true)
      return
    }
    if (knownAccountDefinition) {
      setExistingAccountId(knownAccountDefinition.bankAccountId as number)
      setUseNewAccount(false)
      setSelectedDefinitionId(knownAccountDefinition.id)
      setUseNewDefinition(false)
      setStep('confirm')
      setHasAutoJumped(true)
    }
  }, [
    hasAutoJumped,
    isMultiAccountFile,
    knownAccountDefinition,
    matchedAccountFromCsv,
    matchedAccountDefinition,
    suggestedDefinition,
  ])

  // Whether the account/definition currently selected still match what we auto-detected,
  // used only to decide whether the "we recognized this" banner is still accurate.
  const isFullyAutoDetected =
    hasAutoJumped &&
    !useNewAccount &&
    !useNewDefinition &&
    !!selectedDefinitionId &&
    ((!!knownAccountDefinition &&
      existingAccountId === knownAccountDefinition.bankAccountId &&
      selectedDefinitionId === knownAccountDefinition.id) ||
      (!!matchedAccountFromCsv &&
        existingAccountId === matchedAccountFromCsv.id &&
        selectedDefinitionId === (matchedAccountDefinition ?? suggestedDefinition)?.id))

  const isCsvAccountMatch =
    hasAutoJumped &&
    !isFullyAutoDetected &&
    !!matchedAccountFromCsv &&
    !useNewAccount &&
    existingAccountId === matchedAccountFromCsv.id

  const isMultiAccountDetected = hasAutoJumped && isMultiAccountFile

  const activeMapping: CsvColumnMapping = useMemo(() => {
    if (!useNewDefinition) {
      const selected = definitions.find((definition) => definition.id === selectedDefinitionId) ?? suggestedDefinition
      if (selected) {
        return selected.mapping as CsvColumnMapping
      }
    }
    return mapping
  }, [useNewDefinition, definitions, selectedDefinitionId, suggestedDefinition, mapping])

  const preview = useMemo(() => parsePreview(csvText, activeMapping), [csvText, activeMapping])
  const previewRows = preview.rows.slice(0, 5)

  const [createBankCsvDefinition] = useMutation(CreateBankCsvDefinitionDocument)
  const [upsertBankAccount] = useMutation(UpsertBankAccountDocument)

  function updateMapping(patch: Partial<CsvColumnMapping>) {
    setMapping((current) => ({ ...current, ...patch }))
  }

  function handleAccountNext() {
    setStep('definition')
    if (suggestedDefinition) {
      setSelectedDefinitionId(suggestedDefinition.id)
      setUseNewDefinition(false)
    }
  }

  async function handleImport() {
    if (!user?.id) {
      return
    }
    setIsProcessing(true)
    try {
      if (isMultiAccountFile && accountIdColumn) {
        const groups = groupRowsByAccountId(preview.rows, accountIdColumn)
        const accountGroups: AccountGroup[] = []
        for (const [accountId, rows] of groups) {
          const existingAccount = bankAccounts?.find((account) => account.bankAccountId === accountId)
          const transactions = await buildTransactions(rows, activeMapping, accountId)
          accountGroups.push({
            account: {
              bankAccountId: accountId,
              type: existingAccount?.type ?? 'CHECKING',
              currency: existingAccount?.currency ?? 'USD',
              userId: user.id,
            },
            transactions,
          })
        }

        if (useNewDefinition) {
          await createBankCsvDefinition({
            variables: { userId: user.id, name: definitionName || fileName, mapping: activeMapping },
          })
        }

        await uploadHandler(accountGroups)
        onClose()
        return
      }

      let bankAccountId: number | undefined
      if (useNewAccount) {
        const response = await upsertBankAccount({
          variables: {
            userId: user.id,
            type: newAccountType,
            currency: newAccountCurrency,
            bankAccountId: crypto.randomUUID(),
          },
        })
        bankAccountId = response.data?.upsertBankAccount?.bankAccount?.id
      } else {
        bankAccountId = existingAccountId || undefined
      }

      if (!bankAccountId) {
        return
      }

      if (useNewDefinition && user?.id) {
        await createBankCsvDefinition({
          variables: {
            userId: user.id,
            name: definitionName || fileName,
            mapping: activeMapping,
            bankAccountId,
          },
        })
      }

      const transactions = await buildTransactions(preview.rows, activeMapping, String(bankAccountId))
      await importCsvTransactions(bankAccountId, transactions)
      onClose()
    } finally {
      setIsProcessing(false)
    }
  }

  const steps: Step[] = isMultiAccountFile ? ['definition', 'confirm'] : ['account', 'definition', 'confirm']
  const stepLabels: Record<Step, string> = {
    account: t('csvImport.stepAccount'),
    definition: t('csvImport.stepDefinition'),
    confirm: t('csvImport.stepConfirm'),
  }

  return (
    <Dialog open maxWidth={'md'} fullWidth onClose={onClose}>
      <DialogTitle>{t('csvImport.title')}</DialogTitle>
      <DialogContent>
        <Stepper activeStep={steps.indexOf(step)} sx={{ mb: 4 }}>
          {steps.map((s) => (
            <Step key={s}>
              <StepLabel>{stepLabels[s]}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {step === 'account' && (
          <Box>
            <RadioGroup
              value={useNewAccount ? 'new' : 'existing'}
              onChange={(e) => setUseNewAccount(e.target.value === 'new')}
            >
              <FormControlLabel
                value={'existing'}
                control={<Radio />}
                label={t('csvImport.useExistingAccount')}
                disabled={!bankAccounts?.length}
              />
              <FormControlLabel value={'new'} control={<Radio />} label={t('csvImport.createNewAccount')} />
            </RadioGroup>

            {!useNewAccount && (
              <TextField
                select
                fullWidth
                label={t('csvImport.account')}
                value={existingAccountId}
                onChange={(e) => setExistingAccountId(Number(e.target.value))}
                sx={{ mt: 2 }}
              >
                {bankAccounts?.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name || account.bankAccountId}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {useNewAccount && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                <TextField
                  label={t('csvImport.accountName')}
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  fullWidth
                />
                <TextField
                  label={t('csvImport.accountType')}
                  value={newAccountType}
                  onChange={(e) => setNewAccountType(e.target.value)}
                  fullWidth
                />
                <TextField
                  label={t('csvImport.currency')}
                  value={newAccountCurrency}
                  onChange={(e) => setNewAccountCurrency(e.target.value)}
                  fullWidth
                />
              </Box>
            )}
          </Box>
        )}

        {step === 'definition' && (
          <Box>
            {isCsvAccountMatch && (
              <Typography sx={{ mb: 2 }} color={'text.secondary'}>
                {t('csvImport.autoDetectedAccount', {
                  account:
                    bankAccounts?.find((account) => account.id === existingAccountId)?.name ??
                    bankAccounts?.find((account) => account.id === existingAccountId)?.bankAccountId ??
                    '',
                })}
              </Typography>
            )}
            {isMultiAccountDetected && (
              <Typography sx={{ mb: 2 }} color={'text.secondary'}>
                {t('csvImport.autoDetectedMultiAccount', { count: distinctAccountIds.length })}
              </Typography>
            )}
            <RadioGroup
              value={useNewDefinition ? 'new' : 'existing'}
              onChange={(e) => setUseNewDefinition(e.target.value === 'new')}
            >
              <FormControlLabel
                value={'existing'}
                control={<Radio />}
                label={t('csvImport.useExistingDefinition')}
                disabled={!definitions.length}
              />
              <FormControlLabel value={'new'} control={<Radio />} label={t('csvImport.createNewDefinition')} />
            </RadioGroup>

            {!useNewDefinition && (
              <TextField
                select
                fullWidth
                label={t('csvImport.definition')}
                value={selectedDefinitionId}
                onChange={(e) => setSelectedDefinitionId(Number(e.target.value))}
                sx={{ mt: 2 }}
              >
                {definitions.map((definition) => (
                  <MenuItem key={definition.id} value={definition.id}>
                    {definition.name}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {useNewDefinition && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                <TextField
                  label={t('csvImport.definitionName')}
                  value={definitionName}
                  onChange={(e) => setDefinitionName(e.target.value)}
                  fullWidth
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label={t('csvImport.delimiter')}
                    value={mapping.delimiter}
                    onChange={(e) => updateMapping({ delimiter: e.target.value })}
                    sx={{ width: 120 }}
                  />
                  <TextField
                    label={t('csvImport.skipRows')}
                    type={'number'}
                    value={mapping.skipRows}
                    onChange={(e) => updateMapping({ skipRows: Number(e.target.value) || 0 })}
                    sx={{ width: 200 }}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={mapping.hasHeaderRow}
                        onChange={(e) => updateMapping({ hasHeaderRow: e.target.checked })}
                      />
                    }
                    label={t('csvImport.hasHeaderRow')}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    select
                    label={t('csvImport.dateColumn')}
                    value={mapping.dateColumn}
                    onChange={(e) => updateMapping({ dateColumn: e.target.value })}
                    sx={{ flex: 1 }}
                  >
                    {headerPreview.map((header) => (
                      <MenuItem key={header} value={header}>
                        {header}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label={t('csvImport.dateFormat')}
                    value={mapping.dateFormat}
                    onChange={(e) => updateMapping({ dateFormat: e.target.value })}
                    sx={{ flex: 1 }}
                  />
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    select
                    label={t('csvImport.descriptionColumn')}
                    value={mapping.descriptionColumn}
                    onChange={(e) => updateMapping({ descriptionColumn: e.target.value })}
                    sx={{ flex: 1 }}
                  >
                    {headerPreview.map((header) => (
                      <MenuItem key={header} value={header}>
                        {header}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label={t('csvImport.memoColumn')}
                    value={mapping.memoColumn || ''}
                    onChange={(e) => updateMapping({ memoColumn: e.target.value || undefined })}
                    sx={{ flex: 1 }}
                  >
                    <MenuItem value={''}>{t('csvImport.none')}</MenuItem>
                    {headerPreview.map((header) => (
                      <MenuItem key={header} value={header}>
                        {header}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <RadioGroup
                  row
                  value={mapping.amountMode}
                  onChange={(e) => updateMapping({ amountMode: e.target.value as CsvAmountMode })}
                >
                  <FormControlLabel value={'single'} control={<Radio />} label={t('csvImport.amountModeSingle')} />
                  <FormControlLabel
                    value={'debitCredit'}
                    control={<Radio />}
                    label={t('csvImport.amountModeDebitCredit')}
                  />
                </RadioGroup>

                {mapping.amountMode === 'single' ? (
                  <TextField
                    select
                    label={t('csvImport.amountColumn')}
                    value={mapping.amountColumn || ''}
                    onChange={(e) => updateMapping({ amountColumn: e.target.value })}
                    fullWidth
                  >
                    {headerPreview.map((header) => (
                      <MenuItem key={header} value={header}>
                        {header}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      select
                      label={t('csvImport.debitColumn')}
                      value={mapping.debitColumn || ''}
                      onChange={(e) => updateMapping({ debitColumn: e.target.value })}
                      sx={{ flex: 1 }}
                    >
                      {headerPreview.map((header) => (
                        <MenuItem key={header} value={header}>
                          {header}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label={t('csvImport.creditColumn')}
                      value={mapping.creditColumn || ''}
                      onChange={(e) => updateMapping({ creditColumn: e.target.value })}
                      sx={{ flex: 1 }}
                    >
                      {headerPreview.map((header) => (
                        <MenuItem key={header} value={header}>
                          {header}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                )}

                <RadioGroup
                  row
                  value={mapping.amountSign}
                  onChange={(e) => updateMapping({ amountSign: e.target.value as CsvAmountSign })}
                >
                  <FormControlLabel value={'asIs'} control={<Radio />} label={t('csvImport.amountSignAsIs')} />
                  <FormControlLabel value={'flipped'} control={<Radio />} label={t('csvImport.amountSignFlipped')} />
                </RadioGroup>
              </Box>
            )}

            <Typography variant={'h4'} sx={{ mt: 3, mb: 1 }}>
              {t('csvImport.preview')}
            </Typography>
            <PreviewTable rows={previewRows} mapping={activeMapping} />
          </Box>
        )}

        {step === 'confirm' && (
          <Box>
            {(isFullyAutoDetected || isCsvAccountMatch) && (
              <Typography sx={{ mb: 2 }} color={'text.secondary'}>
                {t(isFullyAutoDetected ? 'csvImport.autoDetected' : 'csvImport.autoDetectedAccount', {
                  account:
                    bankAccounts?.find((account) => account.id === existingAccountId)?.name ??
                    bankAccounts?.find((account) => account.id === existingAccountId)?.bankAccountId ??
                    '',
                })}
              </Typography>
            )}
            {isMultiAccountDetected && (
              <Typography sx={{ mb: 2 }} color={'text.secondary'}>
                {t('csvImport.autoDetectedMultiAccount', { count: distinctAccountIds.length })}
              </Typography>
            )}
            <Typography sx={{ mb: 2 }}>
              {t('csvImport.confirmSummary', { count: preview.rows.length })}
            </Typography>
            <PreviewTable rows={previewRows} mapping={activeMapping} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('shared.cancel')}</Button>
        {step !== 'account' && (
          <Button onClick={() => setStep(steps[steps.indexOf(step) - 1])}>{t('csvImport.back')}</Button>
        )}
        {step === 'account' && (
          <Button variant={'contained'} onClick={handleAccountNext} disabled={!useNewAccount && !existingAccountId}>
            {t('csvImport.next')}
          </Button>
        )}
        {step === 'definition' && (
          <Button variant={'contained'} onClick={() => setStep('confirm')}>
            {t('csvImport.next')}
          </Button>
        )}
        {step === 'confirm' && (
          <Button variant={'contained'} onClick={handleImport} disabled={isProcessing}>
            {t('csvImport.import')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

function PreviewTable({ rows, mapping }: { rows: Record<string, string>[]; mapping: CsvColumnMapping }) {
  const { hidden } = useAmountVisibility()
  return (
    <Table size={'small'}>
      <TableHead>
        <TableRow>
          <TableCell>Date</TableCell>
          <TableCell>Name</TableCell>
          <TableCell>Memo</TableCell>
          <TableCell align={'right'}>Amount</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={index}>
            <TableCell>{row[mapping.dateColumn]}</TableCell>
            <TableCell>{row[mapping.descriptionColumn]}</TableCell>
            <TableCell>{mapping.memoColumn ? row[mapping.memoColumn] : ''}</TableCell>
            <TableCell align={'right'}>{formatMoneyCents(computeAmount(row, mapping), 'USD', hidden)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
