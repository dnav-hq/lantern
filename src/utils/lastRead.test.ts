import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readLastRead, writeLastRead } from './lastRead'

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    }
  } as Storage
}

describe('lastRead', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is null with no history', () => {
    expect(readLastRead()).toBeNull()
  })

  it('round-trips a position with a timestamp', () => {
    writeLastRead(43, 3)
    const r = readLastRead()
    expect(r?.bookNumber).toBe(43)
    expect(r?.chapter).toBe(3)
    expect(typeof r?.at).toBe('string')
    expect(Number.isNaN(Date.parse(r!.at))).toBe(false)
  })

  it('overwrites the previous position', () => {
    writeLastRead(1, 1)
    writeLastRead(19, 23)
    expect(readLastRead()).toMatchObject({ bookNumber: 19, chapter: 23 })
  })

  it('ignores corrupt or out-of-range stored values', () => {
    localStorage.setItem('berean.last-read', 'not json')
    expect(readLastRead()).toBeNull()
    localStorage.setItem('berean.last-read', JSON.stringify({ bookNumber: 99, chapter: 1 }))
    expect(readLastRead()).toBeNull()
    localStorage.setItem('berean.last-read', JSON.stringify({ bookNumber: '1', chapter: 1 }))
    expect(readLastRead()).toBeNull()
  })

  it('never throws when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      }
    })
    expect(() => writeLastRead(1, 1)).not.toThrow()
    expect(readLastRead()).toBeNull()
  })
})
