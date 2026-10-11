import { useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Bank accounts (names, balances, closed state) reach the app through the server-rendered layout,
 * so after changing one Apollo's refetch isn't enough: the layout has to render again. Call this
 * once the mutation has finished.
 */
export function useRefreshAccountData() {
  const router = useRouter()
  return useCallback(() => router.refresh(), [router])
}
