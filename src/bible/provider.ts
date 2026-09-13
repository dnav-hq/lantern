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

// One place Scripture picks this verse up, per docs/proposals/connections-door.md.
// The LINK is the data (OpenBible.info's cross-references, CC BY 4.0); `kind`
// is NOT — it is computed from the app's own verse text at render time (§4),
// because the only dataset that carries it has no licence at all (§3.2). So it
// is deliberately absent here: the seam ships what the source actually says.
export interface VerseConnection {
  /** book_number, 1-66 — resolved from the source data's USFM code. */
  book: number
  chapter: number
  verse: number
  /** Present only when the target is a RANGE. The source is always one verse. */
  endVerse?: number
  /**
   * OpenBible's own relevance weighting. Unbounded and occasionally negative
   * (measured -4..738), and NOT a measure of how literal a quotation is — so it
   * governs whether a door exists (src/utils/connections.ts) and is NEVER shown
   * to a reader (§6.1).
   */
  score: number
}

/** `{ [verseNumber]: VerseConnection[] }` — one chapter's outgoing links. */
export type ChapterConnections = Record<number, VerseConnection[]>

export interface BibleProvider {
  getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]>
  /**
   * The chapter's cross-references, ADDITIVE and OPTIONAL exactly like
   * `notes` above: a provider that has none (the self-hosted bundles carry
   * verse text only) simply does not implement it, and the door is absent
   * rather than empty. Translation-independent — see connections-door.md §7 —
   * which is why it is not threaded through service.ts's per-translation
   * provider map; src/utils/connectionsLoader.ts owns the one instance every
   * translation shares.
   */
  getConnections?(bookNumber: number, chapter: number): Promise<ChapterConnections>
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
