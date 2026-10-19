import {
  AccountBalance,
  BeachAccess,
  CreditCard,
  Handshake,
  House,
  Payments,
  RequestQuote,
  Savings,
  ShowChart,
  Wallet,
} from '@mui/icons-material'
import type { SvgIconProps } from '@mui/material'

export function BankAccountTypeIcon({ accountType, ...props }: { accountType?: string | null } & SvgIconProps) {
  switch (accountType) {
    case 'CHECKING':
      return <Wallet {...props} />
    case 'SAVINGS':
      return <Savings {...props} />
    case 'CASH':
      return <Payments {...props} />
    case 'INVESTMENT':
      return <ShowChart {...props} />
    case 'RETIREMENT':
      return <BeachAccess {...props} />
    case 'CREDIT_CARD':
      return <CreditCard {...props} />
    case 'LINE_OF_CREDIT':
      return <RequestQuote {...props} />
    case 'LOAN':
      return <Handshake {...props} />
    case 'MORTGAGE':
      return <House {...props} />
    default:
      return <AccountBalance {...props} />
  }
}
