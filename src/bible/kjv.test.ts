import { describe, it, expect, vi, afterEach } from 'vitest'
import { KjvBibleProvider } from './kjv'
import { KjvSelfHostedBibleProvider } from './kjv-self-hosted'
import { FallbackBibleProvider } from './fallback'
import { CodedError } from '../errors'

afterEach(() => {
  vi.restoreAllMocks()
})

// Mirrors the shape of a real bible.helloao.org /api/eng_kjv/{USFM}/{ch}.json
// response — see kjv.ts's comment for the full node/content shape.
function fakeResponse(content: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ chapter: { number: 3, content } })
  } as unknown as Response
}

describe('KjvBibleProvider', () => {
  it('flattens verse content the same way BSB does', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeResponse([{ type: 'verse', number: 1, content: ['Hello, ', { text: 'world' }, '.'] }])
      )
    )
    const p = new KjvBibleProvider()
    await expect(p.getChapter(43, 3)).resolves.toEqual([{ verse: 1, text: 'Hello, world.' }])
  })

  it('strips a leading paragraph pilcrow, which BSB never carries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeResponse([
          {
            type: 'verse',
            number: 16,
            content: [{ text: '¶ For God so loved the world', wordsOfJesus: false }]
          }
        ])
      )
    )
    const p = new KjvBibleProvider()
    const verses = await p.getChapter(43, 3)
    expect(verses).toEqual([{ verse: 16, text: 'For God so loved the world' }])
  })

  it('ignores noteId and lineBreak markers, same as helloao.ts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeResponse([
          {
            type: 'verse',
            number: 1,
            content: ['In the beginning', { noteId: 1 }, { lineBreak: true }, ' was the Word.']
          }
        ])
      )
    )
    const p = new KjvBibleProvider()
    await expect(p.getChapter(43, 1)).resolves.toEqual([
      { verse: 1, text: 'In the beginning was the Word.' }
    ])
  })

  it('throws BIBLE_UNKNOWN_BOOK for an out-of-range book number', async () => {
    const p = new KjvBibleProvider()
    await expect(p.getChapter(67, 1)).rejects.toThrow(CodedError)
  })

  it('throws BIBLE_FETCH_FAILED with the KJV detail on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' }) as Response)
    )
    const p = new KjvBibleProvider()
    const err = (await p
      .getChapter(43, 3)
      .then(() => null)
      .catch((e: unknown) => e)) as CodedError
    expect(err.code).toBe('BIBLE_FETCH_FAILED')
    expect(err.detailForConsole()).toContain('KJV JHN 3')
  })
})

// Mirrors self-hosted.test.ts, for the KJV counterpart bundle.
describe('KjvSelfHostedBibleProvider', () => {
  const BUNDLE = {
    '43': { '3': [[16, 'For God so loved the world']] }
  } as unknown as Record<string, Record<string, [number, string][]>>

  it('serves any chapter present in the bundle, mapped to BibleVerseLine[]', async () => {
    const p = new KjvSelfHostedBibleProvider('/unused', async () => BUNDLE)
    await expect(p.getChapter(43, 3)).resolves.toEqual([
      { verse: 16, text: 'For God so loved the world' }
    ])
  })

  it('throws a coded error for a chapter the bundle does not contain', async () => {
    const p = new KjvSelfHostedBibleProvider('/unused', async () => BUNDLE)
    const err = (await p
      .getChapter(66, 23)
      .then(() => null)
      .catch((e: unknown) => e)) as CodedError
    expect(err.code).toBe('BIBLE_BUNDLE_CHAPTER_MISSING')
    expect(err.message).toBe('BIBLE_BUNDLE_CHAPTER_MISSING')
    expect(err.detailForConsole()).toContain('KJV')
  })

  it('loads the bundle lazily and only once, sharing it across reads', async () => {
    const loader = vi.fn(async () => BUNDLE)
    const p = new KjvSelfHostedBibleProvider('/unused', loader)
    expect(loader).not.toHaveBeenCalled()
    await Promise.all([p.getChapter(43, 3), p.getChapter(43, 3)])
    expect(loader).toHaveBeenCalledTimes(1)
  })
})

// Mirrors fallback.test.ts's "with the self-hosted BSB" block, confirming the
// same FallbackBibleProvider composition works for the KJV pairing.
describe('FallbackBibleProvider with the self-hosted KJV', () => {
  const BUNDLE = {
    '43': { '3': [[16, 'For God so loved the world, KJV wording']] }
  } as unknown as Record<string, Record<string, [number, string][]>>

  it('never touches the self-hosted bundle when helloao succeeds', async () => {
    const loader = vi.fn(async () => BUNDLE)
    const p = new FallbackBibleProvider(
      { getChapter: async () => [{ verse: 16, text: 'from helloao' }] },
      new KjvSelfHostedBibleProvider('/unused', loader)
    )
    await expect(p.getChapter(43, 3)).resolves.toEqual([{ verse: 16, text: 'from helloao' }])
    expect(loader).not.toHaveBeenCalled()
  })

  it('serves the self-hosted KJV bundle when helloao fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = new FallbackBibleProvider(
      {
        getChapter: async () => {
          throw new Error('helloao fetch failed: 503')
        }
      },
      new KjvSelfHostedBibleProvider('/unused', async () => BUNDLE)
    )
    await expect(p.getChapter(43, 3)).resolves.toEqual([
      { verse: 16, text: 'For God so loved the world, KJV wording' }
    ])
  })
})
