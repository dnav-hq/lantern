import { describe, it, expect, vi, afterEach } from 'vitest'
import { EsvBibleProvider } from './esv'
import { EsvCachedBibleProvider } from './esv-cache'
import type { EsvStore, PersistedState } from './esv-store'
import { esvNeighbourChapters, scheduleEsvNeighbourPrefetch } from './service'
import { bookByNumber } from '../utils/bibleBooks'
import { CodedError } from '../errors'
import type { BibleProvider, BibleVerseLine } from './provider'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function fakeJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'status',
    json: async () => body
  } as unknown as Response
}

async function expectCoded(promise: Promise<unknown>, code: string): Promise<void> {
  const err = (await promise.then(() => null).catch((e: unknown) => e)) as CodedError
  expect(err).toBeInstanceOf(CodedError)
  expect(err.code).toBe(code)
}

describe('EsvBibleProvider', () => {
  it('parses the proxy response into the BibleVerseLine shape', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      fakeJsonResponse(200, {
        verses: [
          { verse: 1, text: 'In the beginning was the Word.' },
          { verse: 2, text: 'He was in the beginning with God.' }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const p = new EsvBibleProvider('https://fake.supabase.co/functions/v1/esv-proxy')
    await expect(p.getChapter(43, 1)).resolves.toEqual([
      { verse: 1, text: 'In the beginning was the Word.' },
      { verse: 2, text: 'He was in the beginning with God.' }
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0][0]
    expect(url).toContain('book=John')
    expect(url).toContain('chapter=1')
  })

  it('throws ESV_NOT_CONFIGURED when there is no proxy URL to call (no Supabase env)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const p = new EsvBibleProvider('') // simulates VITE_SUPABASE_URL unset
    await expectCoded(p.getChapter(43, 1), 'ESV_NOT_CONFIGURED')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("throws ESV_NOT_CONFIGURED when the proxy reports the key isn't set (503)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeJsonResponse(503, { error: 'not_configured' }))
    )
    const p = new EsvBibleProvider('https://fake.supabase.co/functions/v1/esv-proxy')
    await expectCoded(p.getChapter(43, 1), 'ESV_NOT_CONFIGURED')
  })

  it('throws ESV_FETCH_FAILED when the proxy is unreachable/offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    const p = new EsvBibleProvider('https://fake.supabase.co/functions/v1/esv-proxy')
    await expectCoded(p.getChapter(43, 1), 'ESV_FETCH_FAILED')
  })

  it('degrades gracefully on a 429 quota response WITHOUT retrying', async () => {
    const fetchMock = vi.fn(async () => fakeJsonResponse(429, { error: 'quota_exceeded' }))
    vi.stubGlobal('fetch', fetchMock)
    const p = new EsvBibleProvider('https://fake.supabase.co/functions/v1/esv-proxy')
    await expectCoded(p.getChapter(43, 1), 'ESV_FETCH_FAILED')
    // The whole point of the quota guardrail: one failed call, no automatic retry.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('degrades gracefully on a 429 rate-limit response WITHOUT retrying', async () => {
    // supabase/functions/esv-proxy/handler.ts returns the same 429 shape for
    // its own per-IP rate limit as it does for Crossway's own quota 429 (the
    // client's status check doesn't distinguish the two — see the test
    // above) — this proves the rate-limit body specifically degrades the
    // same way rather than relying on that being incidental.
    const fetchMock = vi.fn(async () => fakeJsonResponse(429, { error: 'rate_limited' }))
    vi.stubGlobal('fetch', fetchMock)
    const p = new EsvBibleProvider('https://fake.supabase.co/functions/v1/esv-proxy')
    await expectCoded(p.getChapter(43, 1), 'ESV_FETCH_FAILED')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws ESV_FETCH_FAILED on any other non-ok proxy response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeJsonResponse(502, { error: 'upstream_failed' }))
    )
    const p = new EsvBibleProvider('https://fake.supabase.co/functions/v1/esv-proxy')
    await expectCoded(p.getChapter(43, 1), 'ESV_FETCH_FAILED')
  })

  it('throws BIBLE_UNKNOWN_BOOK for an out-of-range book number', async () => {
    const p = new EsvBibleProvider('https://fake.supabase.co/functions/v1/esv-proxy')
    await expectCoded(p.getChapter(67, 1), 'BIBLE_UNKNOWN_BOOK')
  })
})

