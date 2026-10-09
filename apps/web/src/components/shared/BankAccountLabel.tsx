import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAppContext } from '@/components/context/AppContextProvider'
import { useAmountVisibility } from '@/components/context/AmountVisibilityContext'
import { bankAccountLabel } from '@/lib/bankAccountLabel'

type LabelableAccount = { id?: number; name?: string | null; type?: string | null; bankAccountId?: string | null }

const GENERIC_NAMES: { [type: string]: { key: string; letters: boolean } } = {
  CREDIT_CARD: { key: 'creditCard', letters: true },
  CHECKING: { key: 'checkingAccount', letters: false },
  SAVINGS: { key: 'savingsAccount', letters: false },
}

function letterSuffix(index: number) {
  let suffix = ''
  let n = index
  do {
    suffix = String.fromCharCode(65 + (n % 26)) + suffix
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return suffix
}

/**
 * Returns a function that labels a bank account. When amounts are hidden, real names are replaced with
 * predictable generic ones ("Credit Card A", "Checking Account 1"), numbered by account id within each type.
 */
export function useBankAccountLabel() {
  const { bankAccounts } = useAppContext()
  const { hidden } = useAmountVisibility()
  const t = useTranslations('common')

  const genericNames = useMemo(() => {
    const names = new Map<number, string>()
    const counts: { [type: string]: number } = {}
    const sorted = [...(bankAccounts ?? [])].sort((a, b) => a.id - b.id)
    for (const account of sorted) {
      const type = account.type && GENERIC_NAMES[account.type] ? account.type : 'OTHER'
      const index = counts[type] ?? 0
      counts[type] = index + 1
      const generic = GENERIC_NAMES[type]
      const base = t(`privacy.${generic?.key ?? 'account'}`)
      names.set(account.id, `${base} ${generic?.letters ? letterSuffix(index) : index + 1}`)
    }
    return names
  }, [bankAccounts, t])

  return useCallback(
    (account?: LabelableAccount | null) => {
      if (!account) {
        return ''
      }
      if (hidden && account.id !== undefined) {
        const generic = genericNames.get(account.id)
        if (generic) {
          return generic
        }
      }
      return bankAccountLabel(account, t)
    },
    [hidden, genericNames, t]
  )
}

export function BankAccountLabel({ bankAccountId }: { bankAccountId?: number | null }) {
  const { bankAccounts } = useAppContext()
  const label = useBankAccountLabel()
  return <>{label(bankAccounts.find((account) => account.id === bankAccountId))}</>
}
