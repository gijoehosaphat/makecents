import { describe, expect, it } from 'vitest'
import { refetchWhenIdle, trackSave } from './refetchWhenIdle'

const list = { query: {} as never, variables: {} }

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

describe('refetchWhenIdle', () => {
  it('refetches after a lone save', async () => {
    const refetch = refetchWhenIdle(list)
    let result: unknown[] = []
    await trackSave(async () => {
      result = refetch()
    })
    expect(result).toEqual([list])
  })

  it('only the last of several overlapping saves refetches', async () => {
    const refetch = refetchWhenIdle(list)
    const first = deferred()
    const second = deferred()
    const decisions: unknown[][] = []

    const a = trackSave(async () => {
      await first.promise
      decisions.push(refetch())
    })
    const b = trackSave(async () => {
      await second.promise
      decisions.push(refetch())
    })
    first.resolve()
    await a
    second.resolve()
    await b

    expect(decisions).toEqual([[], [list]])
  })

  it('does not count a failed save forever', async () => {
    const refetch = refetchWhenIdle(list)
    await trackSave(async () => {
      throw new Error('nope')
    }).catch(() => {})
    let result: unknown[] = []
    await trackSave(async () => {
      result = refetch()
    })
    expect(result).toEqual([list])
  })

  it('has nothing to refetch without a list', async () => {
    let result: unknown[] = [1]
    await trackSave(async () => {
      result = refetchWhenIdle(undefined)()
    })
    expect(result).toEqual([])
  })
})
