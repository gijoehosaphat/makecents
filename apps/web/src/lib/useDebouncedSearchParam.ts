import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { updateSearchParamsUrl } from './updateSearchParamsUrl'

/**
 * State for a text input backed by the `key` search param. Typing updates the input at once and writes
 * the param after `delay`, replacing the history entry rather than adding one per keystroke.
 *
 * Only changes made elsewhere (a removed filter chip, Clear all, back/forward) overwrite what's in the
 * input. This input's own updates can land after the person has typed more, and would otherwise snap the
 * text back to an older value.
 */
export function useDebouncedSearchParam(
  key: string,
  { delay, toParam }: { delay: number; toParam: (value: string) => string | null },
) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const urlValue = searchParams?.get(key) || ''
  const [value, setValue] = useState(urlValue)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Values this input has written that the URL may not have caught up with yet.
  const pendingRef = useRef<string[]>([])

  useEffect(() => {
    const pending = pendingRef.current
    if (pending.includes(urlValue)) {
      if (urlValue === pending[pending.length - 1]) {
        pendingRef.current = []
      }
      return
    }
    pendingRef.current = []
    clearTimeout(timeoutRef.current)
    setValue(urlValue)
  }, [urlValue])

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  function onChange(next: string) {
    setValue(next)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      // Read the URL now rather than at the keystroke, so a filter changed in the meantime is kept.
      const current = new URLSearchParams(window.location.search)
      const param = toParam(next) || ''
      if ((current.get(key) || '') === param) {
        return
      }
      pendingRef.current.push(param)
      const url = updateSearchParamsUrl(pathname, current, { [key]: param })
      startTransition(() => {
        window.history.replaceState(null, '', url)
      })
    }, delay)
  }

  return [value, onChange] as const
}
