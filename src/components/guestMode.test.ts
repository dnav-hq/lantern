import { describe, it, expect } from 'vitest'
import {
  GUEST_FLAG_KEY,
  enterGuestMode,
  exitGuestMode,
  isGuestMode,
  type GuestFlagStore
} from './guestMode'
import { GUEST_TRANSLATIONS, toGuestTranslation } from '../utils/useTranslation'

function fakeStore(initial: Record<string, string> = {}): GuestFlagStore & {
  data: Record<string, string>
} {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v
    },
    removeItem: (k: string) => {
      delete data[k]
    }
  }
}

// A store that throws on every access — the private-mode / hardened-profile
// case. Guest mode must degrade to "not remembered", never crash the app.
const hostileStore: GuestFlagStore = {
  getItem: () => {
    throw new Error('denied')
  },
  setItem: () => {
    throw new Error('denied')
  },
  removeItem: () => {
    throw new Error('denied')
  }
}

describe('guest mode flag', () => {
  it('is off by default', () => {
    expect(isGuestMode(fakeStore())).toBe(false)
  })

  it('round-trips entering and leaving', () => {
    const store = fakeStore()
    enterGuestMode(store)
    expect(store.data[GUEST_FLAG_KEY]).toBe('1')
    expect(isGuestMode(store)).toBe(true)
    exitGuestMode(store)
    expect(GUEST_FLAG_KEY in store.data).toBe(false)
    expect(isGuestMode(store)).toBe(false)
  })

  it('treats any other stored value as not-guest', () => {
    expect(isGuestMode(fakeStore({ [GUEST_FLAG_KEY]: '0' }))).toBe(false)
    expect(isGuestMode(fakeStore({ [GUEST_FLAG_KEY]: 'true' }))).toBe(false)
  })

  it('never throws when storage is unavailable', () => {
    expect(isGuestMode(null)).toBe(false)
    expect(() => enterGuestMode(null)).not.toThrow()
    expect(() => exitGuestMode(null)).not.toThrow()
    expect(isGuestMode(hostileStore)).toBe(false)
    expect(() => enterGuestMode(hostileStore)).not.toThrow()
    expect(() => exitGuestMode(hostileStore)).not.toThrow()
  })
})

describe('guest translations', () => {
  it('offers the free self-hostable translations — never ESV', () => {
    expect(GUEST_TRANSLATIONS.map(t => t.id)).toEqual(['BSB', 'KJV', 'NET'])
  })

  it('coerces a stored ESV preference to BSB for a guest', () => {
    expect(toGuestTranslation('ESV')).toBe('BSB')
    expect(toGuestTranslation('BSB')).toBe('BSB')
    expect(toGuestTranslation('KJV')).toBe('KJV')
  })
})
