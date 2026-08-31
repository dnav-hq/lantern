import type { TranslationId } from '../bible/provider'
export type NoteCategory = 'observation' | 'historical' | 'application' | 'personal'

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
