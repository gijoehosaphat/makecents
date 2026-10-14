import { redirect } from 'next/navigation'
import { getUserServerSide } from '@/lib/getUserServerSide'

export default async function Page() {
  const data = await getUserServerSide()

  if (data?.user && data?.accounts.length) {
    redirect(`/${data?.accounts[0].id}/dashboard`)
  } else {
    redirect('/account/signIn')
  }
}
