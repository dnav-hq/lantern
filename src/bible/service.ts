import type { BiblePassage } from '../types'
import type { BibleProvider, TranslationId } from './provider'
import { findBookByAlias, normalizeReference } from '../utils/bibleBooks'
import { HelloaoBibleProvider } from './helloao'
import { CachedBibleProvider } from './cache'
import { FallbackBibleProvider } from './fallback'
import { FixtureBibleProvider } from './fixture'
import { SelfHostedBibleProvider } from './self-hosted'
import { KjvBibleProvider } from './kjv'
import { KjvSelfHostedBibleProvider } from './kjv-self-hosted'

// The reference-based lookup components already depend on
// (`api.getBibleVerse(reference) -> BiblePassage | null`). This module owns
// that behavior on top of the BibleProvider seam, so both the memory stub and
// SupabaseBereanApi can delegate to a single implementation instead of each
// re-implementing scripture lookup. See CLAUDE.md "BibleProvider" section.
const network: BibleProvider = new CachedBibleProvider(new HelloaoBibleProvider())

// The self-hosted complete BSB (public/bible/bsb.json.gz). helloao stays the
// PRIMARY source; this is the FALLBACK, so a helloao outage no longer takes the
// read path down. It is fetched lazily — only after the primary throws — and
// sits OUTSIDE the cache (see self-hosted.ts for why that's safe here and why we
// do it anyway). This is the real answer the full-BSB backlog item called for.
const selfHosted: BibleProvider = new SelfHostedBibleProvider()

// helloao PRIMARY, self-hosted FALLBACK.
const production: BibleProvider = new FallbackBibleProvider(network, selfHosted)

// In dev we keep the tiny four-chapter fixture in FRONT of the big bundle, so a
// contributor (or an agent in a sandbox with no egress) still gets the seeded
// chapters instantly without the self-hosted bundle even needing to be built or
// served. Behaviour for those four chapters is unchanged; every other chapter,
// which used to throw offline, now resolves from the self-hosted bundle.
// `import.meta.env.DEV` is statically false in a production build, so this whole
// branch and the ~19KB fixture tree-shake away — real users get exactly
// `production` above.
const provider: BibleProvider = import.meta.env.DEV
  ? new FallbackBibleProvider(
      new FallbackBibleProvider(network, new FixtureBibleProvider()),
      selfHosted
    )
  : production

// KJV: same shape as BSB's production composition — helloao PRIMARY, the
// self-hosted complete KJV bundle as FALLBACK. No dev fixture layer: unlike
// BSB, the self-hosted bundle is served locally by Vite in dev too (it's a
// static file under public/), so it already works with no network egress —
// a four-chapter fixture would add nothing a contributor needs.
const kjvProvider: BibleProvider = new FallbackBibleProvider(
  new CachedBibleProvider(new KjvBibleProvider(), 'KJV'),
  new KjvSelfHostedBibleProvider()
)

// One BibleProvider per translation. BSB's `provider` above is unchanged by
// this map's existence — it's still the only thing a BSB read ever touches.
const providers: Record<TranslationId, BibleProvider> = {
  BSB: provider,
  KJV: kjvProvider
}

interface ParsedReference {
  bookNumber: number
  chapterStart: number
  verseStart: number
  chapterEnd: number
  verseEnd: number | null // null = "to end of chapter" (chapter-only references)
}

// Parses references in the two shapes call sites produce:
//   "Book ch:v"          "Book ch:v-v"        (StudyMode, NoteEditor, ReadingMode's reference_label)
//   "Book ch"             (BookDetailPage chapter view: no verse component)
// Multi-word book names (e.g. "Song of Solomon", "1 Corinthians") are handled
// by trying progressively shorter prefixes against the alias table, since the
// chapter/verse suffix is unambiguous once matched.
function parseReference(reference: string): ParsedReference | null {
  const ref = normalizeReference(reference)
  // "<chapter>[:<verse>[-<verse>]]" possibly anchored at the end of the string
  const m = /^(.*?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(ref)
  if (!m) return null
  const bookPart = m[1].trim()
  const book = findBookByAlias(bookPart)
  if (!book) return null

  const chapterStart = parseInt(m[2], 10)
  const verseStart = m[3] ? parseInt(m[3], 10) : 1
  const verseEnd = m[4] ? parseInt(m[4], 10) : m[3] ? verseStart : null

  return {
    bookNumber: book.number,
    chapterStart,
    verseStart,
    chapterEnd: chapterStart, // call sites never span chapters today
    verseEnd
  }
}

export async function getBibleVerse(
  reference: string,
  translation: TranslationId = 'BSB'
): Promise<BiblePassage | null> {
  if (!reference.trim()) return null
  const parsed = parseReference(reference)
  if (!parsed) return null

  const chapterVerses = await providers[translation].getChapter(
    parsed.bookNumber,
    parsed.chapterStart
  )
  if (chapterVerses.length === 0) return null

  const verses =
    parsed.verseEnd === null
      ? chapterVerses
      : chapterVerses.filter(v => v.verse >= parsed.verseStart && v.verse <= parsed.verseEnd!)

  if (verses.length === 0) return null

  return {
    reference,
    text: verses.map(v => v.text).join(' '),
    verses
  }
}
