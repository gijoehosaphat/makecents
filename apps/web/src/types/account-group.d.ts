interface InputAccount {
  bankAccountId: string
  type: string
  currency: string
  userId: number
}

interface InputReconciliation {
  balance: number
  asOf: Date
}

type InputTransaction = {
  posted: Date
  amount: number
  bankTransactionId: string
  name: string
  memo: string
  type: string
  bankAccountId?: number
}

interface AccountGroup {
  account: InputAccount
  reconciliation?: InputReconciliation
  transactions: InputTransaction[]
}
