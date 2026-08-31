import { describe, it, expect, vi } from 'vitest'
import { pageAll, PAGE_SIZE, MAX_PAGES } from './paging'

// Regression cover for the silent-truncation bug: PostgREST caps how many rows
// one request returns, and a plain .select() past that cap returns the first N
// with no error. getAllNotes/getJournalEntries/getPassages/getNotesByBook now
// page instead. See src/api/paging.ts for why this matters more than it looks.

/** A fake server holding `total` rows that never returns more than `cap` at a time. */
function fakeServer(total: number, cap = PAGE_SIZE) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  const calls: Array<[number, number]> = []
  const run = (from: number, to: number) => {
    calls.push([from, to])
    const requested = to - from + 1
    const slice = rows.slice(from, from + Math.min(requested, cap))
    return Promise.resolve({ data: slice, error: null })
  }
  return { run, calls, rows }
}

describe('pageAll', () => {
  it('returns every row when the set is larger than one page', async () => {
    const { run, calls } = fakeServer(1250)
    const out = await pageAll(run)

    expect(out).toHaveLength(1250)
    expect(out[0]).toEqual({ id: 0 })
    expect(out[1249]).toEqual({ id: 1249 })
    // 500 + 500 + 250: the short third page ends it.
    expect(calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499]
    ])
  })

  it('would have truncated without paging — the bug this fixes', async () => {
    // One unpaged request against the same data is what the old code did.
    const { run } = fakeServer(1250)
    const { data } = await run(0, Number.MAX_SAFE_INTEGER)
    expect(data).toHaveLength(PAGE_SIZE)
    expect(data.length).toBeLessThan(1250)
  })

  it('stops after a single request when the set is smaller than a page', async () => {
    const { run, calls } = fakeServer(12)
    const out = await pageAll(run)
    expect(out).toHaveLength(12)
    expect(calls).toHaveLength(1)
  })

  it('terminates on an exactly-full final page instead of looping', async () => {
    // 1000 rows = two full pages, then an empty third that ends it.
    const { run, calls } = fakeServer(1000)
    const out = await pageAll(run)
    expect(out).toHaveLength(1000)
    expect(calls).toHaveLength(3)
    expect(calls[2]).toEqual([1000, 1499])
  })

  it('handles an empty set', async () => {
    const { run, calls } = fakeServer(0)
    expect(await pageAll(run)).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('cannot spin forever if the server always returns a full page', async () => {
    // A server that ignores `from` and always hands back a full page would
    // otherwise loop until the process died.
    const run = vi.fn(() =>
      Promise.resolve({ data: Array.from({ length: PAGE_SIZE }, () => ({ id: 0 })), error: null })
    )
    const out = await pageAll(run, { maxPages: 4 })
    expect(run).toHaveBeenCalledTimes(4)
    expect(out).toHaveLength(4 * PAGE_SIZE)
  })

  it('throws on a query error rather than returning a partial set', async () => {
    const run = vi.fn((from: number) =>
      from === 0
        ? Promise.resolve({
            data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })),
            error: null
          })
        : Promise.resolve({ data: null, error: { message: 'boom' } })
    )
    await expect(pageAll(run)).rejects.toThrow('boom')
  })

  it('throws when the driver returns neither data nor an error', async () => {
    const run = () => Promise.resolve({ data: null, error: null })
    await expect(pageAll(run)).rejects.toThrow('No data returned')
  })

  it('honours a custom page size', async () => {
    const { run, calls } = fakeServer(25, 10)
    const out = await pageAll(run, { pageSize: 10 })
    expect(out).toHaveLength(25)
    expect(calls).toEqual([
      [0, 9],
      [10, 19],
      [20, 29]
    ])
  })

  it('keeps the backstop well above any realistic personal note count', () => {
    expect(MAX_PAGES * PAGE_SIZE).toBeGreaterThanOrEqual(100_000)
  })
})
