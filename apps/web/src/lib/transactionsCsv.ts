import { Transaction } from '@/graphql/types'
import { format } from 'date-fns'
import { fromCents } from './formatMoney'

const HEADERS = ['Date', 'Account', 'Name', 'Memo', 'Category', 'Amount', 'Split', 'Transfer']

// Spreadsheets run text starting with these characters as a formula.
const FORMULA_PREFIX = /^[=+\-@\t\r]/

function textCell(value: string | null | undefined) {
  const text = value ?? ''
  return FORMULA_PREFIX.test(text) ? `'${text}` : text
}

function escapeCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function hasTransfer(transaction: Transaction) {
  return !!transaction.transferByTransactionSourceId || !!transaction.transferByTransactionTargetId
}

/**
 * One CSV line per transaction, with each split on its own line right after its parent. Every line carries
 * its own amount (a split parent's amount is only the remainder its splits don't cover), so the Amount
 * column sums to the true total.
 */
export function buildTransactionsCsv(
  transactions: Transaction[],
  lookups: {
    accountLabel: (bankAccountId?: number | null) => string
    categoryName: (categoryId?: number | null) => string
  },
): string {
  const lines: string[][] = [HEADERS]

  function addRow(transaction: Transaction, isSplit: boolean) {
    lines.push([
      transaction.posted ? format(new Date(transaction.posted), 'yyyy-MM-dd') : '',
      textCell(lookups.accountLabel(transaction.bankAccountId)),
      textCell(transaction.customName || transaction.name),
      textCell(transaction.customMemo || transaction.memo),
      textCell(lookups.categoryName(transaction.categoryId)),
      fromCents(Number(transaction.amount || 0)).toFixed(2),
      isSplit ? 'Yes' : '',
      hasTransfer(transaction) ? 'Yes' : '',
    ])
  }

  for (const transaction of transactions) {
    addRow(transaction, false)
    for (const split of transaction.transactionsBySplitSourceId?.nodes || []) {
      addRow(split as Transaction, true)
    }
  }

  return lines.map((line) => line.map(escapeCell).join(',')).join('\r\n') + '\r\n'
}
