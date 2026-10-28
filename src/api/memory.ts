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
  DeleteNoteResult
} from '../types'
import type { StoredCategoryDef } from '../utils/noteCategories'
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

// One store = everything a memory api holds. The dev stub shares the single
// module-level one below (so seedMemoryApi can fill it before the api is
// asked); a PERSISTED api (the guest backend, see createMemoryApi's persistKey)
// gets its own instance, loaded from storage and written back after every
// mutation.
interface MemoryStore {
  passages: Map<string, Passage>
  sessions: Map<string, Session>
  notes: Map<string, Note>
  // Category definitions. Empty means "nothing customised" and the caller
  // falls back to the built-in four; see src/utils/noteCategories.ts.
  //
  // Rows carry `archived_at` exactly as the Supabase table does since migration
  // 0011, so retire/restore behaves identically with no backend — which is the
  // path a fresh checkout and every UI-only session actually take.
  categories: StoredCategoryDef[]
}

function emptyStore(): MemoryStore {
  return { passages: new Map(), sessions: new Map(), notes: new Map(), categories: [] }
}

const MODULE_STORE: MemoryStore = emptyStore()
const passages = MODULE_STORE.passages
const sessions = MODULE_STORE.sessions
const notes = MODULE_STORE.notes
// Account-synced preferences stub: one blob, same reset-on-reload lifetime as
// everything else here.
let settings: UserSettings = {}

// ─── Persistence (guest store) ───────────────────────────────────────────────
// A guest's notes live in localStorage under GUEST_STORE_KEY so a reload keeps
// them and sign-in can carry them into the account (see Root.tsx's enter() and
// src/utils/guestReplay.ts). The serialised shape is deliberately the plain
// row arrays — nothing derived — so a snapshot can be replayed through the
// real BereanApi field for field.

export const GUEST_STORE_KEY = 'berean.guest-store'

/** The slice of Storage this module needs — injectable so it can be tested without a DOM. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface GuestSnapshot {
  passages: Passage[]
  sessions: Session[]
  notes: Note[]
  categories: StoredCategoryDef[]
}

function defaultStorage(): KeyValueStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function parseSnapshot(raw: string | null): GuestSnapshot | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const o = parsed as Partial<Record<keyof GuestSnapshot, unknown>>
    return {
      passages: Array.isArray(o.passages) ? (o.passages as Passage[]) : [],
      sessions: Array.isArray(o.sessions) ? (o.sessions as Session[]) : [],
      notes: Array.isArray(o.notes) ? (o.notes as Note[]) : [],
      categories: Array.isArray(o.categories) ? (o.categories as StoredCategoryDef[]) : []
    }
  } catch {
    return null
  }
}

function readSnapshot(storage: KeyValueStore | null, key: string): GuestSnapshot | null {
  try {
    return parseSnapshot(storage?.getItem(key) ?? null)
  } catch {
    return null
  }
}

function writeSnapshot(storage: KeyValueStore | null, key: string, snap: GuestSnapshot): void {
  // A quota or private-window failure must never break the app: the notes
  // still exist for this session, they just are not remembered.
  try {
    storage?.setItem(key, JSON.stringify(snap))
  } catch {
    /* ignore */
  }
}

function storeFromSnapshot(snap: GuestSnapshot | null): MemoryStore {
  const store = emptyStore()
  if (!snap) return store
  for (const p of snap.passages) store.passages.set(p.id, p)
  for (const s of snap.sessions) store.sessions.set(s.id, s)
  for (const n of snap.notes) store.notes.set(n.id, n)
  store.categories = snap.categories
  return store
}

function snapshotOf(store: MemoryStore): GuestSnapshot {
  return {
    passages: [...store.passages.values()],
    sessions: [...store.sessions.values()],
    notes: [...store.notes.values()],
    categories: store.categories
  }
}

/** What the guest store holds right now, or null when there is nothing stored. */
export function snapshotGuestStore(
  storage: KeyValueStore | null = defaultStorage(),
  key: string = GUEST_STORE_KEY
): GuestSnapshot | null {
  return readSnapshot(storage, key)
}

