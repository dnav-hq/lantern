import type { ChapterConnections, RawConnection } from '../utils/connections'

// BibleProvider is the scripture source seam. BSB via bible.helloao.org
// (helloao.ts) is the first implementation; KJV (kjv.ts) is the second; ESV
// (esv.ts) is the third, and the first that's copyrighted — it goes through a
// server-side key proxy (supabase/functions/esv-proxy) and a size-bounded
// evicting cache (esv-cache.ts) instead of cache.ts's cache-forever layer,
// per Crossway's terms. A cache layer (cache.ts) wraps BSB/KJV — chapters are
// immutable, so once fetched they're cached forever.
export interface BibleVerseLine {
  verse: number
  text: string
  // The translators' own alternate-rendering notes for this verse, anchored
  // into `text` by character offset. ADDITIVE and OPTIONAL on purpose: `text`
  // stays the flattened string every existing consumer already reads (the
  // journal, search, note anchoring, the offline mirror, the self-hosted
  // bundles), so only a surface that wants doors ever looks at `notes`.
  // Absent — never empty-versus-present — when a provider carries none; see
  // docs/proposals/footnotes-door.md §5.5.
  notes?: VerseNote[]
}

// One footnote the reader may see, per docs/proposals/footnotes-door.md.
// ONLY the alternate-rendering class reaches here; textual variants are
// classified and withheld (brief §6), and withheld means genuinely absent —
// no marker, no count, no placeholder.
export interface VerseNote {
  // Index into `text` where the anchored phrase ENDS. The phrase itself runs
  // back from here; how far is the reading surface's decision, not the seam's.
  // `offset === text.length` is the verse-final case (441 of the 2,099), which
  // anchors a trailing clause rather than a word.
  offset: number
  // The translators' note, verbatim. Nothing is added to it, ever.
  text: string
}

export interface BibleProvider {
  getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]>
}

// The translation dimension threaded through getBibleVerse (service.ts) and
// the reading surfaces. Each id maps to its own BibleProvider instance in
// service.ts — the provider itself is never asked for a translation, since a
// given instance only ever serves one (see cache.ts's `translation` ctor arg).
export type TranslationId = 'BSB' | 'KJV' | 'ESV' | 'NET' | 'IRV' | 'TCV'

// The LANGUAGE a reader reads scripture in — a separate choice from which
// translation, and the one that scopes the translation switcher (see
// useBibleLanguage.ts). Deliberately ISO 639-3 codes matching helloao's own
// `language` field, so adding a language is a data change, not a type change
// with a mapping table. Note anchoring is by verse number and therefore
// language-independent: switching language never touches a note.
export type BibleLanguageId = 'eng' | 'tam'

// The cross-reference seam — docs/proposals/connections-door.md §7. Additive
// and SEPARATE from BibleProvider on purpose: a connection anchors to a whole
// verse, is addressed by (book, chapter) alone, and does not vary by
// translation, so it is neither a property of a verse line nor of any one
// translation's provider. One implementation (connections.ts, over helloao's
// open-cross-ref dataset) wrapped in the same cache-forever layer chapters use.
export interface ConnectionsProvider {
  getConnections(bookNumber: number, chapter: number): Promise<ChapterConnections>
}

export type { ChapterConnections, RawConnection }
