import { describe, it, expect } from 'vitest'
import {
  isWithinChunkLoadErrorWindow,
  markChunkLoadErrorReported,
  shouldSuppressAsChunkLoadTail,
  CHUNK_ERROR_SUPPRESS_WINDOW_MS
} from './client'

// The de-dup flag behind chunk-load-error suppression. A stale-chunk failure's
// TypeError reaches window.onerror and the error boundary moments after
// vite:preloadError already reported it once under its own label — this
// predicate is what both call sites check before reporting again. See
// globalHandlers.ts and ErrorBoundary.tsx.
describe('isWithinChunkLoadErrorWindow', () => {
  const now = 1_000_000

  it('suppresses when a chunk-load-error was just reported (the tail-of-one-failure case)', () => {
    expect(isWithinChunkLoadErrorWindow(now, now)).toBe(true)
    expect(isWithinChunkLoadErrorWindow(now, now - 1)).toBe(true)
    expect(isWithinChunkLoadErrorWindow(now, now - CHUNK_ERROR_SUPPRESS_WINDOW_MS)).toBe(true)
  })

  it('does NOT suppress once the window has fully elapsed (a later, unrelated failure)', () => {
    expect(isWithinChunkLoadErrorWindow(now, now - CHUNK_ERROR_SUPPRESS_WINDOW_MS - 1)).toBe(false)
  })

  it('does NOT suppress a standalone TypeError with no preceding chunk-load-error', () => {
    expect(isWithinChunkLoadErrorWindow(now, null)).toBe(false)
  })

  it('does NOT suppress against a clock that moved backwards relative to the mark', () => {
    expect(isWithinChunkLoadErrorWindow(now, now + 1)).toBe(false)
  })
})

// The stateful wrapper globalHandlers.ts and ErrorBoundary.tsx actually call:
// mark once when vite:preloadError fires, then both downstream reporters ask
// the flag whether they are witnessing the tail of that same failure. This is
// the "vite:preloadError followed by a TypeError within the window" scenario,
// exercised end to end through the real module state rather than the pure
// predicate alone.
describe('markChunkLoadErrorReported + shouldSuppressAsChunkLoadTail', () => {
  it('suppresses a TypeError that follows a marked chunk-load-error within the window', () => {
    const preloadErrorAt = 2_000_000
    markChunkLoadErrorReported(preloadErrorAt)

    const windowOnerrorAt = preloadErrorAt + 5
    expect(shouldSuppressAsChunkLoadTail(windowOnerrorAt)).toBe(true)
  })

  it('lets a TypeError report normally once the window has elapsed', () => {
    const preloadErrorAt = 2_000_000
    markChunkLoadErrorReported(preloadErrorAt)

    const laterAt = preloadErrorAt + CHUNK_ERROR_SUPPRESS_WINDOW_MS + 1
    expect(shouldSuppressAsChunkLoadTail(laterAt)).toBe(false)
  })
})