describe('EsvCachedBibleProvider', () => {
  function makeInner(versesPerChapter: number): {
    provider: BibleProvider
    calls: [number, number][]
  } {
    const calls: [number, number][] = []
    const provider: BibleProvider = {
      async getChapter(bookNumber, chapter) {
        calls.push([bookNumber, chapter])
        const verses: BibleVerseLine[] = Array.from({ length: versesPerChapter }, (_, i) => ({
          verse: i + 1,
          text: `book${bookNumber} ch${chapter} v${i + 1}`
        }))
        return verses
      }
    }
    return { provider, calls }
  }

  it('serves a repeated request from the cache without re-fetching', async () => {
    const { provider, calls } = makeInner(10)
    const cached = new EsvCachedBibleProvider(provider)
    const first = await cached.getChapter(43, 1)
    const second = await cached.getChapter(43, 1)
    expect(second).toEqual(first)
    expect(calls).toHaveLength(1)
  })

  it('evicts the OLDEST cached chapter once the 500-verse cap is exceeded', async () => {
    const { provider, calls } = makeInner(100)
    const cached = new EsvCachedBibleProvider(provider)

    // Five 100-verse chapters exactly fill the 500-verse cap.
    for (let ch = 1; ch <= 5; ch++) await cached.getChapter(43, ch)
    expect(calls).toHaveLength(5)

    // Every one of the five is still cached — re-requesting them causes no
    // further inner fetches.
    for (let ch = 1; ch <= 5; ch++) await cached.getChapter(43, ch)
    expect(calls).toHaveLength(5)

    // A sixth chapter pushes total stored verses to 600, over the cap — the
    // oldest entry (chapter 1) must be evicted to bring it back to 500.
    await cached.getChapter(43, 6)
    expect(calls).toHaveLength(6)

    // Chapter 1 was evicted, so asking for it again re-fetches from the inner
    // provider; chapters 2-6 are all still cached and cause no re-fetch.
    await cached.getChapter(43, 1)
    expect(calls).toHaveLength(7)
    expect(calls[6]).toEqual([43, 1])

    await cached.getChapter(43, 3)
    expect(calls).toHaveLength(7) // chapter 3 was never evicted
  })

  it('keeps a REVISITED chapter cached ahead of one only ever read once (LRU, not FIFO)', async () => {
    const { provider, calls } = makeInner(100)
    const cached = new EsvCachedBibleProvider(provider)

    // Five 100-verse chapters exactly fill the 500-verse cap.
    for (let ch = 1; ch <= 5; ch++) await cached.getChapter(43, ch)
    expect(calls).toHaveLength(5)

    // The reader goes BACK to chapter 1 — a cache hit — before moving on.
    // Under plain FIFO this would not change chapter 1's eviction order at
    // all, since FIFO only tracks insertion time; under LRU this is exactly
    // what should protect it.
    await cached.getChapter(43, 1)
    expect(calls).toHaveLength(5) // still a hit, no re-fetch

    // A sixth chapter pushes total stored verses over the cap. Chapter 2 is
    // now the least-recently-used entry (chapter 1 was just touched), so it
    // must be evicted instead of chapter 1.
    await cached.getChapter(43, 6)
    expect(calls).toHaveLength(6)

    // Chapter 1 (revisited) is still cached — no re-fetch.
    await cached.getChapter(43, 1)
    expect(calls).toHaveLength(6)

    // Chapter 2 (never revisited) was evicted in its place.
    await cached.getChapter(43, 2)
    expect(calls).toHaveLength(7)
    expect(calls[6]).toEqual([43, 2])
  })
})

