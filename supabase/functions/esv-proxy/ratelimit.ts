// A coarse, per-IP, fixed-window request cap — the guard that stops a single
// caller draining the whole shared Crossway quota (5,000/day, 1,000/hour,
// 60/minute, enforced per application — docs/proposals/translations-esv-niv.md)
// by itself. See handler.ts: this runs BEFORE the upstream fetch, so an
// over-cap request never reaches api.esv.org.
//
// ─── IN-MEMORY, PER WARM INSTANCE, ON PURPOSE ────────────────────────────────
//
// No new migration, no DB round trip on the hot path, and nothing IP-derived
// is ever persisted anywhere — no table row, no log line, just a Map that
// lives for as long as this function instance is warm — so this needs no
// public/privacy.html change (see index.ts's header for the explicit
// statement). Cold starts reset it, which is fine: a fresh instance has
// served nothing from it yet either. It is not a GLOBAL limit shared across
// every concurrent instance behind the platform's load balancer — an
// accepted trade for staying on the fast path with no external store. See
// docs/BACKLOG.md's "Guest preview mode + ESV proxy protection" entry for
// the reasoning and the session-required-ESV escalation if this ever proves
// insufficient.
//
// ─── THE CAP ITSELF ───────────────────────────────────────────────────────────
//
// Crossway's documented application-wide ceiling is 60 requests/minute.
// RATE_LIMIT_MAX (set in index.ts) is well under that. A real reader moving
// chapter to chapter — even flipping fast — generates a proxy call only on a
// client-cache miss (src/bible/esv-cache.ts caches chapters already read this
// session), so a normal human could not approach this cap; it exists purely
// to stop a script or bot from using this proxy as a way to hammer Crossway.

export interface WindowEntry {
  windowStart: number
  count: number
}

export interface RateLimitDecision {
  allowed: boolean
  entry: WindowEntry
}

// Pure: the whole allow/deny decision as a function of the entry stored for
// this key, the current time, and the window/threshold config — no Map, no
// Date.now() — so every edge (fresh key, mid-window, at the cap, window
// rollover) is trivial to unit test exactly.
export function decideRateLimit(
  entry: WindowEntry | undefined,
  now: number,
  windowMs: number,
  limit: number
): RateLimitDecision {
  if (!entry || now - entry.windowStart >= windowMs) {
    // No entry yet, or the previous window has fully elapsed: start a fresh
    // one-request window rather than carrying the old count forward.
    return { allowed: true, entry: { windowStart: now, count: 1 } }
  }
  if (entry.count >= limit) {
    // Entry deliberately unchanged: a rejected request must not itself
    // extend or inflate the window it already exceeded.
    return { allowed: false, entry }
  }
  return { allowed: true, entry: { windowStart: entry.windowStart, count: entry.count + 1 } }
}

// Stateful wrapper around decideRateLimit — the only place a Map lives.
export class IpRateLimiter {
  private readonly entries = new Map<string, WindowEntry>()
  private callsSinceSweep = 0

  constructor(
    private readonly windowMs: number,
    private readonly limit: number
  ) {}

  allow(key: string, now: number): boolean {
    const decision = decideRateLimit(this.entries.get(key), now, this.windowMs, this.limit)
    this.entries.set(key, decision.entry)
    this.sweepOccasionally(now)
    return decision.allowed
  }

  // Bounds memory on a long-lived warm instance. Not on every call — that
  // would be a full Map scan per request — every 500th call is enough to
  // keep stale keys from accumulating without adding real per-request cost.
  private sweepOccasionally(now: number): void {
    this.callsSinceSweep += 1
    if (this.callsSinceSweep < 500) return
    this.callsSinceSweep = 0
    for (const [key, entry] of this.entries) {
      if (now - entry.windowStart >= this.windowMs * 2) this.entries.delete(key)
    }
  }
}

// x-forwarded-for's leftmost entry is the original client IP; anything after
// it was appended by intermediate proxies. Supabase's edge platform sits in
// front of this function the same way Cloudflare sits in front of hq-
// telemetry's caller, so the header is platform-set, not client-suppliable —
// a client sending its own x-forwarded-for cannot spoof the value this reads.
export function clientIpFrom(forwardedFor: string | null): string {
  if (!forwardedFor) return 'unknown'
  const first = forwardedFor.split(',')[0]?.trim()
  return first || 'unknown'
}

// Non-cryptographic (FNV-1a) on purpose: this key only ever lives in the
// in-memory Map above and is never persisted or logged, so it doesn't need to
// resist a determined adversary — it just needs to avoid a raw IP sitting
// around as a literal string, and to stay synchronous (no crypto.subtle
// await) on the hot path.
export function hashIp(ip: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < ip.length; i++) {
    hash ^= ip.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}
