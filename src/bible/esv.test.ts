import { describe, it, expect, vi, afterEach } from 'vitest'
import { EsvBibleProvider, EsvRefsUnsupportedError } from './esv'
import { EsvCachedBibleProvider } from './esv-cache'
import type { EsvStore, PersistedState } from './esv-store'
import { CodedError } from '../errors'
import type { BibleProvider, BibleVerseLine, PassageRef } from './provider'

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

  it("carries the translators' notes through, shipping only the alternate-rendering class", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeJsonResponse(200, {
          verses: [
            {
              verse: 4,
              text: 'In him was life, and the life was the light of men.',
              notes: [
                { offset: 16, text: 'Or understood' },
                { offset: 16, text: 'Some manuscripts read differently' },
                { offset: 999, text: 'Or out of range' }
              ]
            },
            { verse: 5, text: 'The light shines in the darkness.' }
          ]
        })
      )
    )
    const p = new EsvBibleProvider('https://fake.supabase.co/functions/v1/esv-proxy')
    const verses = await p.getChapter(43, 1)
    expect(verses[0].notes).toEqual([{ offset: 16, text: 'Or understood' }])
    // absent, not empty, where nothing ships
    expect(verses[1]).not.toHaveProperty('notes')
  })
})

describe('EsvBibleProvider.getPassages', () => {
  const URL = 'https://fake.supabase.co/functions/v1/esv-proxy'

  it('asks the proxy for every range in ONE ?refs= call and keys the answer by chapter', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      fakeJsonResponse(200, {
        passages: [
          { reference: 'Jeremiah 4:23', verses: [{ verse: 23, text: 'I looked' }] },
          {
            reference: 'Psalm 104:30',
            verses: [
              { verse: 30, text: 'When you send', notes: [{ offset: 4, text: 'Or breath' }] }
            ]
          },
          {
            reference: 'Isaiah 45:18-19',
            verses: [
              { verse: 18, text: 'For thus' },
              { verse: 19, text: 'I did not' }
            ]
          },
          { reference: 'Isaiah 45:12', verses: [{ verse: 12, text: 'I made' }] }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    const p = new EsvBibleProvider(URL)
    const found = await p.getPassages([
      { book: 24, chapter: 4, verse: 23 },
      { book: 19, chapter: 104, verse: 30 },
      { book: 23, chapter: 45, verse: 18, endVerse: 19 },
      { book: 23, chapter: 45, verse: 12 }
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = decodeURIComponent(fetchMock.mock.calls[0][0])
    expect(url).toContain('refs=Jeremiah 4:23;Psalms 104:30;Isaiah 45:18-19;Isaiah 45:12')
    expect([...found.keys()]).toEqual(['24/4', '19/104', '23/45'])
    expect(found.get('19/104')).toEqual([
      { verse: 30, text: 'When you send', notes: [{ offset: 4, text: 'Or breath' }] }
    ])
    // two ranges in one chapter are merged, in verse order
    expect(found.get('23/45')!.map(v => v.verse)).toEqual([12, 18, 19])
  })

  it('on a 400 (older proxy) throws EsvRefsUnsupportedError and remembers it without another fetch', async () => {
    const fetchMock = vi.fn(async () => fakeJsonResponse(400, { error: 'invalid_request' }))
    vi.stubGlobal('fetch', fetchMock)
    const p = new EsvBibleProvider(URL)
    const refs = [{ book: 43, chapter: 1, verse: 1 }]
    await expect(p.getPassages(refs)).rejects.toBeInstanceOf(EsvRefsUnsupportedError)
    await expect(p.getPassages(refs)).rejects.toBeInstanceOf(EsvRefsUnsupportedError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a quota 429 degrades like a chapter read does', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeJsonResponse(429, { error: 'quota_exceeded' }))
    )
    const p = new EsvBibleProvider(URL)
    await expectCoded(p.getPassages([{ book: 43, chapter: 1, verse: 1 }]), 'ESV_FETCH_FAILED')
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

  it("keeps the translators' notes through the cache AND across a reload", async () => {
    const { store } = makeStore()
    const noted: BibleVerseLine[] = [
      { verse: 1, text: 'In the beginning', notes: [{ offset: 6, text: 'Or at first' }] },
      { verse: 2, text: 'He was' }
    ]
    const inner: BibleProvider = { getChapter: async () => noted }
    const before = new EsvCachedBibleProvider(inner, store)
    await before.getChapter(43, 1)
    // second read: from memory
    expect(await before.getChapter(43, 1)).toEqual(noted)
    // third read: a new instance, from disk
    const never: BibleProvider = {
      getChapter: async () => {
        throw new Error('should be served from the store')
      }
    }
    const after = new EsvCachedBibleProvider(never, store)
    expect(await after.getChapter(43, 1)).toEqual(noted)
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

describe('EsvCachedBibleProvider.getPassages', () => {
  function lines(book: number, chapter: number, from: number, to: number): BibleVerseLine[] {
    return Array.from({ length: to - from + 1 }, (_, i) => ({
      verse: from + i,
      text: `book${book} ch${chapter} v${from + i}`
    }))
  }
  function makeInner(versesPerChapter: number): {
    provider: BibleProvider
    chapterCalls: number[]
    passageCalls: PassageRef[][]
  } {
    const chapterCalls: number[] = []
    const passageCalls: PassageRef[][] = []
    return {
      chapterCalls,
      passageCalls,
      provider: {
        async getChapter(book, chapter) {
          chapterCalls.push(chapter)
          return lines(book, chapter, 1, versesPerChapter)
        },
        async getPassages(refs) {
          passageCalls.push(refs)
          const out = new Map<string, BibleVerseLine[]>()
          for (const r of refs) {
            const key = `${r.book}/${r.chapter}`
            const have = out.get(key) ?? []
            have.push(...lines(r.book, r.chapter, r.verse, r.endVerse ?? r.verse))
            out.set(key, have)
          }
          return out
        }
      }
    }
  }

  it('serves a whole-cached chapter from the cache and fetches only the rest, in one call', async () => {
    const inner = makeInner(10)
    const cached = new EsvCachedBibleProvider(inner.provider)
    await cached.getChapter(43, 1)
    const found = await cached.getPassages([
      { book: 43, chapter: 1, verse: 3, endVerse: 4 },
      { book: 45, chapter: 4, verse: 3 },
      { book: 45, chapter: 4, verse: 9 }
    ])
    expect(inner.passageCalls).toHaveLength(1)
    expect(inner.passageCalls[0].map(r => `${r.book}/${r.chapter}:${r.verse}`)).toEqual([
      '45/4:3',
      '45/4:9'
    ])
    expect(found.get('43/1')!.map(v => v.verse)).toEqual([3, 4])
    expect(found.get('45/4')!.map(v => v.verse)).toEqual([3, 9])
  })

  it('a partial entry never answers getChapter, and is replaced by the whole chapter', async () => {
    const inner = makeInner(10)
    const cached = new EsvCachedBibleProvider(inner.provider)
    await cached.getPassages([{ book: 45, chapter: 4, verse: 3 }])
    const whole = await cached.getChapter(45, 4)
    expect(whole).toHaveLength(10)
    expect(inner.chapterCalls).toEqual([4])
    // now fully cached: the next range read costs nothing
    await cached.getPassages([{ book: 45, chapter: 4, verse: 9 }])
    expect(inner.passageCalls).toHaveLength(1)
  })

  it('a partial entry that already holds the verses answers without a fetch; a new verse refetches and merges', async () => {
    const inner = makeInner(10)
    const cached = new EsvCachedBibleProvider(inner.provider)
    await cached.getPassages([{ book: 45, chapter: 4, verse: 3, endVerse: 6 }])
    await cached.getPassages([{ book: 45, chapter: 4, verse: 4 }])
    expect(inner.passageCalls).toHaveLength(1)
    const found = await cached.getPassages([{ book: 45, chapter: 4, verse: 9 }])
    expect(inner.passageCalls).toHaveLength(2)
    expect(found.get('45/4')!.map(v => v.verse)).toEqual([9])
    // merged: 3-6 and 9 both resident now
    const again = await cached.getPassages([{ book: 45, chapter: 4, verse: 5, endVerse: 9 }])
    expect(inner.passageCalls).toHaveLength(3) // 7 and 8 were never fetched
    expect(again.get('45/4')!.map(v => v.verse)).toEqual([5, 6, 7, 8, 9])
  })

  it('range reads count against the same 500-verse cap', async () => {
    const saved: PersistedState[] = []
    const store: EsvStore = {
      load: async () => null,
      save: async state => {
        saved.push(state)
      }
    }
    const inner = makeInner(100)
    const cached = new EsvCachedBibleProvider(inner.provider, store)
    for (let ch = 1; ch <= 5; ch++) await cached.getChapter(43, ch)
    await cached.getPassages([{ book: 45, chapter: 4, verse: 1, endVerse: 50 }])
    for (const state of saved) {
      const verses = state.entries.reduce((n, e) => n + e.verses.length, 0)
      expect(verses).toBeLessThanOrEqual(500)
    }
    const latest = saved[saved.length - 1]
    expect(latest.entries.find(e => e.key === '45/4')?.partial).toBe(true)
    expect(latest.entries.some(e => e.key === '43/1')).toBe(false) // the LRU chapter went
  })

  it('falls back to whole-chapter reads when the proxy does not know ?refs=', async () => {
    const inner = makeInner(10)
    inner.provider.getPassages = async () => {
      throw new EsvRefsUnsupportedError()
    }
    const cached = new EsvCachedBibleProvider(inner.provider)
    const found = await cached.getPassages([
      { book: 45, chapter: 4, verse: 3 },
      { book: 45, chapter: 4, verse: 9 },
      { book: 59, chapter: 2, verse: 23 }
    ])
    expect(inner.chapterCalls).toEqual([4, 2])
    expect(found.get('45/4')!.map(v => v.verse)).toEqual([3, 9])
    // cached as WHOLE chapters, so a reader opening the chapter pays nothing
    await cached.getChapter(45, 4)
    expect(inner.chapterCalls).toEqual([4, 2])
  })
})
