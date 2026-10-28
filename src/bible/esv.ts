import type { BibleProvider, BibleVerseLine, PassageRef, VerseNote } from './provider'
import { CodedError } from '../errors'
import { bookByNumber } from '../utils/bibleBooks'
import { footnoteShips } from '../utils/footnotes'

// ESV via the esv-proxy Supabase edge function (supabase/functions/esv-proxy),
// never api.esv.org directly — Crossway's terms forbid the application key
// shipping in client code (docs/proposals/translations-esv-niv.md section 1).
// The proxy holds the key server-side and returns an already-parsed chapter.
//
// No self-hosted fallback exists for ESV (copyright forbids it) and no
// FallbackBibleProvider wraps this the way BSB/KJV are wrapped — an
// unreachable proxy or an unset key both surface as a thrown CodedError, and
// the reading surfaces show a distinct "not available" state rather than
// silently substituting another translation's text. See ReadingMode.tsx,
// BookDetailPage.tsx, StudyMode.tsx.
//
// TRANSLATORS' NOTES. The proxy carries the ESV's own footnotes per verse as
// `{ offset, text }`, the VerseNote shape. The same rule as the BSB applies on
// the way in (docs/proposals/footnotes-door.md §6): only the alternate-
// rendering class ships; a textual variant is withheld here, before it ever
// reaches the cache, so no surface can show it by accident. Every translation
// at parity, nothing singled out.