/** Forget the guest store — after its notes have been carried into an account. */
export function clearGuestStore(
  storage: KeyValueStore | null = defaultStorage(),
  key: string = GUEST_STORE_KEY
): void {
  try {
    storage?.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Write a snapshot back — used to retry a replay that failed mid-way. */
export function restoreGuestStore(
  snap: GuestSnapshot,
  storage: KeyValueStore | null = defaultStorage(),
  key: string = GUEST_STORE_KEY
): void {
  writeSnapshot(storage, key, snap)
}

export interface MemoryApiOptions {
  /**
   * When set, this api keeps its own store, loaded from `storage` under this
   * key on creation and written back after every mutation. Absent (the dev
   * stub) it shares the module-level maps that seedMemoryApi fills.
   */
  persistKey?: string
  /** Defaults to localStorage; injectable for tests. */
  storage?: KeyValueStore | null
}

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

export function createMemoryApi(options: MemoryApiOptions = {}): BereanApi {
  const { persistKey } = options
  const storage = persistKey
    ? options.storage === undefined
      ? defaultStorage()
      : options.storage
    : null
  // The persisted api owns its store; the dev stub shares MODULE_STORE so
  // seedMemoryApi (which writes the module maps directly) is visible to it.
  const store: MemoryStore = persistKey
    ? storeFromSnapshot(readSnapshot(storage, persistKey))
    : MODULE_STORE
  const { passages, sessions, notes } = store
  // Called after every mutation. A no-op for the dev stub.
  const persist = (): void => {
    if (persistKey) writeSnapshot(storage, persistKey, snapshotOf(store))
  }
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
      persist()
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
      persist()
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
      persist()
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
      // highlighted_text is optional on the INPUT and always present on the
      // note, so the absent case becomes an explicit null rather than
      // undefined — the stub's notes are the ones pure-UI work renders, and a
      // missing key would read as "not loaded" rather than "whole-verse mark".
      const n: Note = {
        id: uuid(),
        created_at: now(),
        updated_at: now(),
        ...data,
        highlighted_text: data.highlighted_text ?? null
      }
      notes.set(n.id, n)
      persist()
      return n
    },

    async updateNote(id, data: UpdateNoteInput) {
      const existing = notes.get(id)
      if (!existing) throw new CodedError('NOTE_NOT_FOUND', `Note ${id} not found`)
      const updated: Note = { ...existing, ...data, updated_at: now() }
      notes.set(id, updated)
      persist()
      return updated
    },

    async deleteNote(id) {
      notes.delete(id)
      persist()
    },

    async deleteNoteAndCascade(id): Promise<DeleteNoteResult> {
      const note = notes.get(id)
      if (!note) return { deletedNoteId: id }
      notes.delete(id)
      persist()
      const result: DeleteNoteResult = { deletedNoteId: id }

      const sessionId = note.session_id
      const sessionEmpty = ![...notes.values()].some(n => n.session_id === sessionId)
      if (!sessionEmpty) return result
      const session = sessions.get(sessionId)
      sessions.delete(sessionId)
      persist()
      result.deletedSessionId = sessionId
      if (!session) return result

      const passageId = session.passage_id
      const passageEmpty = ![...sessions.values()].some(s => s.passage_id === passageId)
      if (!passageEmpty) return result
      passages.delete(passageId)
      persist()
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
      return store.categories
    },

    async saveNoteCategories(defs) {
      // Copied rather than aliased, and archived_at normalised to null the way
      // a column would, so the stub cannot hand a caller back an object the
      // caller still holds a reference to.
      store.categories = defs.map(d => ({ ...d, archived_at: d.archived_at ?? null }))
      persist()
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
  /** A word-level mark: the exact words it was about. Omit for a whole verse. */
  highlighted_text?: string | null
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
          highlighted_text: seedNote.highlighted_text ?? null,
          created_at: at,
          updated_at: at
        }
        notes.set(note.id, note)
      }
    }
  }
}