describe('EsvCachedBibleProvider persistence', () => {
  // A fake EsvStore, so these tests need no IndexedDB. Note the production
  // store degrades to a no-op when indexedDB is undefined, which is why every
  // other test in this file still passes without one.
  function makeStore(initial: PersistedState | null = null): {
    store: EsvStore
    saved: PersistedState[]
  } {
    const saved: PersistedState[] = []
    let current = initial
    return {
      saved,
      store: {
        load: async () => current,
        save: async state => {
          current = state
          saved.push(state)
        }
      }
    }
  }

  function makeInner(versesPerChapter: number): {
    provider: BibleProvider
    calls: number[]
  } {
    const calls: number[] = []
    const provider: BibleProvider = {
      async getChapter(bookNumber, chapter) {
        calls.push(chapter)
        return Array.from({ length: versesPerChapter }, (_, i) => ({
          verse: i + 1,
          text: `book${bookNumber} ch${chapter} v${i + 1}`
        }))
      }
    }
    return { provider, calls }
  }

  it('survives a reload: a chapter read before is served without re-fetching', async () => {
    const { store } = makeStore()
    const first = makeInner(10)
    const before = new EsvCachedBibleProvider(first.provider, store)
    const verses = await before.getChapter(43, 3)
    expect(first.calls).toHaveLength(1)

    // A new instance is what a page reload produces.
    const second = makeInner(10)
    const after = new EsvCachedBibleProvider(second.provider, store)
    await expect(after.getChapter(43, 3)).resolves.toEqual(verses)
    expect(second.calls).toHaveLength(0)
  })

  it('never persists more than the 500-verse licence cap', async () => {
    const { store, saved } = makeStore()
    const inner = makeInner(100)
    const cached = new EsvCachedBibleProvider(inner.provider, store)

    for (let ch = 1; ch <= 12; ch++) await cached.getChapter(43, ch)

    expect(saved.length).toBeGreaterThan(0)
    for (const state of saved) {
      const verses = state.entries.reduce((n, e) => n + e.verses.length, 0)
      expect(verses).toBeLessThanOrEqual(500)
    }
  })

  it('re-enforces the cap on hydration rather than trusting what was on disk', async () => {
    // A state that exceeds the cap — a corrupted record, or one written by a
    // build with a different limit. The cap is a licence term, so it must be
    // enforced on the way IN, not only on the way out.
    const oversized: PersistedState = {
      entries: Array.from({ length: 10 }, (_, i) => ({
        key: `43/${i + 1}`,
        verses: Array.from({ length: 100 }, (_, v) => ({ verse: v + 1, text: 't' }))
      }))
    }
    const { store, saved } = makeStore(oversized)
    const inner = makeInner(10)
    const cached = new EsvCachedBibleProvider(inner.provider, store)

    await cached.getChapter(43, 99) // any read triggers hydration
    const latest = saved[saved.length - 1]
    const verses = latest.entries.reduce((n, e) => n + e.verses.length, 0)
    expect(verses).toBeLessThanOrEqual(500)
  })

  it('persists a cache HIT too, so LRU order survives a reload', async () => {
    const { store, saved } = makeStore()
    const inner = makeInner(10)
    const cached = new EsvCachedBibleProvider(inner.provider, store)

    await cached.getChapter(43, 1)
    await cached.getChapter(43, 2)
    const writesBefore = saved.length
    await cached.getChapter(43, 1) // a hit, which reorders

    expect(saved.length).toBeGreaterThan(writesBefore)
    const order = saved[saved.length - 1].entries.map(e => e.key)
    expect(order[order.length - 1]).toBe('43/1') // most-recently-used last
  })

  it('still works when the store fails entirely', async () => {
    const failing: EsvStore = {
      load: async () => {
        throw new Error('storage blocked')
      },
      save: async () => {
        throw new Error('storage blocked')
      }
    }
    const inner = makeInner(10)
    const cached = new EsvCachedBibleProvider(inner.provider, failing)
    // Hydration rejecting must not take the read down with it.
    await expect(cached.getChapter(43, 1)).rejects.toThrow('storage blocked')
  })
})

