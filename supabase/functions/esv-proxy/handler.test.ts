import { describe, it, expect, vi } from 'vitest'
import { createEsvProxyHandler } from './handler'
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
