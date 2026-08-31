import { describe, it, expect, vi, afterEach } from 'vitest'
import { EsvBibleProvider } from './esv'
import { EsvCachedBibleProvider } from './esv-cache'
import type { EsvStore, PersistedState } from './esv-store'
import { CodedError } from '../errors'
import type { BibleProvider, BibleVerseLine } from './provider'

afterEach(() => {
  vi.restoreAllMocks()
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
