import { describe, it, expect, vi } from 'vitest'
import { createEsvProxyHandler, parseEsvText, splitFootnotes, stripCallers } from './handler'
import { IpRateLimiter } from './ratelimit'

function esvSuccessResponse(): Response {
  return new Response(JSON.stringify({ passages: ['[1] In the beginning.'] }), { status: 200 })
}

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://project.supabase.co/functions/v1/esv-proxy?book=John&chapter=1', {
    headers
  })
}

describe('createEsvProxyHandler — rate limiting', () => {
  it('proxies to Crossway and meters "ok" while under the cap', async () => {
    const fetchImpl = vi.fn(async () => esvSuccessResponse())
    const recordUsage = vi.fn()
    const handle = createEsvProxyHandler({
      apiKey: 'test-key',
      fetchImpl,
      rateLimiter: new IpRateLimiter(60_000, 5),
      recordUsage,
      now: () => 0
    })

    const res = await handle(req({ 'x-forwarded-for': '203.0.113.5' }))

    expect(res.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(recordUsage).toHaveBeenCalledWith('ok')
  })

  it('rejects an over-cap request with 429 and NEVER calls the upstream fetch', async () => {
    const fetchImpl = vi.fn(async () => esvSuccessResponse())
    const recordUsage = vi.fn()
    const rateLimiter = new IpRateLimiter(60_000, 1)
    const handle = createEsvProxyHandler({
      apiKey: 'test-key',
      fetchImpl,
      rateLimiter,
      recordUsage,
      now: () => 0
    })

    const first = await handle(req({ 'x-forwarded-for': '203.0.113.5' }))
    expect(first.status).toBe(200)
    fetchImpl.mockClear()

    const second = await handle(req({ 'x-forwarded-for': '203.0.113.5' }))
    expect(second.status).toBe(429)
    const body = await second.json()
    expect(body).toEqual({ error: 'rate_limited' })

    // The whole point: an over-cap request must never reach Crossway.
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never meters a rate-limited request as "ok"', async () => {
    const fetchImpl = vi.fn(async () => esvSuccessResponse())
    const recordUsage = vi.fn()
    const rateLimiter = new IpRateLimiter(60_000, 1)
    const handle = createEsvProxyHandler({
      apiKey: 'test-key',
      fetchImpl,
      rateLimiter,
      recordUsage,
      now: () => 0
    })

    await handle(req({ 'x-forwarded-for': '203.0.113.5' }))
    recordUsage.mockClear()

    await handle(req({ 'x-forwarded-for': '203.0.113.5' }))
    expect(recordUsage).not.toHaveBeenCalledWith('ok')
    expect(recordUsage).not.toHaveBeenCalled()
  })

  it('allows requests again once the rate-limit window resets', async () => {
    const fetchImpl = vi.fn(async () => esvSuccessResponse())
    const rateLimiter = new IpRateLimiter(60_000, 1)
    let now = 0
    const handle = createEsvProxyHandler({
      apiKey: 'test-key',
      fetchImpl,
      rateLimiter,
      recordUsage: vi.fn(),
      now: () => now
    })

    expect((await handle(req({ 'x-forwarded-for': '203.0.113.5' }))).status).toBe(200)
    expect((await handle(req({ 'x-forwarded-for': '203.0.113.5' }))).status).toBe(429)

    now = 60_000 // window elapsed
    expect((await handle(req({ 'x-forwarded-for': '203.0.113.5' }))).status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("tracks separate callers independently, so one IP cannot exhaust another's budget", async () => {
    const fetchImpl = vi.fn(async () => esvSuccessResponse())
    const rateLimiter = new IpRateLimiter(60_000, 1)
    const handle = createEsvProxyHandler({
      apiKey: 'test-key',
      fetchImpl,
      rateLimiter,
      recordUsage: vi.fn(),
      now: () => 0
    })

    expect((await handle(req({ 'x-forwarded-for': '203.0.113.5' }))).status).toBe(200)
    expect((await handle(req({ 'x-forwarded-for': '203.0.113.5' }))).status).toBe(429)
    expect((await handle(req({ 'x-forwarded-for': '198.51.100.9' }))).status).toBe(200)
  })

  it('rate-limits ahead of the not_configured check (no key still gets 429 first)', async () => {
    const fetchImpl = vi.fn(async () => esvSuccessResponse())
    const rateLimiter = new IpRateLimiter(60_000, 1)
    const handle = createEsvProxyHandler({
      apiKey: '', // unset
      fetchImpl,
      rateLimiter,
      recordUsage: vi.fn(),
      now: () => 0
    })

    expect((await handle(req({ 'x-forwarded-for': '203.0.113.5' }))).status).toBe(503)
    const second = await handle(req({ 'x-forwarded-for': '203.0.113.5' }))
    expect(second.status).toBe(429)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('createEsvProxyHandler — existing behaviour preserved', () => {
  it('answers CORS preflight', async () => {
    const handle = createEsvProxyHandler({
      apiKey: 'test-key',
      fetchImpl: vi.fn(),
      rateLimiter: new IpRateLimiter(60_000, 20),
      recordUsage: vi.fn()
    })
    const res = await handle(
      new Request('https://project.supabase.co/functions/v1/esv-proxy', { method: 'OPTIONS' })
    )
    expect(res.status).toBe(204)
  })

  it('returns 503 not_configured when the key is unset (under the rate cap)', async () => {
    const handle = createEsvProxyHandler({
      apiKey: '',
      fetchImpl: vi.fn(),
      rateLimiter: new IpRateLimiter(60_000, 20),
      recordUsage: vi.fn()
    })
    const res = await handle(req())
    expect(res.status).toBe(503)
  })

  it('passes through a Crossway 429 as quota_exceeded and meters it as "quota"', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({}), { status: 429 }))
    const recordUsage = vi.fn()
    const handle = createEsvProxyHandler({
      apiKey: 'test-key',
      fetchImpl,
      rateLimiter: new IpRateLimiter(60_000, 20),
      recordUsage
    })
    const res = await handle(req())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'quota_exceeded' })
    expect(recordUsage).toHaveBeenCalledWith('quota')
  })
})

// ── Translators' notes ───────────────────────────────────────────────────────
// Crossway's docs describe include-footnotes (callers in the text) and
// include-footnote-body (a block below it) but print no sample, and there is
// no key in this repo to fetch a real one. The fixture below is the documented
// shape: "(n)" callers after the flagged word, then a "Footnotes" heading and
// one "(n) c:v body" line per note.
const JOHN_1_WITH_NOTES = [
  '  [1] In the beginning was the Word, and the Word was with God, and the Word was God.',
  '[2] He was in the beginning with God. [3] All things were made through him, and without him was not any thing made that was made.(1) [4] In him was life,(2) and the life was the light of men. [5] The light shines in the darkness, and the darkness has not overcome(3) it.',
  '',
  'Footnotes',
  '',
  '(1) 1:3 Or was not anything made. That which has been made was life in him',
  '(2) 1:4 Some manuscripts read differently here',
  '(3) 1:5 Or understood',
  ''
].join('\n')

function handlerWith(fetchImpl: unknown) {
  return createEsvProxyHandler({
    apiKey: 'test-key',
    fetchImpl: fetchImpl as typeof fetch,
    rateLimiter: new IpRateLimiter(60_000, 20),
    recordUsage: vi.fn()
  })
}

describe('parseEsvText — footnotes', () => {
  it('strips callers, anchors each note at the end of the word before it, and drops the block', () => {
    const verses = parseEsvText(JOHN_1_WITH_NOTES)
    expect(verses.map(v => v.verse)).toEqual([1, 2, 3, 4, 5])
    expect(verses[0].notes).toBeUndefined()
    const v3 = verses[2]
    expect(v3.text).toBe(
      'All things were made through him, and without him was not any thing made that was made.'
    )
    expect(v3.notes).toEqual([
      {
        offset: v3.text.length,
        text: 'Or was not anything made. That which has been made was life in him'
      }
    ])
    const v4 = verses[3]
    expect(v4.text).toBe('In him was life, and the life was the light of men.')
    expect(v4.notes).toEqual([
      { offset: 'In him was life,'.length, text: 'Some manuscripts read differently here' }
    ])
    const v5 = verses[4]
    expect(v5.text).toBe('The light shines in the darkness, and the darkness has not overcome it.')
    expect(v5.notes![0].offset).toBe(v5.text.indexOf('overcome') + 'overcome'.length)
    // nothing of the Footnotes block survives in the last verse
    expect(v5.text).not.toContain('Footnotes')
  })

  it('closes up a space before a caller and keeps the one after it', () => {
    const { text, notes } = stripCallers('a word (1) next', new Map([[1, 'Or term']]))
    expect(text).toBe('a word next')
    expect(notes).toEqual([{ offset: 6, text: 'Or term' }])
  })

  it('leaves a parenthesised numeral alone when no footnote defines it', () => {
    const { text, notes } = stripCallers('counted (2) sheep', new Map([[1, 'Or term']]))
    expect(text).toBe('counted (2) sheep')
    expect(notes).toEqual([])
  })

  it('parses a passage with no Footnotes block exactly as before', () => {
    expect(parseEsvText('[35] Jesus wept.')).toEqual([{ verse: 35, text: 'Jesus wept.' }])
  })

  it('folds a wrapped footnote line into the note above it', () => {
    const { footnotes } = splitFootnotes('[1] x(1)\n\nFootnotes\n\n(1) 1:1 Or a long\nnote\n')
    expect(footnotes.get(1)).toBe('Or a long note')
  })

  it('requests footnotes from Crossway and returns notes on the wire', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const u = new URL(url)
      expect(u.searchParams.get('include-footnotes')).toBe('true')
      expect(u.searchParams.get('include-footnote-body')).toBe('true')
      return new Response(JSON.stringify({ passages: [JOHN_1_WITH_NOTES] }), { status: 200 })
    })
    const res = await handlerWith(fetchImpl)(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.verses[2].notes).toHaveLength(1)
    expect(body.verses[0]).not.toHaveProperty('notes')
  })
})

