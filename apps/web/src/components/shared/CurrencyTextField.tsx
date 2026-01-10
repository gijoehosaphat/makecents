import { InputAdornment, TextField, TextFieldProps } from '@mui/material'
import AutoNumeric from 'autonumeric'
import React, { useEffect, useRef, useState } from 'react'

type CurrencyTextFieldProps = TextFieldProps & {
  onValueChange?: (value: number) => void
  options?: AutoNumeric.Options
}

export default function CurrencyTextField(props: CurrencyTextFieldProps) {
  const [focus, setFocus] = useState(false)
  const [autonumeric, setAutonumeric] = useState<AutoNumeric | null>(null)
  const {
    InputProps,
    value,
    onValueChange,
    onChange,
    onFocus,
    onBlur,
    onKeyUp,
    onKeyDown,
    options,
    ...remainingProps
  } = props
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (inputRef.current && autonumeric === null) {
      if (!AutoNumeric.isManagedByAutoNumeric(inputRef.current)) {
        setAutonumeric(
          new AutoNumeric(inputRef.current, 0, {
            currencySymbol: '',
            ...options,
            ...remainingProps,
          })
        )
      }
    }
  }, [inputRef, autonumeric, options, remainingProps])

  useEffect(() => {
    return () => {
      autonumeric?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (value && typeof value === 'number' && autonumeric !== null && focus === false) {
      let newValue = value
      if (options?.maximumValue) {
        newValue = Math.min(value, Number(options?.maximumValue))
      }
      autonumeric?.set(newValue)
      if (options) {
        autonumeric?.update(options)
      }
    }
  }, [value, autonumeric, options, focus])

  function getValue() {
    return autonumeric?.getNumber() || 0
  }

  return (
    <TextField
      inputRef={inputRef}
      InputProps={{
        startAdornment: <InputAdornment position={'start'}>$</InputAdornment>,
        ...InputProps,
      }}
      {...remainingProps}
      onChange={(e) => {
        onValueChange && onValueChange(getValue())
      }}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    />
  )
}
