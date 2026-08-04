import { findBookByAlias } from './bibleBooks'

/* ─── /read/<book>/<chapter> ──────────────────────────────────────────────────
   G4a (docs/BACKLOG.md, docs/proposals/guest-preview-mode.md §7): a shareable
   link that opens straight into reading a passage. v1 is on-load parsing ONLY
   — this function is read once at startup (Root.tsx); it never runs again as
   the user navigates, and in-app navigation does not push new URLs. Pure and
   side-effect-free so every book/chapter edge case is a plain unit test rather
   than something exercised through routing or the DOM.
   ──────────────────────────────────────────────────────────────────────────── */

export interface DeepLinkTarget {
  bookNumber: number
  chapter: number
}

/**
 * Parses a `/read/<book>/<chapter>` pathname into a canonical book number +
 * chapter, or null if it isn't a valid deep link — an unknown book, a
 * non-numeric or out-of-range chapter, or a malformed path all fall through to
 * null so the caller can degrade to its normal (library/landing) start state
 * rather than crash.
 *
 * The book segment matches `src/utils/bibleBooks.ts` aliases case-
 * insensitively and accepts a hyphenated slug for multi-word/numbered books
 * (`1-john`, `song-of-solomon`) as well as an already-spaced or %-encoded form.
 */
export function parseDeepLink(pathname: string): DeepLinkTarget | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length !== 3) return null
  const [readSegment, bookSegment, chapterSegment] = segments
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

  return { bookNumber: book.number, chapter }
}