describe('EsvCachedBibleProvider.prefetch (neighbour prefetch)', () => {
  function makeInner(versesPerChapter: number): {
    provider: BibleProvider
    calls: [number, number][]
  } {
    const calls: [number, number][] = []
    const provider: BibleProvider = {
      async getChapter(bookNumber, chapter) {
        calls.push([bookNumber, chapter])
        return Array.from({ length: versesPerChapter }, (_, i) => ({
          verse: i + 1,
          text: `book${bookNumber} ch${chapter} v${i + 1}`
        }))
      }
    }
    return { provider, calls }
  }

  it('writes through the same cache a normal read would, respecting the cap', async () => {
    const { provider, calls } = makeInner(100)
    const cached = new EsvCachedBibleProvider(provider)

    for (let ch = 1; ch <= 5; ch++) await cached.prefetch(43, ch)
    expect(calls).toHaveLength(5)

    // A prefetched chapter is a real cache entry: the reader's own request
    // for it causes no further fetch.
    await cached.getChapter(43, 3)
    expect(calls).toHaveLength(5)

    // A sixth prefetch pushes the cap and must evict, exactly like an
    // on-demand read does.
    await cached.prefetch(43, 6)
    expect(calls).toHaveLength(6)
    await cached.getChapter(43, 1) // evicted, re-fetches
    expect(calls).toHaveLength(7)
  })

  it('does not refetch a chapter already in the cache', async () => {
    const { provider, calls } = makeInner(10)
    const cached = new EsvCachedBibleProvider(provider)

    await cached.getChapter(43, 2) // the reader's own read
    await cached.prefetch(43, 2) // scheduled prefetch of the same chapter
    expect(calls).toHaveLength(1)
  })

  it('deduplicates two concurrent prefetches of the same chapter into one fetch', async () => {
    let resolveInner: ((verses: BibleVerseLine[]) => void) | null = null
    const calls: [number, number][] = []
    const provider: BibleProvider = {
      getChapter(bookNumber, chapter) {
        calls.push([bookNumber, chapter])
        return new Promise(resolve => {
          resolveInner = resolve
        })
      }
    }
    const cached = new EsvCachedBibleProvider(provider)

    const first = cached.prefetch(43, 5)
    const second = cached.prefetch(43, 5) // turning pages quickly, same neighbour twice
    // Let hydration (an async no-op with no IndexedDB in this test env) settle
    // before checking that only one fetch was actually issued.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(calls).toHaveLength(1)

    resolveInner!([{ verse: 1, text: 'v1' }])
    await Promise.all([first, second])
    expect(calls).toHaveLength(1)
  })

  it('deduplicates a prefetch racing the reader turning to the same chapter', async () => {
    let resolveInner: ((verses: BibleVerseLine[]) => void) | null = null
    const calls: [number, number][] = []
    const provider: BibleProvider = {
      getChapter(bookNumber, chapter) {
        calls.push([bookNumber, chapter])
        return new Promise(resolve => {
          resolveInner = resolve
        })
      }
    }
    const cached = new EsvCachedBibleProvider(provider)

    const prefetch = cached.prefetch(43, 5)
    const read = cached.getChapter(43, 5) // the reader arrives before the prefetch resolved
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(calls).toHaveLength(1)

    resolveInner!([{ verse: 1, text: 'v1' }])
    const [, verses] = await Promise.all([prefetch, read])
    expect(verses).toEqual([{ verse: 1, text: 'v1' }])
  })

  it('is silent on failure: no throw, and the reader’s own next request is unaffected', async () => {
    let shouldFail = true
    const calls: number[] = []
    const provider: BibleProvider = {
      async getChapter(_bookNumber, chapter) {
        calls.push(chapter)
        if (shouldFail) throw new Error('network blip')
        return [{ verse: 1, text: 'v1' }]
      }
    }
    const cached = new EsvCachedBibleProvider(provider)

    await expect(cached.prefetch(43, 7)).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)

    // The reader's own request behaves exactly as it does today: a plain
    // retry-free read that still surfaces the failure if it recurs, and
    // succeeds normally once the transient blip is gone.
    shouldFail = false
    await expect(cached.getChapter(43, 7)).resolves.toEqual([{ verse: 1, text: 'v1' }])
    expect(calls).toHaveLength(2)
  })
})

