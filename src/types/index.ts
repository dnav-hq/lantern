import type { TranslationId, VerseNote } from '../bible/provider'
/**
 * The key a note carries. An OPEN string, not a closed union of the four
 * built-ins — a reader will be able to add their own
 * (docs/proposals/custom-categories.md §1.1).
 *
 * KEPT AS A NAMED ALIAS ON PURPOSE. It documents what the string is for at ~47
 * call sites that would otherwise read `string`, and it is the one place to
 * look when asking what a category key may be.
 *
 * WHAT THIS COSTS. The compiler no longer checks category keys for you: a typo,
 * a stale literal or a key the workspace does not own all compile. That check
 * has moved to runtime and to tests — `isValidCategoryKey` in
 * src/utils/noteCategories.ts is the grammar (and the reserved-key list), and
 * src/utils/noteParser.ts builds its @tag regex from the same source so the
 * parser and the validator cannot drift. If you are about to rely on a category
 * being one of exactly four things, write the check.
 */
export type NoteCategory = string

/**
 * How one category is presented in a workspace: its label and colour.
 *
 * `key` is what a note stores and is STABLE — renaming changes `label`, never
 * `key`, so existing notes keep their category. See
 * src/utils/noteCategories.ts and supabase/migrations/0010_note_categories.sql.
 */
export interface NoteCategoryDef {
  key: string
  label: string
  /** Hex, e.g. '#6b62d6'. */
  color: string
  sort_order: number
}

// All ids are client-generated UUIDs (crypto.randomUUID()).
// Book identity lives in src/utils/bibleBooks.ts as a USFM book_number (1–66);
// there is no Books table.

export interface Passage {
  id: string
  workspace_id: string
  book_number: number
  chapter_start: number
  verse_start: number
  chapter_end: number
  verse_end: number
  reference_label: string
  created_at: string
  session_count?: number
  last_studied?: string
}

export interface Session {
  id: string
  passage_id: string
  created_at: string
}

export interface Note {
  id: string
  session_id: string
  content: string
  anchor_start_verse: number | null
  anchor_end_verse: number | null
  anchor_book_override: string | null
  anchor_chapter_override: number | null
  category: NoteCategory | null
  indent_level: number
  created_at: string
  updated_at: string
}

export interface BibleVerse {
  verse: number
  text: string
  /**
   * Translators' footnotes anchored into `text`, when the provider carried any.
   * Optional because most callers neither set nor read it: the journal, search,
   * note anchoring and the offline mirror all treat a verse as `{ verse, text }`
   * and are untouched by this. Only the reading surface reads it, and a chapter
   * from the self-hosted fallback simply has none.
   */
  notes?: VerseNote[]
}

export interface BiblePassage {
  reference: string
  text: string
  verses: BibleVerse[]
  /**
   * Set ONLY when the text came from a different translation than the one
   * asked for — i.e. a fallback fired. Undefined on every normal read.
   *
   * A caller that opts into fallback (see `getBibleVerse`'s options) MUST
   * surface this to the reader. Showing substituted text under the original
   * translation's name would be worse than showing nothing.
   */
  servedTranslation?: TranslationId
}

export type NoteSegmentType = 'text' | 'verse-anchor' | 'cross-ref' | 'tag'

export interface NoteSegment {
  type: NoteSegmentType
  raw: string
  display: string
  data?: {
    startVerse?: number
    endVerse?: number
    reference?: string
    category?: NoteCategory
  }
}

export interface ParsedNote {
  segments: NoteSegment[]
  anchorStart: number | null
  anchorEnd: number | null
  category: NoteCategory | null
  crossRefs: string[]
}

// Note enriched with its passage's chapter/verse span (returned by getNotesByBook)
export interface NoteWithPassageInfo extends Note {
  // USFM 1-66. Already selected by the query that builds this; surfaced because
  // callers that group notes (the Journal, export) need the book without
  // re-parsing reference_label, which is a display string, not data.
  book_number: number
  chapter_start: number
  chapter_end: number
  verse_start: number
  verse_end: number
  reference_label: string
}

export interface CreatePassageInput {
  book_number: number
  chapter_start: number
  verse_start: number
  chapter_end: number
  verse_end: number
  reference_label: string
}

export interface CreateNoteInput {
  session_id: string
  content: string
  anchor_start_verse: number | null
  anchor_end_verse: number | null
  anchor_book_override: string | null
  anchor_chapter_override: number | null
  category: NoteCategory | null
  indent_level: number
}

export interface UpdateNoteInput {
  content?: string
  anchor_start_verse?: number | null
  anchor_end_verse?: number | null
  category?: NoteCategory | null
  indent_level?: number
}

// Result of a cascading note delete: reports which parents were emptied and removed.
export interface DeleteNoteResult {
  deletedNoteId: string
  deletedSessionId?: string
  deletedPassageId?: string
}

// One row in the Journal index: a studied passage plus the aggregates the
// listing shows (note count, last activity, first-note preview).
export interface JournalEntry {
  passage: Passage
  note_count: number
  last_note_at: string | null
  preview: string | null
}

export interface PassageWithNotes {
  passage: Passage
  sessions: Array<Session & { notes: Note[] }>
}

// One note matched by the global search (searchNotes). Carries enough passage
// context to render a result row and to jump the reader to the note in context:
// the passage id opens the study, the reference label + book number drive the
// row's heading and any Bible-view navigation.
export interface NoteSearchResult {
  note: Note
  passage_id: string
  book_number: number
  reference_label: string
}
