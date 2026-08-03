// GET /functions/v1/esv-proxy?book=<English book name>&chapter=<n>
//
// Proxies a single chapter of the ESV to api.esv.org, so the ESV_API_KEY
// secret never ships in client code — Crossway's terms say the key "may not
// be sold, shared, or published" (docs/proposals/translations-esv-niv.md
// section 1), which rules out a client-side fetch to api.esv.org entirely.
// This mirrors supabase/functions/hq-telemetry's pattern for keeping a secret
// server-side: read it via Deno.env.get, fail closed when it's unset.
//
// ─── THIS FUNCTION IS INERT UNTIL THE SECRET IS SET ──────────────────────────
//
// With no ESV_API_KEY configured, every request gets the 503 "not_configured"
// response below and the client shows a friendly degrade (src/bible/esv.ts).
// That is the expected state until Dennis runs:
//
//   supabase secrets set ESV_API_KEY=<key from api.esv.org/account/>
//
// ─── DEPLOY ───────────────────────────────────────────────────────────────────
//
//   supabase functions deploy esv-proxy --no-verify-jwt
//
// --no-verify-jwt is required for the same reason hq-telemetry needs it: the
// browser calls this with the anon key, not a user's Supabase JWT, so the
// platform's default gateway check would reject every request with a 401
// before this code runs. This is a JWT check, NOT a caller-abuse check — the
// rate limit below is what stands in for the latter, and redeploying without
// --no-verify-jwt would still break every legitimate call regardless of the
// rate limit's own state.
//
// ─── CORS ─────────────────────────────────────────────────────────────────────
//
// Unlike hq-telemetry (server-to-server, called only by HQ), this is called
// directly from the browser at a different origin than the Supabase project,
// so it has to answer CORS preflight itself — nothing in front of it does.
//
// ─── RATE LIMITING ────────────────────────────────────────────────────────────
//
// A coarse per-IP cap runs BEFORE any of the above, in handler.ts, backed by
// ratelimit.ts's in-memory IpRateLimiter — see that file for the threshold,
// the reasoning, and why nothing IP-derived is ever persisted (so this needs
// no public/privacy.html update; stated here explicitly per the task's own
// acceptance criteria, since no IP-derived value is stored in any table or
// log — it only ever lives in this instance's process memory).
//
// ─── USAGE METERING ───────────────────────────────────────────────────────────
//
// Every real call to Crossway below is metered into public.esv_api_usage (see
// supabase/migrations/0008_esv_usage.sql), so how much of the shared 5,000/day
// + 1,000/hour + 60/minute quota is actually being consumed can be seen before
// making ESV the default. Checked api.esv.org's docs for a rate-limit response
// header first (an X-RateLimit-* style header would be the authoritative
// source) — none is documented, so this falls back to counting queries here.
// Only a timestamp and a coarse ok/quota/error status are ever stored: no
// passage, book, chapter, user, or install. Client cache hits never reach this
// function at all, so they can't be counted here by construction — this only
// ever meters a real upstream call, which is exactly what the quota meters. A
// request this function rejects for being over the rate limit is, for the
// same reason, never metered as 'ok' — see handler.ts.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createEsvProxyHandler } from './handler.ts'
import { IpRateLimiter } from './ratelimit.ts'

const ESV_API_KEY = Deno.env.get('ESV_API_KEY') ?? ''

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Fire-and-forget: recording usage must NEVER slow, block, or fail a chapter
// fetch. This is never awaited on the response path — it only swallows its
// own errors. EdgeRuntime.waitUntil (a Deno Deploy / Supabase Edge Functions
// global, no bundled types — hence the guard) lets the write finish after the
// response has already gone out instead of racing the isolate tearing down;
// without it this is still best-effort, just with worse odds of completing.
function recordEsvUsage(status: 'ok' | 'quota' | 'error'): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return

  const write = (async () => {
    try {
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      })
      await db.from('esv_api_usage').insert({ status })
    } catch {
      // Swallowed on purpose — see the header above.
    }
  })()

  // @ts-expect-error EdgeRuntime has no bundled type declarations here.
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(write)
}

// Well under Crossway's documented 60 requests/minute application-wide
// ceiling — see ratelimit.ts's header for why a normal reader can't approach
// this, and 20 minutes (2 * windowMs) is the sweep's stale-entry cutoff.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20

const handleRequest = createEsvProxyHandler({
  apiKey: ESV_API_KEY,
  fetchImpl: fetch,
  rateLimiter: new IpRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX),
  recordUsage: recordEsvUsage
})

Deno.serve(handleRequest)
