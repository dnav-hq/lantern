// The client send path for the HQ telemetry contract.
// See D:/Projects/hq/TELEMETRY.md and src/errors.ts.
//
// ─── THE ONE RULE ────────────────────────────────────────────────────────────
//
// The payload builder accepts `TelemetrySafeError` and NEVER `Error` or
// `unknown`. That is not a style choice, it is the guarantee: a thrown error's
// human detail lives in an ES #private field, and the only bridge across is
// `toTelemetrySafe()`, which returns a fresh plain object of exactly
// {code, errorClass, stack}. So this module does not merely decline to read the
// detail — it never holds the object the detail is attached to. If you find
// yourself widening a signature here to take an `Error`, stop: that edit is the
// whole vulnerability, restored in one line.
//
// ─── IT DEGRADES TO NOTHING ──────────────────────────────────────────────────
//
// Every path here is fire-and-forget. Nothing awaits, nothing throws, nothing
// is user-visible, and nothing changes app behaviour. If Supabase is absent, if
// the request fails, if the buffer's guard trigger silently drops the row, if
// HQ never calls the endpoint at all — the app behaves exactly as it does
// today. HQ's ingest side is not built yet, so "never called" is in fact the
// expected state for now, and that must remain a non-event.
//
// ─── NO USER IDENTITY ON THE WIRE ────────────────────────────────────────────
//
// This deliberately posts with the ANON key rather than the signed-in user's
// JWT, even when there is a session. Supabase's client would attach the user's
// access token automatically, which would put a user identity on every
// telemetry request and let the row be correlated to a person server-side. The
// RLS policy allows anon inserts precisely so it doesn't have to be. The only
// identifier that travels is `install_id`, which is random and unrelated to
// auth (see install.ts).

import type { TelemetrySafeError } from '../errors'
import { getInstallId } from './install'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Injected at build time from the deploy's commit (see vite.config.ts). The
// single highest-value field in the payload: it is what lets HQ correlate an
// error spike with the deploy that caused it. Empty in dev.
const COMMIT_SHA = import.meta.env.VITE_COMMIT_SHA ?? ''

/**
 * Event kinds. NOT only 'error' — scripture-fallback serves and draft
 * recoveries are client-side occurrences no SQL query can produce, so they ride
 * this channel and get aggregated into scalars 6 and 7. Must match the CHECK
 * constraint in supabase/migrations/0004_telemetry_buffer.sql.
 */
export type TelemetryKind = 'error' | 'scripture_fallback_serve' | 'draft_recovery'

const enabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

// ─── User opt-out ────────────────────────────────────────────────────────────

const OPTOUT_KEY = 'berean.telemetry-optout'

/**
 * Explicit opt-OUT, not opt-in: absence of the key means telemetry is ON,
 * matching the published privacy page's description of the default. Only the
 * string '1' counts as opted out, so an unexpected stored value fails open to
 * "still sending" rather than silently going dark.
 */
export function isTelemetryOptedOut(): boolean {
  try {
    return localStorage.getItem(OPTOUT_KEY) === '1'
  } catch {
    return false
  }
}

export function setTelemetryOptedOut(optedOut: boolean): void {
  try {
    if (optedOut) {
      localStorage.setItem(OPTOUT_KEY, '1')
    } else {
      localStorage.removeItem(OPTOUT_KEY)
    }
  } catch {
    // Storage unavailable — same fate as a missing install id: telemetry
    // already no-ops without one, so failing open here changes nothing.
  }
}

// ─── Coarse environment ──────────────────────────────────────────────────────

/**
 * Browser family only. Deliberately not the full user-agent string, which is a
 * high-entropy fingerprinting surface and tells us nothing more useful than
 * this for the question "is this bug browser-specific".
 */
