import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getClient } from '@/lib/apollo-client'
import { GetUserAndAccountsAndBankAccountsByEmailDocument } from '@/graphql/operations'
import { Account, BankAccount, User } from '@/graphql/types'

export default async function Page() {
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

  if (data?.user && data?.accounts.length) {
    redirect(`/${data?.accounts[0].id}/dashboard`)
  } else {
    redirect('/account/signIn')
  }
}
