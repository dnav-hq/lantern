import { describe, it, expect, afterEach } from 'vitest'
import { uuid } from './uuid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const realCrypto = globalThis.crypto

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true })
})

describe('uuid', () => {
  it('returns a valid RFC 4122 v4 string', () => {
    expect(uuid()).toMatch(V4)
  })

  it('is unique across many calls', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => uuid()))
    expect(seen.size).toBe(1000)
  })

  it('falls back to getRandomValues when randomUUID is missing (insecure context)', () => {
    // Simulate a plain-http LAN-IP dev server: getRandomValues exists, but the
    // secure-context-only randomUUID does not.
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) },
      configurable: true
    })
    const id = uuid()
    expect(id).toMatch(V4)
    expect(id).not.toBe(uuid())
  })

  it('still produces a valid v4 with no Web Crypto at all', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    expect(uuid()).toMatch(V4)
  })
})