// ── Multi-reference fetch ────────────────────────────────────────────────────
describe('createEsvProxyHandler — ?refs=', () => {
  function refsReq(refs: string): Request {
    const u = new URL('https://project.supabase.co/functions/v1/esv-proxy')
    u.searchParams.set('refs', refs)
    return new Request(u.toString(), { headers: { 'x-forwarded-for': '203.0.113.5' } })
  }

  it('sends the references in ONE upstream q, meters ONE call, answers in order', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const u = new URL(url)
      expect(u.searchParams.get('q')).toBe('Jeremiah 4:23;Psalm 104:30;Isaiah 45:18-19')
      return new Response(
        JSON.stringify({
          passages: [
            '[23] I looked on the earth, and behold, it was without form and void;\n',
            '[30] When you send forth your Spirit,(1) they are created,\n\nFootnotes\n\n(1) 104:30 Or breath\n',
            '[18] For thus says the LORD, [19] I did not speak in secret,\n'
          ]
        }),
        { status: 200 }
      )
    })
    const recordUsage = vi.fn()
    const handle = createEsvProxyHandler({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      rateLimiter: new IpRateLimiter(60_000, 20),
      recordUsage
    })
    const res = await handle(refsReq('Jeremiah 4:23;Psalm 104:30;Isaiah 45:18-19'))
    expect(res.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(recordUsage).toHaveBeenCalledTimes(1)
    expect(recordUsage).toHaveBeenCalledWith('ok')
    const body = await res.json()
    expect(body.passages.map((p: { reference: string }) => p.reference)).toEqual([
      'Jeremiah 4:23',
      'Psalm 104:30',
      'Isaiah 45:18-19'
    ])
    expect(body.passages[1].verses[0]).toEqual({
      verse: 30,
      text: 'When you send forth your Spirit, they are created,',
      notes: [{ offset: 'When you send forth your Spirit,'.length, text: 'Or breath' }]
    })
    expect(body.passages[2].verses.map((v: { verse: number }) => v.verse)).toEqual([18, 19])
  })

  it('rejects a malformed, oversized or over-long reference list with 400 before any upstream call', async () => {
    const fetchImpl = vi.fn()
    const handle = handlerWith(fetchImpl)
    const bad = [
      '',
      'John 1',
      'John 1:1; DROP TABLE',
      'John 1:5-3',
      `${'A'.repeat(41)} 1:1`,
      Array.from({ length: 13 }, (_, i) => `John 1:${i + 1}`).join(';')
    ]
    for (const refs of bad) {
      const res = await handle(refsReq(refs))
      expect(res.status, refs).toBe(400)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts twelve references and a numbered book name', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ passages: ['[1] a'] }), { status: 200 })
    )
    const handle = handlerWith(fetchImpl)
    const twelve = Array.from({ length: 12 }, (_, i) => `1 John 1:${i + 1}`).join(';')
    expect((await handle(refsReq(twelve))).status).toBe(200)
  })

  it('a reference Crossway could not read comes back with no verses, not a failed batch', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ passages: ['[1] a', ''] }), { status: 200 })
    )
    const res = await handlerWith(fetchImpl)(refsReq('John 1:1;Nowhere 9:9'))
    const body = await res.json()
    expect(body.passages[1]).toEqual({ reference: 'Nowhere 9:9', verses: [] })
  })

  it('still serves the book+chapter form unchanged', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(new URL(url).searchParams.get('q')).toBe('John 1')
      return esvSuccessResponse()
    })
    const res = await handlerWith(fetchImpl)(req())
    expect(await res.json()).toEqual({ verses: [{ verse: 1, text: 'In the beginning.' }] })
  })
})
