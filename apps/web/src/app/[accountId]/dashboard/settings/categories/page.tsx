import Categories from '@/components/categories/Categories'
import { Loading } from '@/components/shared/Loading'
import { Suspense } from 'react'

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Categories />
    </Suspense>
  )
}
