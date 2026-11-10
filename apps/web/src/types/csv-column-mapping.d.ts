type CsvAmountMode = 'single' | 'debitCredit'
type CsvAmountSign = 'asIs' | 'flipped'

interface CsvColumnMapping {
  delimiter: string
  hasHeaderRow: boolean
  skipRows: number
  dateColumn: string
  dateFormat: string
  /** A separate column holding the time of day, for files whose date column has none. Null means "none" was chosen. */
  timeColumn?: string | null
  timeFormat?: string
  /**
   * Columns whose values are joined (blanks skipped) into the transaction's name, e.g. payee and
   * transaction_type, so a row without a payee is still named by its type. The name is part of a
   * CSV row's import id, so changing these changes ids.
   */
  nameColumns: string[]
  /** Columns whose values are joined (blanks skipped) into the memo, e.g. notes and payee_email. */
  memoColumns: string[]
  /**
   * The column holding the bank's own account identifier, which picks the account (or splits a
   * file covering several). Unset finds one by header name; null means "none" was chosen.
   */
  accountColumn?: string | null
  amountMode: CsvAmountMode
  amountColumn?: string
  debitColumn?: string
  creditColumn?: string
  amountSign: CsvAmountSign
}
