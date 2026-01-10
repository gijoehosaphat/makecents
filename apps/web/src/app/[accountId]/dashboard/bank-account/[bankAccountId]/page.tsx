import { Transactions } from '@/components/transactions/Transactions'
import { Loading } from '@/components/shared/Loading'
import { Suspense } from 'react'
import TitleSetter from '@/components/TitleSetter'

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <TitleSetter>Accounts</TitleSetter>
      <Transactions />
    </Suspense>
  )
}
