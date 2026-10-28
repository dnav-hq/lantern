import { bookByNumber, findBookByAlias } from './bibleBooks'

/* ─── /read/<book>/<chapter>[/<verse>] ────────────────────────────────────────
   G4a (docs/BACKLOG.md, docs/proposals/guest-preview-mode.md §7): a shareable
   link that opens straight into reading a passage. Parsed once at startup
   (Root.tsx) and again on every `popstate` (App.tsx), and written back by
   App.tsx as the reader moves, so the address bar always names the chapter on
   screen and a copied URL is a working link. Pure and side-effect-free so
   every book/chapter edge case is a plain unit test rather than something
   exercised through routing or the DOM.
   ──────────────────────────────────────────────────────────────────────────── */

export interface DeepLinkTarget {
  bookNumber: number
  chapter: number
  /** Verse to land on, when the link names one. Not range-checked against the
   * chapter (the reading page tolerates a verse that is not there). */
  verse?: number
}

function parseVerse(raw: string | null | undefined): number | null | undefined {
  // undefined = no verse given; null = a verse was given but is not a positive
  // integer (so the whole link is rejected rather than half-honoured).
  if (raw === null || raw === undefined || raw === '') return undefined
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 ? n : null
}

/**
 * Parses a `/read/<book>/<chapter>` or `/read/<book>/<chapter>/<verse>`
 * pathname (optionally with `?v=<verse>`) into a canonical book number +
 * chapter (+ verse), or null if it isn't a valid deep link — an unknown book,
 * a non-numeric or out-of-range chapter, a malformed path or a non-numeric
 * verse all fall through to null so the caller can degrade to its normal
 * (library/landing) start state rather than crash.
 *
 * The book segment matches `src/utils/bibleBooks.ts` aliases case-
 * insensitively and accepts a hyphenated slug for multi-word/numbered books
 * (`1-john`, `song-of-solomon`) as well as an already-spaced or %-encoded form.
 * A verse in the path wins over one in the query string.
 */
export function parseDeepLink(pathname: string, search = ''): DeepLinkTarget | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length !== 3 && segments.length !== 4) return null
  const [readSegment, bookSegment, chapterSegment, verseSegment] = segments
  if (readSegment.toLowerCase() !== 'read') return null

  let decodedBook: string
  try {
    decodedBook = decodeURIComponent(bookSegment)
  } catch {
    return null
  }
  const book = findBookByAlias(decodedBook.replace(/-/g, ' '))
  if (!book) return null

  if (!/^\d+$/.test(chapterSegment)) return null
  const chapter = Number(chapterSegment)
  if (chapter < 1 || chapter > book.chapters) return null

  let verse = parseVerse(verseSegment)
  if (verse === null) return null
  if (verse === undefined && search) {
    let fromQuery: string | null = null
    try {
      fromQuery = new URLSearchParams(search).get('v')
    } catch {
      fromQuery = null
    }
    verse = parseVerse(fromQuery)
    if (verse === null) return null
  }

  return verse === undefined
    ? { bookNumber: book.number, chapter }
    : { bookNumber: book.number, chapter, verse }
}

/** The URL slug for a book: lowercase, spaces to hyphens (`1-john`,
 * `song-of-solomon`). Round-trips through `parseDeepLink`. */
export function bookSlug(bookNumber: number): string | null {
  const book = bookByNumber(bookNumber)
  if (!book) return null
  return book.name.toLowerCase().replace(/\s+/g, '-')
}

/**
 * Builds the path for a chapter (or a verse within it): `/read/1-john/3` or
 * `/read/1-john/3/16`. Returns `/` for an unknown book so a caller can always
 * write the result into the address bar. A verse that is not a positive
 * integer is left out rather than producing a link `parseDeepLink` rejects.
 */
export function buildDeepLink(bookNumber: number, chapter: number, verse?: number | null): string {
  const slug = bookSlug(bookNumber)
  if (!slug || !Number.isInteger(chapter) || chapter < 1) return '/'
  const base = `/read/${slug}/${chapter}`
  return verse != null && Number.isInteger(verse) && verse >= 1 ? `${base}/${verse}` : base
}
