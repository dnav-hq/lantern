import type { BiblePassage } from '../types'
import type {
  BibleProvider,
  ChapterConnections,
  ConnectionsProvider,
  TranslationId
} from './provider'
import { findBookByAlias, normalizeReference } from '../utils/bibleBooks'
import { adjacentChapter, type ChapterRef } from '../utils/useChapterNavigation'
import { HelloaoBibleProvider } from './helloao'
import { CachedBibleProvider, CachedConnectionsProvider } from './cache'
import { HelloaoConnectionsProvider } from './connections'
import { FallbackBibleProvider } from './fallback'
import { FixtureBibleProvider } from './fixture'
import { SelfHostedBibleProvider } from './self-hosted'
import { KjvBibleProvider } from './kjv'
import { KjvSelfHostedBibleProvider } from './kjv-self-hosted'
import { NetSelfHostedBibleProvider } from './net-self-hosted'
import { EsvBibleProvider } from './esv'
import { EsvCachedBibleProvider } from './esv-cache'
import { CodedError } from '../errors'

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

// ESV: the key-proxy provider (esv.ts) wrapped in its own size-bounded
// evicting cache (esv-cache.ts) — deliberately NOT CachedBibleProvider
// (cache-forever) and NOT wrapped in FallbackBibleProvider, since there is no
// self-hosted ESV bundle a copyright-restricted translation could legally
// have (see esv.ts's header). A proxy/quota/offline failure is a plain thrown
// CodedError; getBibleVerse below catches it and degrades to null rather than
// silently substituting another translation's text.
// Held as its concrete type (not just BibleProvider) so the idle-time
// neighbour prefetch below can reach its `prefetch` method, which on-demand
// reads never need.
const esvCache = new EsvCachedBibleProvider(new EsvBibleProvider())
const esvProvider: BibleProvider = esvCache

// Tamil: the same keyless helloao path BSB uses, just a different translation
// code — no key, no proxy, no quota (both are CC BY-SA 4.0; the attribution
// they require renders in TranslationFooter). Cache-forever wrapped, keyed by
// our own translation id so Tamil chapters never collide with BSB's in the
// IndexedDB cache. No self-hosted fallback layer: there is no Tamil bundle in
// public/ to fall back to, so a helloao outage degrades to the same "not
// available" state ESV already has, rather than pretending otherwise.
const irvProvider: BibleProvider = new CachedBibleProvider(
  new HelloaoBibleProvider('tam_irv'),
  'IRV'
)
const tcvProvider: BibleProvider = new CachedBibleProvider(
  new HelloaoBibleProvider('tam_tcv'),
  'TCV'
)

// NET: same shape as KJV's composition — helloao PRIMARY (cache-forever,
// keyed 'NET' so its chapters never collide with BSB's in IndexedDB), the
// self-hosted complete NET bundle as FALLBACK. NET needs no network provider
// of its own: HelloaoBibleProvider already takes a translation code.
//
// NET is here on the merits, not just because it is free: it is a modern
// translation whose reason for existing is to show where translators disagree,
// which makes BSB/KJV/NET a genuinely informative three-way spread and feeds
// the deep dive's divergence signal (docs/proposals/deep-dive-study.md).
//
// The licence grants the TEXT ONLY — the ~60,000 NET translator notes are
// excluded and are not ours to ship. See net-self-hosted.ts.
const netProvider: BibleProvider = new FallbackBibleProvider(
  new CachedBibleProvider(new HelloaoBibleProvider('eng_net'), 'NET'),
  new NetSelfHostedBibleProvider()
)

// One BibleProvider per translation. BSB's `provider` above is unchanged by
// this map's existence — it's still the only thing a BSB read ever touches.
const providers: Record<TranslationId, BibleProvider> = {
  BSB: provider,
  KJV: kjvProvider,
  ESV: esvProvider,
  NET: netProvider,
  IRV: irvProvider,
  TCV: tcvProvider
}

/* ─── ESV neighbour prefetch ────────────────────────────────────────────────
   Every other chapter turn is a network round trip on ESV, which is where the
   app feels slowest — there is no self-hosted bundle to fall back to for a
   copyrighted translation (see esv.ts), so ESV never gets the instant-turn
   feel BSB/KJV/NET already have via their cache-forever layer. This quietly
   warms the ESV cache for the chapters either side of the one just read,
   scheduled on idle so it can never compete with the reader's own request.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The chapters either side of (bookNumber, chapter), following real book
 * boundaries — pure and exported so the edge cases (first chapter of the
 * first book, last chapter of a book, last chapter of Revelation) are plain
 * unit tests. Delegates to `adjacentChapter` (useChapterNavigation.ts, already
 * proven against every canon edge by the swipe-navigation feature) rather than
 * re-deriving the same book-boundary math a second time.
 */
