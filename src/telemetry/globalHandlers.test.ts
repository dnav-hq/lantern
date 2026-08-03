import { describe, it, expect } from 'vitest'
import { shouldReloadOnChunkError, CHUNK_RELOAD_COOLDOWN_MS } from './globalHandlers'

// The loop-guard behind the vite:preloadError auto-reload. A stale-chunk failure
// should trigger exactly one recovery reload; a failure that persists past the
// reload must NOT reload again (or the app would loop forever instead of showing
// its recoverable error boundary).
describe('shouldReloadOnChunkError', () => {
  const now = 1_000_000

  it('reloads when there is no record of a prior reload', () => {
    expect(shouldReloadOnChunkError(now, null)).toBe(true)
  })

  it('does NOT reload when the last reload was within the cooldown (the loop case)', () => {
    expect(shouldReloadOnChunkError(now, now - 1)).toBe(false)
    expect(shouldReloadOnChunkError(now, now - CHUNK_RELOAD_COOLDOWN_MS)).toBe(false)
  })

  it('reloads again once the cooldown has fully elapsed (a genuinely new event)', () => {
    expect(shouldReloadOnChunkError(now, now - CHUNK_RELOAD_COOLDOWN_MS - 1)).toBe(true)
  })
})
