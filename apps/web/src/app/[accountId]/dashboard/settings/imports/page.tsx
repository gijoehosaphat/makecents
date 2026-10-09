import Imports from '@/components/imports/Imports'
import { Loading } from '@/components/shared/Loading'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Imports />
    </Suspense>
  )
}
