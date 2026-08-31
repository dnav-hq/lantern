import { bookByNumber } from './bibleBooks'

/* ─── Journal filtering ───────────────────────────────────────────────────────
   The Journal's job is retrieval, not just history: research on mature Bible
   note tools found that people do not complain about capture being slow, they
   complain they cannot find anything again ("hard to find, hard to discover,
   hard to retrieve, hard to organize"). See docs/proposals/journal-retrieval.md
   and docs/proposals/note-object.md.

   Filtering is the foundation that pass recommends building first: it is
   entirely client-side over the notes the page has already fetched, needs no
   API method and no migration, and the later pieces (scoped search, saved
   filters) reuse it.

   The logic lives here, structurally typed and free of React, so the rules that
   decide what a reader sees are unit-testable without rendering a page.

   TWO RULES that matter more than the widget choice, both from the brief:
   - Filters compose and are VISIBLE. A filter you forgot you set is worse than
     no filter, because you conclude a note is gone.
   - An empty result is a SENTENCE, not a void — it names the filter that caused
     it, so the reader knows what to undo.
   ──────────────────────────────────────────────────────────────────────────── */

/** The shape a note needs for filtering. Deliberately minimal and structural so
 *  this module never imports the Journal's view types (or React). */
export interface FilterableNote {
  category: string | null
  /** True for a note with no body — see src/utils/noteKind.ts. */
  highlight?: boolean
}

export interface FilterableEntry<N extends FilterableNote> {
  /** null when the reference label's book could not be resolved. */
  bookNumber: number | null
  notes: N[]
}

export const ALL = 'all' as const
export type Selection<T extends string> = T | typeof ALL

/** Written notes, wordless marks, or both. */
export type KindFilter = 'note' | 'highlight' | typeof ALL

export interface JournalFilters {
  category: Selection<string>
  bookNumber: number | typeof ALL
  kind: KindFilter
}

export const NO_FILTERS: JournalFilters = { category: ALL, bookNumber: ALL, kind: ALL }

export function hasActiveFilter(filters: JournalFilters): boolean {
  return filters.category !== ALL || filters.bookNumber !== ALL || filters.kind !== ALL
}

/**
 * The categories actually present in these notes, in the order given by
 * `preferred` (the four built-ins) with anything else appended alphabetically.
 *
 * DERIVED, not hardcoded, on purpose: when categories become user-owned rows
 * (note-object.md), this filter needs no second pass — a category the reader
 * invented shows up here the moment they use it, and one they never use never
 * clutters the menu.
 */
export function categoriesPresent<N extends FilterableNote>(
  entries: FilterableEntry<N>[],
  preferred: readonly string[] = []
): string[] {
  const seen = new Set<string>()
  for (const entry of entries) {
    for (const note of entry.notes) {
      if (note.category) seen.add(note.category)
    }
  }
  const known = preferred.filter(c => seen.has(c))
  const extra = [...seen].filter(c => !preferred.includes(c)).sort()
  return [...known, ...extra]
}

export interface BookOption {
  number: number
  name: string
}

/**
 * The books the reader has actually written in, in canon order.
 *
 * Never a 66-item picker: that would read as a Bible index rather than as YOUR
 * notes, which is the whole distinction the Journal is making. Entries whose
 * book could not be resolved are skipped here (they are still reachable with no
 * book filter set) rather than shown as a nameless option.
 */
export function booksPresent<N extends FilterableNote>(
  entries: FilterableEntry<N>[]
): BookOption[] {
  const numbers = new Set<number>()
  for (const entry of entries) {
    if (entry.bookNumber !== null) numbers.add(entry.bookNumber)
  }
  return [...numbers]
    .sort((a, b) => a - b)
    .map(number => ({ number, name: bookByNumber(number)?.name ?? String(number) }))
}

/**
 * Apply the filters: slice each entry's NOTES, then drop any entry left with
 * nothing. Book filtering happens at the entry level, category at the note
 * level, and the two compose.
 *
 * Entry objects are only cloned when the category filter actually changes their
 * notes, so an unfiltered render keeps referential identity and React does not
 * re-render every row for nothing.
 */
export function applyJournalFilters<N extends FilterableNote, E extends FilterableEntry<N>>(
  entries: E[],
  filters: JournalFilters
): E[] {
  const byBook =
    filters.bookNumber === ALL
      ? entries
      : entries.filter(entry => entry.bookNumber === filters.bookNumber)

  if (filters.category === ALL && filters.kind === ALL) return byBook

  const matches = (n: N): boolean => {
    if (filters.category !== ALL && n.category !== filters.category) return false
    if (filters.kind === 'highlight' && !n.highlight) return false
    if (filters.kind === 'note' && n.highlight) return false
    return true
  }

  const out: E[] = []
  for (const entry of byBook) {
    const notes = entry.notes.filter(matches)
    if (notes.length > 0) out.push({ ...entry, notes })
  }
  return out
}

/**
 * The empty state, as a sentence naming what caused it.
 *
 * `categoryLabel` is passed in rather than looked up here so this module stays
 * free of the built-in category list, which is about to become user-owned.
 */
export function emptyResultMessage(
  filters: JournalFilters,
  labels: { category?: string; book?: string }
): string {
  const cat = filters.category === ALL ? null : (labels.category ?? filters.category)
  const book = filters.bookNumber === ALL ? null : (labels.book ?? null)

  if (cat && book) return `No ${cat.toLowerCase()} notes in ${book}.`
  if (cat) return `No ${cat.toLowerCase()} notes yet.`
  if (book) return `No notes in ${book} yet.`
  return 'No notes yet.'
}
