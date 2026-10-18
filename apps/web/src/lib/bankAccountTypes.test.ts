import { describe, expect, it } from 'vitest'
import { accountTypeFromOfx, isAccountType } from './bankAccountTypes'

describe('accountTypeFromOfx', () => {
  it('keeps the types we share with OFX', () => {
    expect(accountTypeFromOfx('CHECKING')).toEqual({ type: 'CHECKING', subtype: null })
    expect(accountTypeFromOfx('savings')).toEqual({ type: 'SAVINGS', subtype: null })
  })

  it('rolls specific OFX types up, keeping the detail as the subtype', () => {
    expect(accountTypeFromOfx('MONEYMRKT')).toEqual({ type: 'SAVINGS', subtype: 'Money market' })
    expect(accountTypeFromOfx('CD')).toEqual({ type: 'SAVINGS', subtype: 'CD' })
    expect(accountTypeFromOfx('CREDITLINE')).toEqual({ type: 'LINE_OF_CREDIT', subtype: null })
  })

  it('files anything unknown under Other without losing it', () => {
    expect(accountTypeFromOfx('SOMETHING')).toEqual({ type: 'OTHER', subtype: 'SOMETHING' })
    expect(accountTypeFromOfx(undefined)).toEqual({ type: 'OTHER', subtype: null })
  })
})

describe('isAccountType', () => {
  it('accepts only known types', () => {
    expect(isAccountType('RETIREMENT')).toBe(true)
    expect(isAccountType('RRSP')).toBe(false)
    expect(isAccountType(null)).toBe(false)
  })
})
