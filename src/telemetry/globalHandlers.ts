// Global error capture.
//
// The React error boundaries catch render-time throws in their subtree, which
// is most of what breaks a UI — but not all of it. An event handler, a promise
// rejection in a data-fetch, an error thrown from a timer: none of those pass
// through a boundary. Those are exactly the failures nobody anticipated, which
// is the whole reason to have error telemetry rather than a list of known
// problems.
//
// This is only safe to hook up because of the guarantee in src/errors.ts. A
// naive global handler would ship `event.message` straight to a server, and
// `event.message` is arbitrary text from code that never heard of this rule.
// Going through toTelemetrySafe() means the message is never read at all —
// only the class, the stripped frames, and a code.

import { toTelemetrySafe } from '../errors'
import { reportError, markChunkLoadErrorReported, shouldSuppressAsChunkLoadTail } from './client'

let installed = false

// A dynamic import() that fails is most often a STALE-CHUNK failure: a client
// running a cached index.html whose hashed chunk a newer deploy has purged, or
// a chunk that has not finished propagating to this edge yet. public/_redirects
// now 404s a missing /assets/* (rather than letting the SPA catch-all serve it
// back as HTML), so the failure is clean and uncacheable. Vite fires
// `vite:preloadError` for it. The cure is a fresh navigation: public/_headers
// keeps index.html no-cache, so a reload pulls a current shell whose chunks
// exist. We reload rather than retry the same URL because a purged URL stays
// 404 until the client is on a newer shell, which only a reload provides.
const CHUNK_RELOAD_KEY = 'berean.chunk-reload-at'
// Suppress a second reload within this window so a genuinely unrecoverable
// failure surfaces to the error boundary instead of looping forever.
export const CHUNK_RELOAD_COOLDOWN_MS = 10_000

/**
 * Pure decision so the loop-guard is unit-testable without touching `window`.
 * Reload if we have never reloaded for this reason, or the last reload was long
 * enough ago that a fresh failure is a new event rather than a loop.
 */
export function shouldReloadOnChunkError(now: number, lastReloadAt: number | null): boolean {
  return lastReloadAt === null || now - lastReloadAt > CHUNK_RELOAD_COOLDOWN_MS
}

/**
 * Idempotent. Safe to call from a module that may be evaluated twice under HMR.
 */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', event => {
    // `event.error` is the thrown value when there is one. When there isn't
    // (a cross-origin script error, where the browser gives us a bare
    // "Script error." and nothing else), there is genuinely nothing useful and
    // nothing safe to report, so we skip rather than send a placeholder that
    // would fingerprint as one big meaningless bucket in HQ's inbox.
    if (!event.error) return
    // A chunk-load failure's TypeError reaches here too, moments after
    // vite:preloadError already reported it under its own label — see the
    // note below and the de-dup flag in client.ts.
    if (shouldSuppressAsChunkLoadTail(Date.now())) return
    reportError(toTelemetrySafe(event.error), 'window-error')
  })

  window.addEventListener('unhandledrejection', event => {
    if (!event.reason) return
    reportError(toTelemetrySafe(event.reason), 'unhandled-rejection')
  })

  // Dynamic-import (lazy chunk) load failure — see the note above. Reported
  // under its own boundary label so this failure mode is unambiguous in HQ:
  // the previous occurrence arrived as a bare TypeError with a null Safari
  // stack, indistinguishable from any other TypeError. Content-free, same as
  // every other report — only the class and stripped frames leave the browser.
  window.addEventListener('vite:preloadError', (event: Event) => {
    // Mark this first: the resulting TypeError reaches window.onerror and,
    // if it escapes render, the error boundary within the same tick or two —
    // both must see the flag before they decide whether to report.
    markChunkLoadErrorReported(Date.now())

    const payload = (event as Event & { payload?: unknown }).payload
    if (payload) reportError(toTelemetrySafe(payload), 'chunk-load-error')

    let lastReloadAt: number | null = null
    try {
      const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY)
      lastReloadAt = raw ? Number(raw) : null
    } catch {
      // Storage blocked (some in-app webviews): with no way to remember that we
      // already reloaded, auto-reloading risks an infinite loop. Let the error
      // boundary show its recoverable "reload" UI instead.
      return
    }

    if (shouldReloadOnChunkError(Date.now(), lastReloadAt)) {
      try {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
      } catch {
        // ignore — best effort
      }
      // Deliberately do NOT event.preventDefault(): preventing Vite's throw
      // makes __vitePreload resolve to `undefined`, and React.lazy then reads
      // `.default` of undefined and throws a second, more confusing TypeError
      // before the navigation completes. Letting it throw is harmless — the
      // reload below aborts rendering — and it keeps the boundary as the clean
      // fallback on the no-reload branch.
      window.location.reload()
    }
    // else: we reloaded moments ago and it still failed — a genuine problem, so
    // let it reach the error boundary rather than reload again.
  })
}
