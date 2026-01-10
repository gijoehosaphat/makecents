import { ClientProviders } from '@/components/ClientProviders'
import { GetUserAndAccountsAndBankAccountsByEmailDocument } from '@/graphql/operations'
import { Account, BankAccount, User } from '@/graphql/types'
import { getClient } from '@/lib/apollo-client'
import { auth } from '@/auth'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  // const { user, accounts } = useUserServerSide()

  const client = getClient()
  const query = await client.query({
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

  return (
    <ClientProviders user={data?.user} accounts={data?.accounts} bankAccounts={data?.bankAccounts}>
      {children}
    </ClientProviders>
  )
}
