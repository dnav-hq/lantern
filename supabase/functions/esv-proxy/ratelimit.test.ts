import { describe, it, expect } from 'vitest'
import { decideRateLimit, IpRateLimiter, clientIpFrom, hashIp } from './ratelimit'

describe('decideRateLimit', () => {
  it('allows the first request for a key and starts a one-request window', () => {
    const decision = decideRateLimit(undefined, 1000, 60_000, 5)
    expect(decision.allowed).toBe(true)
    expect(decision.entry).toEqual({ windowStart: 1000, count: 1 })
  })

  it('allows and increments while under the cap', () => {
    const entry = { windowStart: 1000, count: 3 }
    const decision = decideRateLimit(entry, 1500, 60_000, 5)
    expect(decision.allowed).toBe(true)
    expect(decision.entry).toEqual({ windowStart: 1000, count: 4 })
  })

  it('denies once the count reaches the limit, leaving the entry unchanged', () => {
    const entry = { windowStart: 1000, count: 5 }
    const decision = decideRateLimit(entry, 1500, 60_000, 5)
    expect(decision.allowed).toBe(false)
    expect(decision.entry).toBe(entry)
  })

  it('resets to a fresh window once windowMs has elapsed', () => {
    const entry = { windowStart: 1000, count: 5 } // at the cap
    const decision = decideRateLimit(entry, 1000 + 60_000, 60_000, 5)
    expect(decision.allowed).toBe(true)
    expect(decision.entry).toEqual({ windowStart: 61_000, count: 1 })
  })

  it('does not reset a moment before the window elapses', () => {
    const entry = { windowStart: 1000, count: 5 }
    const decision = decideRateLimit(entry, 1000 + 59_999, 60_000, 5)
    expect(decision.allowed).toBe(false)
  })
})

describe('IpRateLimiter', () => {
  it('allows up to the limit then denies within the same window', () => {
    const limiter = new IpRateLimiter(60_000, 3)
    expect(limiter.allow('a', 0)).toBe(true)
    expect(limiter.allow('a', 10)).toBe(true)
    expect(limiter.allow('a', 20)).toBe(true)
    expect(limiter.allow('a', 30)).toBe(false)
    expect(limiter.allow('a', 40)).toBe(false)
  })

  it('tracks each key independently', () => {
    const limiter = new IpRateLimiter(60_000, 1)
    expect(limiter.allow('a', 0)).toBe(true)
    expect(limiter.allow('b', 0)).toBe(true)
    expect(limiter.allow('a', 0)).toBe(false)
    expect(limiter.allow('b', 0)).toBe(false)
  })

  it('allows again once the window resets', () => {
    const limiter = new IpRateLimiter(60_000, 2)
    expect(limiter.allow('a', 0)).toBe(true)
    expect(limiter.allow('a', 100)).toBe(true)
    expect(limiter.allow('a', 200)).toBe(false)
    expect(limiter.allow('a', 60_000)).toBe(true) // fresh window
  })
})

describe('clientIpFrom', () => {
  it('returns the leftmost address in a multi-hop header', () => {
    expect(clientIpFrom('203.0.113.5, 10.0.0.1')).toBe('203.0.113.5')
  })

  it('trims whitespace', () => {
    expect(clientIpFrom('  203.0.113.5  ')).toBe('203.0.113.5')
  })

  it('falls back to "unknown" when the header is absent', () => {
    expect(clientIpFrom(null)).toBe('unknown')
  })

  it('falls back to "unknown" when the header is empty', () => {
    expect(clientIpFrom('')).toBe('unknown')
  })
})

describe('hashIp', () => {
  it('is deterministic for the same input', () => {
    expect(hashIp('203.0.113.5')).toBe(hashIp('203.0.113.5'))
  })

  it('differs for different inputs', () => {
    expect(hashIp('203.0.113.5')).not.toBe(hashIp('203.0.113.6'))
  })

  it('never returns the raw input', () => {
    expect(hashIp('203.0.113.5')).not.toBe('203.0.113.5')
  })
})
