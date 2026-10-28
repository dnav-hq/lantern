// The whole esv-proxy request flow, factored out of index.ts so it is
// testable under Node/vitest without any Deno-specific import — same split
// as supabase/functions/hq-telemetry/symbolicate.ts. Every effect (the
// upstream fetch, usage metering, the rate limiter, the clock) is injected,
// so a test can assert e.g. "over the cap: 429, and the upstream fetch is
// never called" without a live deploy. index.ts wires this up with the real
// Deno fetch, a real IpRateLimiter and the real Supabase-backed recordUsage.
//
// Two request forms, one upstream call each:
//
//   ?book=John&chapter=1                       -> { verses: [...] }
//   ?refs=Jeremiah 4:23;Psalm 104:30;...       -> { passages: [{ reference, verses }] }
//
// The second exists for the connections sheet, which reads up to nine short
// passages at once: Crossway's text endpoint takes several references in one
// `q` (semicolon-separated) and answers with `passages` in the same order, so
// nine ranges cost ONE metered call instead of nine chapter fetches.
//
// Each verse is `{ verse, text, notes? }`. `notes` carries the ESV's own
// translators' footnotes for that verse, anchored by character offset into
// `text` — the same shape src/bible/provider.ts's VerseNote has, so the client
// passes them straight through. Absent (not empty) on a verse without any.

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

export interface EsvVerseNote {
  // Index into `text` where the footnote's caller sat, i.e. the end of the
  // word (or clause) the translators flagged. Mirrors VerseNote.offset.
  offset: number
  // The footnote body, verbatim from Crossway, with its "(n) c:v" lead removed.
  text: string
}

export interface EsvVerse {
  verse: number
  text: string
  notes?: EsvVerseNote[]
}

export interface EsvPassage {
  reference: string
  verses: EsvVerse[]
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
}

// The multi-reference form's limits. Twelve is comfortably above the nine the
// connections sheet needs and well under anything that would make one upstream
// call expensive; the reference grammar is deliberately narrow (a book name of
// letters, digits and spaces, then chapter:verse[-verse]) so nothing but a
// verse range can be relayed to Crossway under this application's key.
export const MAX_REFS = 12
const REF_PATTERN = /^([A-Za-z0-9 ]{1,40}) (\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/

export function parseRefsParam(refs: string): string[] | null {
  const parts = refs
    .split(';')
    .map(r => r.trim().replace(/\s+/g, ' '))
    .filter(r => r.length > 0)
  if (parts.length === 0 || parts.length > MAX_REFS) return null
  for (const part of parts) {
    const m = REF_PATTERN.exec(part)
    if (!m) return null
    if (m[4] !== undefined && parseInt(m[4], 10) < parseInt(m[3], 10)) return null
  }
  return parts
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  })
}

// With include-footnote-body=true the plain-text passage ends in a block:
//
//   Footnotes
//
//   (1) 1:3 Or was not anything made. That which has been made was life in him
//   (2) 1:5 Or understood
//
// one footnote per line, led by its caller number and the chapter:verse it
// belongs to. The heading sits on its own line after a blank line. Crossway's
// docs (api.esv.org/docs/passage-text/) describe the block but print no sample
// of it, so this is parsed defensively: a passage without the block parses
// exactly as before, and a continuation line (no "(n)" lead) is folded into
// the note above it rather than dropped.
const FOOTNOTES_HEADING = /\n[ \t]*Footnotes[ \t]*\n/
const FOOTNOTE_LINE = /^\((\d+)\)\s+(?:\d+:\d+\s+)?(.*)$/

export function splitFootnotes(raw: string): { body: string; footnotes: Map<number, string> } {
  const footnotes = new Map<number, string>()
  const at = raw.search(FOOTNOTES_HEADING)
  if (at === -1) return { body: raw, footnotes }
  const body = raw.slice(0, at)
  const block = raw.slice(at).replace(FOOTNOTES_HEADING, '')
  let last: number | null = null
  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = FOOTNOTE_LINE.exec(trimmed)
    if (m) {
      last = parseInt(m[1], 10)
      footnotes.set(last, m[2].trim())
    } else if (last !== null) {
      footnotes.set(last, `${footnotes.get(last) ?? ''} ${trimmed}`.trim())
    }
  }
  return { body, footnotes }
}