export function esvNeighbourChapters(bookNumber: number, chapter: number): ChapterRef[] {
  const previous = adjacentChapter(bookNumber, chapter, -1)
  const next = adjacentChapter(bookNumber, chapter, 1)
  return [previous, next].filter((ref): ref is ChapterRef => ref !== null)
}

/**
 * requestIdleCallback where available, a short setTimeout fallback otherwise
 * (Safari has no requestIdleCallback, and a non-DOM test environment has
 * neither the function nor the global it would hang off).
 */
function scheduleIdle(run: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 1200 })
    return
  }
  setTimeout(run, 250)
}

/**
 * Schedule `prefetch` for each neighbour of (bookNumber, chapter) on idle.
 * `prefetch` and `schedule` are injected (not read from module state) purely
 * so this is testable without touching the real ESV cache, a timer, or the
 * network — see esv.test.ts.
 */
export function scheduleEsvNeighbourPrefetch(
  bookNumber: number,
  chapter: number,
  prefetch: (bookNumber: number, chapter: number) => void,
  schedule: (run: () => void) => void = scheduleIdle
): void {
  for (const neighbour of esvNeighbourChapters(bookNumber, chapter)) {
    schedule(() => prefetch(neighbour.bookNumber, neighbour.chapter))
  }
}

// Cross-references, one instance for the whole app and every translation
// (they do not vary by translation — see cache.ts). Nothing reads this until a
// door would show; see src/utils/connectionsLoader.ts.
const connectionsProvider: ConnectionsProvider = new CachedConnectionsProvider(
  new HelloaoConnectionsProvider()
)

export function getChapterConnections(
  bookNumber: number,
  chapter: number
): Promise<ChapterConnections> {
  return connectionsProvider.getConnections(bookNumber, chapter)
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

export interface GetBibleVerseOptions {
  /**
   * Serve this translation instead if the requested one fails, rather than
   * returning null.
   *
   * OPT-IN PER CALL SITE, deliberately. ESV is metered against a quota shared
   * by every Lantern user (5,000/day per application), so a reader can hit a
   * dead end through no fault of their own — falling back to a self-hosted
   * translation keeps them reading. But substituted text is only honest if the
   * surface SAYS so, and not every caller has somewhere to say it. So the
   * default stays "return null and let the surface show its own unavailable
   * state", and a caller opts in only once it renders `servedTranslation`.
   */
  fallbackTo?: TranslationId
}

export async function getBibleVerse(
  reference: string,
  translation: TranslationId = 'BSB',
  options: GetBibleVerseOptions = {}
): Promise<BiblePassage | null> {
  if (!reference.trim()) return null
  const parsed = parseReference(reference)
  if (!parsed) return null

  let chapterVerses
  let servedTranslation: TranslationId | undefined
  try {
    chapterVerses = await providers[translation].getChapter(parsed.bookNumber, parsed.chapterStart)
    // ESV only, and only once the chapter actually asked for has succeeded —
    // never ahead of it, never for a chapter served by a fallback translation.
    if (translation === 'ESV') {
      scheduleEsvNeighbourPrefetch(parsed.bookNumber, parsed.chapterStart, (b, c) => {
        void esvCache.prefetch(b, c)
      })
    }
  } catch (err) {
    // BSB/KJV/NET each have a self-hosted fallback wrapped INSIDE their
    // provider, so reaching here for them means both the network and the
    // bundle failed. ESV has no such bundle by design (a copyright-restricted
    // translation cannot legally have one), so this is its only safety net.
    console.warn(
      `[lantern] ${translation} chapter fetch failed`,
      err instanceof CodedError ? err.code : err,
      err instanceof CodedError ? err.detailForConsole() : ''
    )

    const fallback = options.fallbackTo
    if (!fallback || fallback === translation) return null
    try {
      chapterVerses = await providers[fallback].getChapter(parsed.bookNumber, parsed.chapterStart)
      servedTranslation = fallback
    } catch {
      // The fallback failing too is not more informative than the original
      // failure, which is already logged above.
      return null
    }
  }
  if (chapterVerses.length === 0) return null

  const verses =
    parsed.verseEnd === null
      ? chapterVerses
      : chapterVerses.filter(v => v.verse >= parsed.verseStart && v.verse <= parsed.verseEnd!)

  if (verses.length === 0) return null

  return {
    reference,
    text: verses.map(v => v.text).join(' '),
    verses,
    ...(servedTranslation ? { servedTranslation } : {})
  }
}
