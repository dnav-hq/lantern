// Errors that are safe to report, by construction.
//
// WHY THIS FILE EXISTS
//
// Before telemetry, thrown errors in this app interpolated whatever was useful
// for debugging into the message. That was correct for a console and dangerous
// the moment anything started transmitting. The worst case was real:
//
//   `helloao fetch failed: ${res.status} ${res.statusText} (${usfm} ${chapter})`
//     -> "helloao fetch failed: 404 Not Found (JHN 3)"
//
// "JHN 3" is literally what the person was reading, in a private Bible-study
// journal. Nobody wrote that line carelessly — it predates telemetry by a year.
// That is the whole argument against fixing this by convention: a convention
// cannot reach backwards into code written before it, and a regex blocklist
// fails silently the first time someone writes a message it does not match.
// "JHN 3" is not safely pattern-matchable anyway; neither is "Genesis 1".
//
// THE FIX IS STRUCTURAL, IN THREE LAYERS
//
//  1. A CodedError's `message` IS its stable machine code and nothing else.
//     Any generic handler that reads `.message` — window.onerror, an error
//     boundary, a logging wrapper someone adds next year — gets "BIBLE_FETCH_
//     FAILED" and cannot get anything else, without having to know this file
//     exists.
//
//  2. The human detail lives in a `#private` field. Not a convention: an ES
//     private field is unreachable by every *generic* mechanism a payload
//     builder would plausibly use — `{...err}`, `JSON.stringify(err)`,
//     `Object.keys/entries`, `err['detail']`, structured clone. There is no
//     string you can compute at runtime that reaches it.
//
//  3. The only bridge to the telemetry layer is `toTelemetrySafe()`, which
//     returns a NEW plain object holding exactly three fields. The telemetry
//     payload builder's signature accepts `TelemetrySafeError` and never
//     `Error` or `unknown`, so it does not merely decline to read the detail —
//     it never holds the object the detail is attached to. That is what makes
//     this provable rather than trusted.
//
// Layer 3 is the load-bearing one. Layers 1 and 2 exist so that the guarantee
// still holds on the paths that *don't* go through toTelemetrySafe().
//
// STANDING HAZARD, recorded in TELEMETRY.md and repeated here because this is
// where someone will look: V8 embeds a fragment of its input in JSON.parse
// errors ("Unexpected token 'o', \"{oops}\" is not valid JSON"). A native
// message can therefore leak user content with nobody writing a line of
// interpolation. This app has exactly one JSON.parse, over its own Bible
// bundle, and note content is stored as text via structured clone — clean
// today. Re-check whenever a parse is added over anything a user typed.

/**
 * Stable machine codes. These are the ONLY error strings that ever leave the
 * device, so they must never be interpolated and never contain anything but a
 * fixed identifier. Add a new member rather than reusing one loosely — HQ
 * fingerprints on the code, so a code that means two things merges two bugs
 * into one inbox card.
 */
export type ErrorCode =
  // Scripture read path
  | 'BIBLE_UNKNOWN_BOOK'
  | 'BIBLE_FETCH_FAILED'
  | 'BIBLE_BUNDLE_FETCH_FAILED'
  | 'BIBLE_BUNDLE_CHAPTER_MISSING'
  | 'BIBLE_FIXTURE_CHAPTER_MISSING'
  // ESV (key-proxy) read path — see src/bible/esv.ts
  | 'ESV_NOT_CONFIGURED'
  | 'ESV_FETCH_FAILED'
  // Bible map bundles — see src/utils/mapData.ts
  | 'MAP_BUNDLE_FETCH_FAILED'
  // In-memory stub (dev / no-Supabase fallback)
  | 'NOTE_NOT_FOUND'

/**
 * An error carrying a stable machine `code` for reporting and a human `detail`
 * that stays on the device.
 *
 * `message` is the code, deliberately. If you want the detail in a console,
 * call {@link detailForConsole} — the awkward name is on purpose, so that a
 * call to it reads as obviously wrong anywhere near the telemetry layer.
 */
export class CodedError extends Error {
  readonly code: ErrorCode

  // ES private field. Unreachable from outside this class body by ANY runtime
  // mechanism — see layer 2 above. Do not "helpfully" promote this to a public
  // field or a getter; that single edit undoes the guarantee this file exists
  // to provide.
  #detail: string

  constructor(code: ErrorCode, detail = '') {
    // The code IS the message. Never interpolate the detail in here.
    super(code)
    this.name = 'CodedError'
    this.code = code
    this.#detail = detail
  }

  /**
   * The local-only human detail. Console and developer use ONLY. Never put the
   * result of this into anything that is sent anywhere.
   */
  detailForConsole(): string {
    return this.#detail
  }
}

/**
 * The narrow, content-free shape the telemetry layer is allowed to see.
 *
 * There is deliberately no `message` and no `detail` field. `stack` carries
 * function names and file positions — code identity, not user content — and is
 * symbolicated server-side (see supabase/functions/hq-telemetry).
 */
export interface TelemetrySafeError {
  /** Stable machine code, or 'UNKNOWN_ERROR' for anything not a CodedError. */
  readonly code: string
  /** Constructor name, e.g. 'TypeError'. HQ fingerprints on this. */
  readonly errorClass: string
  /** Raw minified frames. No message line — see below. */
  readonly stack?: string
}

/**
 * The ONE bridge from a thrown value to something reportable.
 *
 * Returns a fresh plain object. The original error — and therefore its
 * `#detail` and its `message` — is not reachable from the result.
 *
 * Two things this deliberately does NOT do:
 *
 *  - It never reads `.message`. For a CodedError the message is only the code,
 *    which we already have; for a foreign error (a Supabase client error, a
 *    DOM exception, a library throw) the message is arbitrary text written by
 *    someone with no knowledge of this rule, and Postgres in particular will
 *    happily echo a submitted value back inside a constraint-violation
 *    message. So foreign errors contribute their CLASS and their STACK and
 *    nothing else, and get the catch-all code.
 *
 *  - It strips the leading message line(s) from `stack`. V8 formats a stack as
 *    "Name: message\n    at ...", so shipping the raw stack would smuggle the
 *    message back in through the field next to the one we just refused to
 *    read. Only lines that look like frames survive.
 */
export function toTelemetrySafe(err: unknown): TelemetrySafeError {
  const isCoded = err instanceof CodedError
  const errorClass = err instanceof Error ? err.constructor.name : typeof err
  return {
    code: isCoded ? err.code : 'UNKNOWN_ERROR',
    errorClass,
    stack: err instanceof Error ? framesOnly(err.stack) : undefined
  }
}

/**
 * Keep only stack frame lines, dropping the "Name: message" header V8 puts on
 * the front (and any continuation lines of a multi-line message).
 *
 * Frames are matched positively — a line must look like a frame to survive —
 * rather than by dropping the first line, because a multi-line message would
 * defeat a drop-the-first-line rule. Positive matching fails closed: an
 * unrecognised line is discarded, so a stack format this does not understand
 * yields fewer frames, never a leaked message.
 */
function framesOnly(stack: string | undefined): string | undefined {
  if (!stack) return undefined
  const frames = stack
    .split('\n')
    // V8/Chrome: "    at fn (file:1:2)". Firefox/Safari: "fn@file:1:2".
    .filter(line => /^\s*at\s/.test(line) || /^[^\s].*@.+:\d+:\d+$/.test(line))
    .map(line => line.trim())
  return frames.length > 0 ? frames.join('\n') : undefined
}
