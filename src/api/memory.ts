import type { BereanApi, UserSettings } from './types'
import { CodedError } from '../errors'
import { uuid } from '../utils/uuid'
import type {
  Passage,
  Session,
  Note,
  NoteWithPassageInfo,
  NoteSearchResult,
  JournalEntry,
  CreatePassageInput,
  CreateNoteInput,
  UpdateNoteInput,
  DeleteNoteResult,
  NoteCategoryDef
} from '../types'
import { bookByNumber } from '../utils/bibleBooks'
import { parseReferenceLabel } from '../utils/noteParser'
import { getBibleVerse } from '../bible/service'

// In-memory BereanApi for Phase 0: the app runs end-to-end on fake data with no
// backend. State lives in module-scoped maps and resets on reload. Phase 1
// replaces this with SupabaseBereanApi behind the same interface.
//
// Scripture is real as of Phase 2: getBibleVerse delegates to
// src/bible/service.ts (BSB via helloao, cached in IndexedDB) — there is no
// backend dependency for reading scripture, so the memory stub gets it free.

const WORKSPACE_ID = 'personal-stub'

const now = (): string => new Date().toISOString()

const passages = new Map<string, Passage>()
const sessions = new Map<string, Session>()
const notes = new Map<string, Note>()
// Account-synced preferences stub: one blob, same reset-on-reload lifetime as
// everything else here.
let settings: UserSettings = {}

function passageInfo(p: Passage): Omit<NoteWithPassageInfo, keyof Note> {
  return {
    book_number: p.book_number,
    chapter_start: p.chapter_start,
    chapter_end: p.chapter_end,
    verse_start: p.verse_start,
    verse_end: p.verse_end,
    reference_label: p.reference_label
  }
}

