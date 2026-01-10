import Groups from '@/components/groups/Groups'
import { Loading } from '@/components/shared/Loading'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Groups />
    </Suspense>
  )
}