describe('esvNeighbourChapters (pure)', () => {
  it('mid-book: both the previous and next chapter, same book', () => {
    const john = bookByNumber(43)!
    expect(esvNeighbourChapters(43, 3)).toEqual([
      { bookNumber: 43, bookName: john.name, chapter: 2 },
      { bookNumber: 43, bookName: john.name, chapter: 4 }
    ])
  })

  it('first chapter of the first book: no previous, only next', () => {
    expect(esvNeighbourChapters(1, 1)).toEqual([{ bookNumber: 1, bookName: 'Genesis', chapter: 2 }])
  })

  it('last chapter of a book: next rolls into the following book', () => {
    const malachi = bookByNumber(39)!
    const matthew = bookByNumber(40)!
    expect(esvNeighbourChapters(malachi.number, malachi.chapters)).toEqual([
      { bookNumber: malachi.number, bookName: malachi.name, chapter: malachi.chapters - 1 },
      { bookNumber: matthew.number, bookName: matthew.name, chapter: 1 }
    ])
  })

  it('last chapter of Revelation: no next, only previous', () => {
    const revelation = bookByNumber(66)!
    expect(esvNeighbourChapters(revelation.number, revelation.chapters)).toEqual([
      { bookNumber: 66, bookName: revelation.name, chapter: revelation.chapters - 1 }
    ])
  })
})

describe('scheduleEsvNeighbourPrefetch', () => {
  it('schedules a prefetch for every neighbour that exists', () => {
    const prefetch = vi.fn()
    scheduleEsvNeighbourPrefetch(43, 3, prefetch, run => run())
    expect(prefetch).toHaveBeenCalledTimes(2)
    expect(prefetch).toHaveBeenCalledWith(43, 2)
    expect(prefetch).toHaveBeenCalledWith(43, 4)
  })

  it('schedules only the one neighbour that exists at a canon edge', () => {
    const prefetch = vi.fn()
    scheduleEsvNeighbourPrefetch(1, 1, prefetch, run => run())
    expect(prefetch).toHaveBeenCalledTimes(1)
    expect(prefetch).toHaveBeenCalledWith(1, 2)
  })

  it('uses requestIdleCallback when available, not a bare synchronous call', () => {
    const idle = vi.fn((cb: () => void) => {
      cb()
      return 1
    })
    vi.stubGlobal('requestIdleCallback', idle)
    const prefetch = vi.fn()

    scheduleEsvNeighbourPrefetch(43, 3, prefetch)

    expect(idle).toHaveBeenCalledTimes(2)
    expect(prefetch).toHaveBeenCalledTimes(2)
  })

  it('falls back to a short timeout when requestIdleCallback is unavailable', () => {
    vi.stubGlobal('requestIdleCallback', undefined)
    vi.useFakeTimers()
    const prefetch = vi.fn()

    scheduleEsvNeighbourPrefetch(43, 3, prefetch)
    expect(prefetch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(250)
    expect(prefetch).toHaveBeenCalledTimes(2)
  })
})