export function createMemoryApi(): BereanApi {
  // Category definitions. Empty means "nothing customised" and the caller
  // falls back to the built-in four; see src/utils/noteCategories.ts.
  let noteCategories: NoteCategoryDef[] = []
  return {
    async getPassages() {
      return [...passages.values()].sort((a, b) =>
        a.reference_label.localeCompare(b.reference_label)
      )
    },

    async getPassagesByBook(bookNumber) {
      return [...passages.values()].filter(p => p.book_number === bookNumber)
    },

    async getPassageById(id) {
      return passages.get(id) ?? null
    },

    async createPassage(data: CreatePassageInput) {
      const p: Passage = {
        id: uuid(),
        workspace_id: WORKSPACE_ID,
        created_at: now(),
        ...data
      }
      passages.set(p.id, p)
      return p
    },

    async deletePassageAll(passageId) {
      for (const s of sessions.values()) {
        if (s.passage_id !== passageId) continue
        for (const n of notes.values()) {
          if (n.session_id === s.id) notes.delete(n.id)
        }
        sessions.delete(s.id)
      }
      passages.delete(passageId)
      return { deletedPassageId: passageId }
    },

    async getJournalEntries() {
      const entries: JournalEntry[] = []
      for (const p of passages.values()) {
        const sessionIds = new Set(
          [...sessions.values()].filter(s => s.passage_id === p.id).map(s => s.id)
        )
        const passageNotes = [...notes.values()]
          .filter(n => sessionIds.has(n.session_id))
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
        entries.push({
          passage: p,
          note_count: passageNotes.length,
          last_note_at: passageNotes.length
            ? passageNotes[passageNotes.length - 1].created_at
            : null,
          preview: passageNotes.length ? passageNotes[0].content : null
        })
      }
      return entries
    },

    async getSessionsByPassage(passageId) {
      return [...sessions.values()]
        .filter(s => s.passage_id === passageId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    },

    async createSession(passageId) {
      const s: Session = { id: uuid(), passage_id: passageId, created_at: now() }
      sessions.set(s.id, s)
      return s
    },

    async getNotesBySession(sessionId) {
      return [...notes.values()]
        .filter(n => n.session_id === sessionId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    },

    async getNotesByPassage(passageId) {
      const sessionIds = new Set(
        [...sessions.values()].filter(s => s.passage_id === passageId).map(s => s.id)
      )
      return [...notes.values()]
        .filter(n => sessionIds.has(n.session_id))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
    },

    async getNotesByBook(bookNumber) {
      const bookPassages = [...passages.values()].filter(p => p.book_number === bookNumber)
      const result: NoteWithPassageInfo[] = []
      for (const p of bookPassages) {
        const sessionIds = new Set(
          [...sessions.values()].filter(s => s.passage_id === p.id).map(s => s.id)
        )
        for (const n of notes.values()) {
          if (sessionIds.has(n.session_id)) result.push({ ...n, ...passageInfo(p) })
        }
      }
      return result.sort((a, b) => a.created_at.localeCompare(b.created_at))
    },

    async getAllNotes() {
      const result: NoteWithPassageInfo[] = []
      for (const p of passages.values()) {
        const sessionIds = new Set(
          [...sessions.values()].filter(s => s.passage_id === p.id).map(s => s.id)
        )
        for (const n of notes.values()) {
          if (sessionIds.has(n.session_id)) result.push({ ...n, ...passageInfo(p) })
        }
      }
      return result.sort((a, b) => a.created_at.localeCompare(b.created_at))
    },

    async createNote(data: CreateNoteInput) {
      const n: Note = { id: uuid(), created_at: now(), updated_at: now(), ...data }
      notes.set(n.id, n)
      return n
    },

    async updateNote(id, data: UpdateNoteInput) {
      const existing = notes.get(id)
      if (!existing) throw new CodedError('NOTE_NOT_FOUND', `Note ${id} not found`)
      const updated: Note = { ...existing, ...data, updated_at: now() }
      notes.set(id, updated)
      return updated
    },

    async deleteNote(id) {
      notes.delete(id)
    },

    async deleteNoteAndCascade(id): Promise<DeleteNoteResult> {
      const note = notes.get(id)
      if (!note) return { deletedNoteId: id }
      notes.delete(id)
      const result: DeleteNoteResult = { deletedNoteId: id }

      const sessionId = note.session_id
      const sessionEmpty = ![...notes.values()].some(n => n.session_id === sessionId)
      if (!sessionEmpty) return result
      const session = sessions.get(sessionId)
      sessions.delete(sessionId)
      result.deletedSessionId = sessionId
      if (!session) return result

      const passageId = session.passage_id
      const passageEmpty = ![...sessions.values()].some(s => s.passage_id === passageId)
      if (!passageEmpty) return result
      passages.delete(passageId)
      result.deletedPassageId = passageId
      return result
    },

    async searchNotes(query, limit = 50) {
      const q = query.trim().toLowerCase()
      if (!q) return []
      // session_id -> passage, resolved once so each match carries its context.
      const passageBySession = new Map<string, Passage>()
      for (const s of sessions.values()) {
        const p = passages.get(s.passage_id)
        if (p) passageBySession.set(s.id, p)
      }
      const results: NoteSearchResult[] = []
      for (const n of notes.values()) {
        if (!n.content.toLowerCase().includes(q)) continue
        const p = passageBySession.get(n.session_id)
        if (!p) continue
        results.push({
          note: n,
          passage_id: p.id,
          book_number: p.book_number,
          reference_label: p.reference_label
        })
      }
      // Newest first — most recently touched notes are the likeliest target.
      // Bounded like the real implementation, so a caller checking "did I get
      // more than I asked to show" behaves the same against the stub.
      return results
        .sort((a, b) =>
          (b.note.updated_at ?? b.note.created_at).localeCompare(
            a.note.updated_at ?? a.note.created_at
          )
        )
        .slice(0, limit)
    },

    async getBibleVerse(reference) {
      return getBibleVerse(reference)
    },

    async getSettings() {
      return { ...settings }
    },

    async updateSettings(patch: Partial<UserSettings>) {
      settings = { ...settings, ...patch }
    },

    // Starts empty, exactly like a real workspace that has never customised
    // anything — so the built-in fallback is what tests and a fresh checkout
    // actually exercise.
    async getNoteCategories() {
      return noteCategories
    },

    async saveNoteCategories(defs) {
      noteCategories = defs
    }
  }
}

// Demo fixture. This is the only path a fresh checkout gets: with no Supabase
// env vars, Root falls back to the memory stub (see Root.tsx), so this data is
// what the app boots into for local dev and for agents working without
// credentials. It deliberately covers every surface a UI change might touch —
// several books (the Journal index and getNotesByBook group by book), more than
// one session on a passage, all four categories, sub-notes (indent_level > 0),
// cross-references, and distinctive wording for searchNotes — because a fixture
// that only proves "the app renders" sends you to the editor to hand-make data
// before you can see anything.
//
// It writes the maps directly rather than awaiting the api methods: callers
// render immediately after seeding, so anything async here is a race the first
// paint can lose (it did — four passages seeded, one showed). Timestamps are
// fixed offsets from a base date, not now(), so journal ordering and
// last_note_at are the same on every boot and a test can assert on them.

interface SeedNote {
  content: string
  anchor_start_verse: number | null
  anchor_end_verse: number | null
  category: Note['category']
  indent_level: number
}

interface SeedPassage {
  book_number: number
  reference_label: string
  // One array per session, so passages with two arrays exercise the
  // multi-session reading view.
  sessions: SeedNote[][]
}

const SEED: SeedPassage[] = [
  {
    book_number: 43, // John
    reference_label: 'John 1:1-5',
    sessions: [
      [
        {
          content: 'v1 The Word was with God and was God. @observation',
          anchor_start_verse: 1,
          anchor_end_verse: 1,
          category: 'observation',
          indent_level: 0
        },
        {
          content: 'Echoes Genesis 1:1 — the same opening words, now about Christ.',
          anchor_start_verse: 1,
          anchor_end_verse: 1,
          category: 'observation',
          indent_level: 1
        },
        {
          content:
            'v4-5 Light shining in the darkness, and the darkness has not overcome it. @personal',
          anchor_start_verse: 4,
          anchor_end_verse: 5,
          category: 'personal',
          indent_level: 0
        }
      ],
      [
        {
          content:
            'v3 "Through him all things were made" — creation is not a backdrop to the gospel, it is the same story. @observation',
          anchor_start_verse: 3,
          anchor_end_verse: 3,
          category: 'observation',
          indent_level: 0
        }
      ]
    ]
  },
  {
    book_number: 1, // Genesis
    reference_label: 'Genesis 1:1-5',
    sessions: [
      [
        {
          content:
            'v1 Written to a people surrounded by creation myths where the world is made from a slain god. This one has no struggle in it at all. @historical',
          anchor_start_verse: 1,
          anchor_end_verse: 1,
          category: 'historical',
          indent_level: 0
        },
        {
          content: 'v3 God speaks and it is so. Creation by word, not by combat. @observation',
          anchor_start_verse: 3,
          anchor_end_verse: 3,
          category: 'observation',
          indent_level: 0
        }
      ]
    ]
  },
  {
    book_number: 45, // Romans
    reference_label: 'Romans 8:28-30',
    sessions: [
      [
        {
          content:
            'v28 "All things" is wider than the comfortable things. This is not a promise that everything is good. @application',
          anchor_start_verse: 28,
          anchor_end_verse: 28,
          category: 'application',
          indent_level: 0
        },
        {
          content: 'Worth sitting with the next time a plan collapses.',
          anchor_start_verse: 28,
          anchor_end_verse: 28,
          category: 'personal',
          indent_level: 1
        }
      ]
    ]
  },
  {
    book_number: 19, // Psalms
    reference_label: 'Psalm 23:1-6',
    sessions: [
      [
        {
          content:
            'v1 A shepherd metaphor from a man who had actually kept sheep — unsentimental about it. @historical',
          anchor_start_verse: 1,
          anchor_end_verse: 1,
          category: 'historical',
          indent_level: 0
        },
        {
          content: 'v4 Through the valley, not around it. @personal',
          anchor_start_verse: 4,
          anchor_end_verse: 4,
          category: 'personal',
          indent_level: 0
        }
      ]
    ]
  }
]

// Oldest seeded note; each subsequent note is SEED_STEP_MS newer, so the
// fixture reads as study spread over a couple of weeks rather than one instant.
const SEED_BASE = Date.parse('2026-06-01T09:00:00.000Z')
const SEED_STEP_MS = 36 * 60 * 60 * 1000 // 36h

export function seedMemoryApi(): void {
  if (passages.size > 0) return
  let tick = 0
  const stamp = (): string => new Date(SEED_BASE + tick++ * SEED_STEP_MS).toISOString()

  for (const seed of SEED) {
    const parsed = parseReferenceLabel(seed.reference_label)!
    const passage: Passage = {
      id: uuid(),
      workspace_id: WORKSPACE_ID,
      book_number: bookByNumber(seed.book_number)?.number ?? seed.book_number,
      chapter_start: parsed.chapter_start,
      verse_start: parsed.verse_start,
      chapter_end: parsed.chapter_end,
      verse_end: parsed.verse_end,
      reference_label: seed.reference_label,
      created_at: stamp()
    }
    passages.set(passage.id, passage)

    for (const sessionNotes of seed.sessions) {
      const session: Session = { id: uuid(), passage_id: passage.id, created_at: stamp() }
      sessions.set(session.id, session)
      for (const seedNote of sessionNotes) {
        const at = stamp()
        const note: Note = {
          id: uuid(),
          session_id: session.id,
          content: seedNote.content,
          anchor_start_verse: seedNote.anchor_start_verse,
          anchor_end_verse: seedNote.anchor_end_verse,
          anchor_book_override: null,
          anchor_chapter_override: null,
          category: seedNote.category,
          indent_level: seedNote.indent_level,
          created_at: at,
          updated_at: at
        }
        notes.set(note.id, note)
      }
    }
  }
}
