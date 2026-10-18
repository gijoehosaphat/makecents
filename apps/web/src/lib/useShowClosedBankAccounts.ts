import { useLocalStorage } from 'usehooks-ts'

/**
 * Whether closed bank accounts are listed in the navigation. Set from Settings → Bank Accounts and
 * remembered in this browser; every caller in the tab stays in sync.
 */
export function useShowClosedBankAccounts() {
  return useLocalStorage('makecents.showClosedBankAccounts', false, { initializeWithValue: false })
}
