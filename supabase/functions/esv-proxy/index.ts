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
// before this code runs.
//
// ─── CORS ─────────────────────────────────────────────────────────────────────
//
// Unlike hq-telemetry (server-to-server, called only by HQ), this is called
// directly from the browser at a different origin than the Supabase project,
// so it has to answer CORS preflight itself — nothing in front of it does.

const ESV_API_KEY = Deno.env.get('ESV_API_KEY') ?? ''
const ESV_API_BASE = 'https://api.esv.org/v3/passage_text/'

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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // Fail closed: an unset key must never mean "proxy through anyway" — see
  // the header. This is checked before parsing input so a missing secret
  // never depends on the request being well-formed.
  if (!ESV_API_KEY) {
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
    upstream = await fetch(`${ESV_API_BASE}?${query.toString()}`, {
      headers: { Authorization: `Token ${ESV_API_KEY}` }
    })
  } catch {
    return json({ error: 'upstream_unreachable' }, 502)
  }

  if (upstream.status === 429) {
    // Shared per-application quota (5,000/day, 1,000/hr, 60/min) — pass the
    // 429 straight through rather than retrying. See src/bible/esv.ts: the
    // client treats this as a one-shot failure, never a retry trigger.
    return json({ error: 'quota_exceeded' }, 429)
  }
  if (!upstream.ok) {
    return json({ error: 'upstream_failed' }, 502)
  }

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
})
