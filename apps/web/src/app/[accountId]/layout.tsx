import { notFound, redirect } from 'next/navigation'
import { ClientProviders } from '@/components/ClientProviders'
import { getUserServerSide } from '@/lib/getUserServerSide'

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const data = await getUserServerSide(Number(accountId))

  if (!data.user) {
    redirect('/account/signIn')
  }
  if (!data.accounts.some((account) => account.id === Number(accountId))) {
    notFound()
  }

  return (
    <ClientProviders user={data?.user} accounts={data?.accounts} bankAccounts={data?.bankAccounts}>
      {children}
    </ClientProviders>
  )
}