function browserFamily(): string {
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return 'edge'
  if (/OPR\//.test(ua)) return 'opera'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Chrome\//.test(ua)) return 'chrome'
  if (/Safari\//.test(ua)) return 'safari'
  return 'other'
}

/** A bucket, not a pixel measurement — again, resolution is fingerprinting. */
function viewportBucket(): string {
  const w = window.innerWidth
  if (w < 768) return 'narrow'
  if (w < 1200) return 'medium'
  return 'wide'
}

// ─── The send path ───────────────────────────────────────────────────────────

interface EventRow {
  occurred_at: string
  install_id: string
  kind: TelemetryKind
  code: string
  error_class?: string
  stack?: string
  boundary?: string
  commit_sha?: string
  env: { browser: string; viewport: string; online: boolean }
}

function post(row: EventRow): void {
  // `keepalive` so an event recorded during teardown (an error on the way to a
  // reload, say) still leaves the tab. Failures are swallowed on purpose —
  // there is no retry logic by design, per the contract: a failed write is
  // itself a health signal on HQ's side and inventing retries here would turn a
  // blip into a self-inflicted flood.
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/telemetry_events`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY as string,
        // Anon key, NOT the user's session token. See the header note.
        Authorization: `Bearer ${SUPABASE_ANON_KEY as string}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row)
    }).catch(() => {})
  } catch {
    // Never let telemetry break the thing it is observing.
  }
}

function send(
  kind: TelemetryKind,
  code: string,
  extra: { errorClass?: string; stack?: string; boundary?: string } = {}
): void {
  if (!enabled) return
  if (isTelemetryOptedOut()) return
  const installId = getInstallId()
  if (!installId) return

  post({
    occurred_at: new Date().toISOString(),
    install_id: installId,
    kind,
    code,
    error_class: extra.errorClass,
    stack: extra.stack,
    boundary: extra.boundary,
    commit_sha: COMMIT_SHA || undefined,
    env: {
      browser: browserFamily(),
      viewport: viewportBucket(),
      online: navigator.onLine
    }
  })
}

/**
 * Report an error.
 *
 * Takes a `TelemetrySafeError` — the narrow, content-free shape — and not an
 * `Error`. Call `toTelemetrySafe(err)` at the catch site. See the header.
 *
 * `boundary` is a short fixed string naming where it was caught ('app-boundary',
 * 'pane-boundary', 'window-onerror'). HQ fingerprints on it, so it must be a
 * literal, never interpolated from anything.
 */
export function reportError(safe: TelemetrySafeError, boundary: string): void {
  send('error', safe.code, {
    errorClass: safe.errorClass,
    stack: safe.stack,
    boundary
  })
}

/**
 * Record a non-error occurrence — the client-side counters behind scalars 6 and
 * 7. `code` is a fixed literal describing what happened, never interpolated.
 */
export function reportOccurrence(kind: Exclude<TelemetryKind, 'error'>, code: string): void {
  send(kind, code)
}

// ─── Chunk-load-error de-dup ─────────────────────────────────────────────────
//
// A stale-chunk failure (see globalHandlers.ts) is ONE underlying event, but it
// can be witnessed up to three times: the vite:preloadError itself, the
// TypeError that also reaches window.onerror, and — if it escapes render — the
// error boundary. Reporting all three turns one harmless, self-healing deploy
// blip into three separate mystery crashes in HQ's inbox. A short-lived shared
// flag lets the window handler and the error boundary each recognize "this is
// the tail of a chunk failure already reported under its own label" and skip,
// without the two coordinating on anything but this timestamp.

export const CHUNK_ERROR_SUPPRESS_WINDOW_MS = 2_000

let lastChunkLoadErrorAt: number | null = null

/** Call once, right after the chunk-load-error itself is reported. */
export function markChunkLoadErrorReported(now: number): void {
  lastChunkLoadErrorAt = now
}

/** Pure so the window logic is unit-testable without touching module state. */
export function isWithinChunkLoadErrorWindow(now: number, lastReportedAt: number | null): boolean {
  if (lastReportedAt === null) return false
  const elapsed = now - lastReportedAt
  return elapsed >= 0 && elapsed <= CHUNK_ERROR_SUPPRESS_WINDOW_MS
}

/** Convenience wrapper over the module-level flag, for call sites. */
export function shouldSuppressAsChunkLoadTail(now: number): boolean {
  return isWithinChunkLoadErrorWindow(now, lastChunkLoadErrorAt)
}
