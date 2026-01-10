import { useTheme } from '@mui/material'
import { generateGradient } from 'typescript-color-gradient'

export function useColors() {
  const theme = useTheme()

  function getColors(n: number) {
    return generateGradient(
      [theme?.palette?.primary?.main, theme?.palette?.secondary?.main, theme?.palette?.background?.paper],
      n
    )
  }

  return {
    getColors,
  }
}
