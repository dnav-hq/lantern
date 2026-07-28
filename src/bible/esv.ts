import type { BibleProvider, BibleVerseLine } from './provider'
import { CodedError } from '../errors'
import { bookByNumber } from '../utils/bibleBooks'

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

const DEFAULT_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/esv-proxy`
  : ''
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

interface EsvProxySuccess {
  verses: { verse: number; text: string }[]
}

interface EsvProxyError {
  error: string
}

type EsvProxyResponse = EsvProxySuccess | EsvProxyError

function isSuccess(body: EsvProxyResponse): body is EsvProxySuccess {
  return Array.isArray((body as EsvProxySuccess).verses)
}

export class EsvBibleProvider implements BibleProvider {
  // Constructor-injected URL, same DI pattern as KjvSelfHostedBibleProvider —
  // lets tests point at a fake origin instead of depending on VITE_SUPABASE_URL
  // being set in the test environment. Defaults to the real deployed proxy.
  constructor(private readonly functionsUrl: string = DEFAULT_FUNCTIONS_URL) {}

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    const book = bookByNumber(bookNumber)
    if (!book) throw new CodedError('BIBLE_UNKNOWN_BOOK', `book_number ${bookNumber}`)

    if (!this.functionsUrl) {
      // No Supabase env at all (memory-stub/dev-without-backend mode) — same
      // degrade as the key genuinely being unset, since either way there is
      // no proxy to ask.
      throw new CodedError('ESV_NOT_CONFIGURED', 'VITE_SUPABASE_URL unset')
    }

    let res: Response
    try {
      const url = `${this.functionsUrl}?book=${encodeURIComponent(book.name)}&chapter=${chapter}`
      res = await fetch(url, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
      })
    } catch (networkErr) {
      // Unreachable/offline — the ESV-specific degrade, distinct from BSB's
      // self-hosted fallback (there is nothing to fall back to here).
      throw new CodedError(
        'ESV_FETCH_FAILED',
        `network error (${book.name} ${chapter}): ${String(networkErr)}`
      )
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
      throw new CodedError('ESV_FETCH_FAILED', `quota exceeded (${book.name} ${chapter})`)
    }

    if (!res.ok) {
      throw new CodedError(
        'ESV_FETCH_FAILED',
        `${res.status} ${res.statusText} (${book.name} ${chapter})`
      )
    }

    const body = (await res.json()) as EsvProxyResponse
    if (!isSuccess(body)) {
      throw new CodedError(
        'ESV_FETCH_FAILED',
        `proxy error: ${body.error} (${book.name} ${chapter})`
      )
    }

    return body.verses.map(v => ({ verse: v.verse, text: v.text }))
  }
}
