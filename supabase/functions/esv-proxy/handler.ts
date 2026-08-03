// The whole esv-proxy request flow, factored out of index.ts so it is
// testable under Node/vitest without any Deno-specific import — same split
// as supabase/functions/hq-telemetry/symbolicate.ts. Every effect (the
// upstream fetch, usage metering, the rate limiter, the clock) is injected,
// so a test can assert e.g. "over the cap: 429, and the upstream fetch is
// never called" without a live deploy. index.ts wires this up with the real
// Deno fetch, a real IpRateLimiter and the real Supabase-backed recordUsage.

import type { IpRateLimiter } from './ratelimit.ts'
import { clientIpFrom, hashIp } from './ratelimit.ts'

export type EsvUsageStatus = 'ok' | 'quota' | 'error'

export interface EsvProxyDeps {
  apiKey: string
  apiBase?: string
  fetchImpl: typeof fetch
  rateLimiter: IpRateLimiter
  recordUsage: (status: EsvUsageStatus) => void
  now?: () => number
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  })
}

// ESV's plain-text passage response embeds verse numbers as "[16]" markers,
// one immediately before each verse's text, with headings/whitespace/poetic
// indentation around them. This splits on those markers rather than trying to
// use ESV's `passage_meta` (which gives chapter-level, not per-verse, ranges).
function parseEsvText(raw: string): { verse: number; text: string }[] {
  const parts = raw.split(/\[(\d+)\]/)
  const verses: { verse: number; text: string }[] = []
  // parts[0] is anything before the first verse marker (headings) — discard.
  for (let i = 1; i < parts.length; i += 2) {
    const verse = parseInt(parts[i], 10)
    const text = (parts[i + 1] ?? '').replace(/\s+/g, ' ').trim()
    if (Number.isFinite(verse) && text) verses.push({ verse, text })
  }
  return verses
}

export function createEsvProxyHandler(deps: EsvProxyDeps): (req: Request) => Promise<Response> {
  const apiBase = deps.apiBase ?? 'https://api.esv.org/v3/passage/text/'
  const now = deps.now ?? (() => Date.now())

  return async function handleEsvProxyRequest(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }
    if (req.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, 405)
    }

    // Rate limit FIRST — before the config check, before parsing input,
    // before any upstream call. See ratelimit.ts for what this protects and
    // why it's safe to key on a hash of the caller's IP.
    const ip = clientIpFrom(req.headers.get('x-forwarded-for'))
    if (!deps.rateLimiter.allow(hashIp(ip), now())) {
      // Not metered into esv_api_usage: this request never reached Crossway,
      // so counting it as 'ok' would inflate the quota-consumption scalars
      // (esv_api_queries_24h/_1h) past what was actually spent — see 0008.
      return json({ error: 'rate_limited' }, 429)
    }

    // Fail closed: an unset key must never mean "proxy through anyway".
    if (!deps.apiKey) {
      return json({ error: 'not_configured' }, 503)
    }

    const url = new URL(req.url)
    const book = url.searchParams.get('book')?.trim()
    const chapter = url.searchParams.get('chapter')?.trim()
    if (!book || !chapter || !/^\d+$/.test(chapter)) {
      return json({ error: 'invalid_request' }, 400)
    }

    const reference = `${book} ${chapter}`
    const query = new URLSearchParams({
      q: reference,
      'include-headings': 'false',
      'include-footnotes': 'false',
      'include-footnote-body': 'false',
      'include-short-copyright': 'false',
      'include-passage-references': 'false',
      'include-verse-numbers': 'true'
    })

    let upstream: Response
    try {
      upstream = await deps.fetchImpl(`${apiBase}?${query.toString()}`, {
        headers: { Authorization: `Token ${deps.apiKey}` }
      })
    } catch {
      // Reached this catch WITHOUT a response, so it's unclear whether
      // Crossway ever saw the request — metered as 'error' rather than
      // skipped, since an attempted call is the thing worth seeing, not
      // just the successful ones.
      deps.recordUsage('error')
      return json({ error: 'upstream_unreachable' }, 502)
    }

    if (upstream.status === 429) {
      // Crossway's OWN shared per-application quota (5,000/day, 1,000/hr,
      // 60/min) — pass the 429 straight through rather than retrying. Still
      // metered: Crossway counted this request against the quota same as
      // any other, it just didn't like it. Distinct from our own rate-limit
      // 429 above, which never reaches this line.
      deps.recordUsage('quota')
      return json({ error: 'quota_exceeded' }, 429)
    }
    if (!upstream.ok) {
      deps.recordUsage('error')
      return json({ error: 'upstream_failed' }, 502)
    }

    // A real, successful upstream call — this is what consumes the shared
    // quota, metered here regardless of whether parsing the body below
    // succeeds.
    deps.recordUsage('ok')

    let data: { passages?: string[] }
    try {
      data = await upstream.json()
    } catch {
      return json({ error: 'upstream_bad_json' }, 502)
    }

    const passage = data.passages?.[0]
    if (!passage) {
      return json({ error: 'not_found' }, 404)
    }

    const verses = parseEsvText(passage)
    if (verses.length === 0) {
      return json({ error: 'not_found' }, 404)
    }

    return json({ verses })
  }
}
