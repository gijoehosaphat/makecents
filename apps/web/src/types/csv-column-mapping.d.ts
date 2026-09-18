type CsvAmountMode = 'single' | 'debitCredit'
type CsvAmountSign = 'asIs' | 'flipped'

interface CsvColumnMapping {
  delimiter: string
  hasHeaderRow: boolean
  skipRows: number
  dateColumn: string
  dateFormat: string
  descriptionColumn: string
  memoColumn?: string
  amountMode: CsvAmountMode
  amountColumn?: string
  debitColumn?: string
  creditColumn?: string
  amountSign: CsvAmountSign
}
