interface InputAccount {
  bankAccountId: string
  type: string
  currency: string
  balance: number
  userId: number
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
  transactions: InputTransaction[]
}
