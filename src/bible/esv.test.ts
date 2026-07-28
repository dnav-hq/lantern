import { describe, it, expect, vi, afterEach } from 'vitest'
import { EsvBibleProvider } from './esv'
import { EsvCachedBibleProvider } from './esv-cache'
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
})
