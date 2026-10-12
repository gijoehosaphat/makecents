import { describe, expect, it } from 'vitest'
import { updateSearchParamsUrl } from './updateSearchParamsUrl'

describe('updateSearchParamsUrl', () => {
  it('keeps special characters in other params intact', () => {
    const current = new URLSearchParams({ search: 'a&b #1 100%', page: '3' })
    const url = updateSearchParamsUrl('/x', current, { categorized: 'false' })
    const parsed = new URLSearchParams(url.split('?')[1])
    expect(parsed.get('search')).toBe('a&b #1 100%')
    expect(parsed.get('categorized')).toBe('false')
    expect(parsed.has('page')).toBe(false)
  })

  it('removes keys set to null or empty', () => {
    const current = new URLSearchParams({ categorized: 'true', search: 'x' })
    expect(updateSearchParamsUrl('/x', current, { categorized: null, search: '' })).toBe('/x')
  })

  it('keeps an explicitly set page', () => {
    expect(updateSearchParamsUrl('/x', new URLSearchParams(), { page: '2' })).toBe('/x?page=2')
  })

  it('handles missing current params', () => {
    expect(updateSearchParamsUrl('/x', null, { a: '1' })).toBe('/x?a=1')
  })
})
