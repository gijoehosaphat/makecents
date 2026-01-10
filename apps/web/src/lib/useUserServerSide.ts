import { auth } from '@/auth'
import { getClient } from '@/lib/apollo-client'
import { Account, BankAccount, User } from '@/graphql/types'
import { GetUserAndAccountsAndBankAccountsByEmailDocument } from '@/graphql/operations'

export async function useUserServerSide(): Promise<{
  user: User | null
  accounts: Account[]
  bankAccounts: BankAccount[]
}> {
  const session = await auth()

  const query = await getClient().query({
    query: GetUserAndAccountsAndBankAccountsByEmailDocument,
    variables: {
      email: session?.user?.email || '',
    },
  })

  let data: {
    user: User | null
    accounts: Account[]
    bankAccounts: BankAccount[]
  } = {
    user: null,
    accounts: [],
    bankAccounts: [],
  }
  if (query?.data?.userByEmail) {
    const { accountsByUserId, bankAccountsByUserId, ...rest } = query?.data?.userByEmail
    data = {
      user: rest as User,
      accounts: (accountsByUserId?.nodes as Account[]) || [],
      bankAccounts: (bankAccountsByUserId?.nodes as BankAccount[]) || [],
    }
  }

  return {
    ...data,
  }
}
