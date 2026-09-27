import { notFound, redirect } from 'next/navigation'
import { ClientProviders } from '@/components/ClientProviders'
import { useUserServerSide } from '@/lib/useUserServerSide'

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const data = await useUserServerSide(Number(accountId))

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