// Inside the verse text a footnote caller is the same "(n)" number, placed
// right after the word it belongs to ("made.(1) In him was life"). Only a
// caller whose number the Footnotes block defines is treated as one, so a
// genuine parenthesised numeral in scripture is never eaten. The caller is cut
// out, any space immediately before it is closed up, and the index where it
// sat in the CLEANED text is the note's offset — the end of the anchored word.
const CALLER = /\((\d+)\)/g

export function stripCallers(
  text: string,
  footnotes: Map<number, string>
): { text: string; notes: EsvVerseNote[] } {
  const raw = text.replace(/\s+/g, ' ').trim()
  const notes: EsvVerseNote[] = []
  if (footnotes.size === 0) return { text: raw, notes }
  let cleaned = ''
  let last = 0
  for (const m of raw.matchAll(CALLER)) {
    const n = parseInt(m[1], 10)
    const body = footnotes.get(n)
    if (body === undefined) continue
    cleaned += raw.slice(last, m.index)
    last = (m.index ?? 0) + m[0].length
    // "word (1) next" -> "word next": the space before the caller goes, the
    // one after it stays as the separator; "word(1), next" needs nothing.
    cleaned = cleaned.replace(/ +$/, '')
    notes.push({ offset: cleaned.length, text: body })
  }
  cleaned += raw.slice(last)
  const final = cleaned.replace(/\s+/g, ' ').trim()
  // Trimming cannot move anything the notes point at except a verse-final
  // caller's trailing space; clamp so offset never exceeds the text.
  for (const note of notes) note.offset = Math.min(note.offset, final.length)
  return { text: final, notes }
}

// ESV's plain-text passage response embeds verse numbers as "[16]" markers,
// one immediately before each verse's text, with headings/whitespace/poetic
// indentation around them. This splits on those markers rather than trying to
// use ESV's `passage_meta` (which gives chapter-level, not per-verse, ranges).
export function parseEsvText(raw: string): EsvVerse[] {
  const { body, footnotes } = splitFootnotes(raw)
  const parts = body.split(/\[(\d+)\]/)
  const verses: EsvVerse[] = []
  // parts[0] is anything before the first verse marker (headings) — discard.
  for (let i = 1; i < parts.length; i += 2) {
    const verse = parseInt(parts[i], 10)
    const { text, notes } = stripCallers(parts[i + 1] ?? '', footnotes)
    if (!Number.isFinite(verse) || !text) continue
    verses.push(notes.length > 0 ? { verse, text, notes } : { verse, text })
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
    const refsParam = url.searchParams.get('refs')
    let refs: string[] | null = null
    if (refsParam !== null) {
      refs = parseRefsParam(refsParam)
      if (!refs) return json({ error: 'invalid_request' }, 400)
    } else {
      const book = url.searchParams.get('book')?.trim()
      const chapter = url.searchParams.get('chapter')?.trim()
      if (!book || !chapter || !/^\d+$/.test(chapter)) {
        return json({ error: 'invalid_request' }, 400)
      }
      refs = [`${book} ${chapter}`]
    }

    const query = new URLSearchParams({
      q: refs.join(';'),
      'include-headings': 'false',
      // The translators' notes ride along: callers in the text, bodies in a
      // trailing block. Both are parsed out above into per-verse `notes`.
      'include-footnotes': 'true',
      'include-footnote-body': 'true',
      'include-short-copyright': 'false',
      'include-passage-references': 'false',
      'include-verse-numbers': 'true',
      'include-first-verse-numbers': 'true'
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
    // succeeds. One call whatever the number of references in it.
    deps.recordUsage('ok')

    let data: { passages?: unknown }
    try {
      data = await upstream.json()
    } catch {
      return json({ error: 'upstream_bad_json' }, 502)
    }

    const passages = Array.isArray(data.passages)
      ? data.passages.map(p => (typeof p === 'string' ? p : ''))
      : []

    if (refsParam !== null) {
      // Crossway answers in request order; an unparseable reference yields an
      // empty (or missing) passage, which comes back as an empty verse list
      // rather than failing the whole batch.
      const out: EsvPassage[] = refs.map((reference, i) => ({
        reference,
        verses: parseEsvText(passages[i] ?? '')
      }))
      if (out.every(p => p.verses.length === 0)) {
        return json({ error: 'not_found' }, 404)
      }
      return json({ passages: out })
    }

    const passage = passages[0]
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
