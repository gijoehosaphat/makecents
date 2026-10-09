import { auth } from '@/auth'
import { getClient } from '@/lib/apollo-client'
import { Account, BankAccount, User } from '@/graphql/types'
import { GetUserAndAccountsAndBankAccountsByEmailDocument } from '@/graphql/operations'

export async function useUserServerSide(currentAccountId?: number): Promise<{
  user: User | null
  accounts: Account[]
  bankAccounts: BankAccount[]
}> {
  const session = await auth()

  let data: {
    user: User | null
    accounts: Account[]
    bankAccounts: BankAccount[]
  } = {
    user: null,
    accounts: [],
    bankAccounts: [],
  }

  // No (or an expired) session means the API would run as the anonymous role, which cannot read
  // users. Return empty data so callers redirect to sign in.
  if (!session?.user?.email) {
    return data
  }

  const query = await getClient().query({
    query: GetUserAndAccountsAndBankAccountsByEmailDocument,
    variables: {
      email: session.user.email,
    },
  })

  if (query?.data?.userByEmail) {
    const { accountMembersByUserId, ...rest } = query?.data?.userByEmail
    const accountsWithBankAccounts = accountMembersByUserId.nodes.flatMap((member) =>
      member.accountByAccountId ? [member.accountByAccountId] : []
    )
    const currentAccount = accountsWithBankAccounts.find((account) => account.id === currentAccountId)
    data = {
      user: rest as User,
      accounts: accountsWithBankAccounts.map(({ bankAccountsByAccountId, ...account }) => account as Account),
      bankAccounts: (currentAccount?.bankAccountsByAccountId?.nodes as BankAccount[]) || [],
    }
  }

  return {
    ...data,
  }
}
