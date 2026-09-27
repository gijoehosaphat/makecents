import { redirect } from 'next/navigation'
import { useUserServerSide } from '@/lib/useUserServerSide'

export default async function Page() {
  const data = await useUserServerSide()

  if (data?.user && data?.accounts.length) {
    redirect(`/${data?.accounts[0].id}/dashboard`)
  } else {
    redirect('/account/signIn')
  }
}