const DEFAULT_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/esv-proxy`
  : ''
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

// The proxy's own cap on one ?refs= request (supabase/functions/esv-proxy/handler.ts).
const MAX_REFS_PER_CALL = 12

interface WireVerse {
  verse: number
  text: string
  notes?: { offset: number; text: string }[]
}

interface EsvProxyChapter {
  verses: WireVerse[]
}

interface EsvProxyPassages {
  passages: { reference: string; verses: WireVerse[] }[]
}

interface EsvProxyError {
  error: string
}

function isChapter(body: unknown): body is EsvProxyChapter {
  return Array.isArray((body as EsvProxyChapter)?.verses)
}

function isPassages(body: unknown): body is EsvProxyPassages {
  return Array.isArray((body as EsvProxyPassages)?.passages)
}

function toLine(v: WireVerse): BibleVerseLine {
  const notes: VerseNote[] = (v.notes ?? [])
    .filter(
      n =>
        typeof n?.text === 'string' &&
        Number.isInteger(n.offset) &&
        n.offset >= 0 &&
        n.offset <= v.text.length &&
        footnoteShips(n.text)
    )
    // Crossway marks italics inside a note with asterisks ("The Hebrew word
    // for *man*"); the door shows the note verbatim, so the markers go.
    .map(n => ({ offset: n.offset, text: n.text.replace(/\*/g, '') }))
  return notes.length > 0
    ? { verse: v.verse, text: v.text, notes }
    : { verse: v.verse, text: v.text }
}

export function passageKey(book: number, chapter: number): string {
  return `${book}/${chapter}`
}

// The proxy answered 400 to ?refs= — a deployment that predates the form. The
// cache layer (esv-cache.ts) catches this and reads chapter by chapter
// instead. Its own class rather than a CodedError code because it is a
// capability signal between two ESV modules, not a failure a surface reports.
export class EsvRefsUnsupportedError extends Error {
  constructor() {
    super('esv-proxy does not support ?refs=')
    this.name = 'EsvRefsUnsupportedError'
  }
}

class EsvBadRequest extends Error {}

export class EsvBibleProvider implements BibleProvider {
  // Set the first time the proxy answers 400 to a ?refs= request — an older
  // deployment that only knows book+chapter. Remembered for the session so a
  // sheet never pays a failed round trip twice; the cache layer above this
  // falls back to per-chapter reads when it sees EsvRefsUnsupportedError.
  private refsUnsupported = false

  // Constructor-injected URL, same DI pattern as KjvSelfHostedBibleProvider —
  // lets tests point at a fake origin instead of depending on VITE_SUPABASE_URL
  // being set in the test environment. Defaults to the real deployed proxy.
  constructor(private readonly functionsUrl: string = DEFAULT_FUNCTIONS_URL) {}

  private async call(query: string, label: string): Promise<unknown> {
    if (!this.functionsUrl) {
      // No Supabase env at all (memory-stub/dev-without-backend mode) — same
      // degrade as the key genuinely being unset, since either way there is
      // no proxy to ask.
      throw new CodedError('ESV_NOT_CONFIGURED', 'VITE_SUPABASE_URL unset')
    }

    let res: Response
    try {
      res = await fetch(`${this.functionsUrl}?${query}`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
      })
    } catch (networkErr) {
      // Unreachable/offline — the ESV-specific degrade, distinct from BSB's
      // self-hosted fallback (there is nothing to fall back to here).
      throw new CodedError('ESV_FETCH_FAILED', `network error (${label}): ${String(networkErr)}`)
    }

    if (res.status === 503) {
      // The proxy's fail-closed "no ESV_API_KEY set" response. Not an error a
      // retry can fix, so this is reported distinctly from a transient
      // fetch failure.
      throw new CodedError('ESV_NOT_CONFIGURED', 'esv-proxy: ESV_API_KEY not set')
    }

    if (res.status === 429) {
      // Quota exceeded (shared across every Lantern user, per application —
      // see the proposal). No retry here, deliberately: the caller degrades
      // once and stops, rather than hammering an already-exhausted quota.
      throw new CodedError('ESV_FETCH_FAILED', `quota exceeded (${label})`)
    }

    if (res.status === 400) {
      throw new EsvBadRequest(`400 ${res.statusText} (${label})`)
    }

    if (!res.ok) {
      throw new CodedError('ESV_FETCH_FAILED', `${res.status} ${res.statusText} (${label})`)
    }

    return res.json()
  }

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    const book = bookByNumber(bookNumber)
    if (!book) throw new CodedError('BIBLE_UNKNOWN_BOOK', `book_number ${bookNumber}`)

    const label = `${book.name} ${chapter}`
    const body = await this.call(
      `book=${encodeURIComponent(book.name)}&chapter=${chapter}`,
      label
    ).catch((err: unknown) => {
      // A 400 on the chapter form is a plain failure, not a capability signal.
      if (err instanceof EsvBadRequest) throw new CodedError('ESV_FETCH_FAILED', err.message)
      throw err
    })
    if (!isChapter(body)) {
      throw new CodedError(
        'ESV_FETCH_FAILED',
        `proxy error: ${(body as EsvProxyError)?.error} (${label})`
      )
    }

    return body.verses.map(toLine)
  }

  /**
   * Up to twelve ranges per proxy call (more are chunked), each call metered
   * once against the shared quota. Throws EsvRefsUnsupportedError — and keeps
   * throwing it for the session without another fetch — when the deployed
   * proxy predates the ?refs= form.
   */
  async getPassages(refs: PassageRef[]): Promise<Map<string, BibleVerseLine[]>> {
    if (this.refsUnsupported) throw new EsvRefsUnsupportedError()
    const out = new Map<string, BibleVerseLine[]>()
    if (refs.length === 0) return out

    const named = refs.map(r => {
      const book = bookByNumber(r.book)
      if (!book) throw new CodedError('BIBLE_UNKNOWN_BOOK', `book_number ${r.book}`)
      const end = r.endVerse !== undefined && r.endVerse > r.verse ? `-${r.endVerse}` : ''
      return { ref: r, text: `${book.name} ${r.chapter}:${r.verse}${end}` }
    })

    for (let i = 0; i < named.length; i += MAX_REFS_PER_CALL) {
      const batch = named.slice(i, i + MAX_REFS_PER_CALL)
      const q = batch.map(n => n.text).join(';')
      const label = `${batch.length} refs`
      const body = await this.call(`refs=${encodeURIComponent(q)}`, label).catch((err: unknown) => {
        if (err instanceof EsvBadRequest) {
          this.refsUnsupported = true
          throw new EsvRefsUnsupportedError()
        }
        throw err
      })
      if (!isPassages(body)) {
        throw new CodedError(
          'ESV_FETCH_FAILED',
          `proxy error: ${(body as EsvProxyError)?.error} (${label})`
        )
      }
      // Answered in request order; a short answer leaves the rest empty.
      batch.forEach((n, j) => {
        const key = passageKey(n.ref.book, n.ref.chapter)
        const lines = (body.passages[j]?.verses ?? []).map(toLine)
        const have = out.get(key) ?? []
        for (const line of lines) {
          if (!have.some(h => h.verse === line.verse)) have.push(line)
        }
        have.sort((a, b) => a.verse - b.verse)
        out.set(key, have)
      })
    }
    return out
  }
}
