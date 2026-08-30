import type { SupabaseClient } from '@supabase/supabase-js'
import type { BereanApi, UserSettings } from './types'
import type {
  Passage,
  Session,
  Note,
  NoteWithPassageInfo,
  NoteSearchResult,
  JournalEntry,
  BiblePassage,
  CreatePassageInput,
  CreateNoteInput,
  UpdateNoteInput,
  DeleteNoteResult
} from '../types'
import { getBibleVerse } from '../bible/service'
import { mirrorKey, readMirror, writeMirror } from '../offline/mirror'
import {
  OfflineError,
  isNetworkError,
  markOffline,
  markOnline,
  emitOfflineToast
} from '../offline/status'
import { uuid } from '../utils/uuid'

// SupabaseBereanApi: the single mutation choke point against Postgres. Every id
// is client-generated (uuid(), crypto.randomUUID with an insecure-context
// fallback) and every timestamp is client-set — the same offline-sync-ready
// contract the memory stub follows. Cascade-downward is handled by ON DELETE
// CASCADE in the DB; the upward emptiness cleanup (empty session -> delete,
// empty passage -> delete) is done explicitly here, mirroring the legacy
// desktop behaviour.

const now = (): string => new Date().toISOString()

// Fields we read back for a Passage. workspace_id is included but the caller
// never needs to set it beyond the resolved personal workspace.
const PASSAGE_COLS =
  'id, workspace_id, book_number, chapter_start, verse_start, chapter_end, verse_end, reference_label, created_at'
const NOTE_COLS =
  'id, session_id, content, anchor_start_verse, anchor_end_verse, anchor_book_override, anchor_chapter_override, category, indent_level, created_at, updated_at'

// PostgREST silently caps any select with no explicit .range() at this many
// rows and returns the truncated page as if it were the whole result — no
// error, no warning. Confirmed for this project in supabase/config.toml
// (`[api] max_rows = 1000`), not assumed. Every list query below that reads
// from a table with no natural small bound (passages/notes grow for as long
// as someone uses the app) pages through with .range() instead of trusting a
// single select to come back complete.
const PAGE_SIZE = 1000

export class SupabaseBereanApi implements BereanApi {
  private readonly db: SupabaseClient
  private readonly workspaceId: string
  private readonly userId: string

  private constructor(db: SupabaseClient, workspaceId: string, userId: string) {
    this.db = db
    this.workspaceId = workspaceId
    this.userId = userId
  }

  // Resolve the signed-in user's personal workspace once and cache it on the
  // instance. Called after login; the resulting api is provided to the tree.
  static async create(db: SupabaseClient): Promise<SupabaseBereanApi> {
    const { data: userData, error: userErr } = await db.auth.getUser()
    if (userErr) throw userErr
    const userId = userData.user?.id
    if (!userId) throw new Error('Not signed in')

    const { data, error } = await db
      .from('workspaces')
      .select('id')
      .eq('kind', 'personal')
      .eq('created_by', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (error) throw error
    return new SupabaseBereanApi(db, data.id as string, userId)
  }

  private assert<T>(data: T | null, error: { message: string } | null): T {
    if (error) throw new Error(error.message)
    if (data === null) throw new Error('No data returned')
    return data
  }

  // Walks a query in PAGE_SIZE chunks via .range(from, to) until a
  // short (or empty) page proves there's nothing left, rather than trusting
  // one select to have returned everything. `build` must construct the query
  // fresh each call — a Postgrest builder is a one-shot thenable, not
  // reusable across pages — and its .order() must be a total order (a
  // tiebreaker column, not just created_at/reference_label alone) so rows
  // that share a sort key can't be skipped or double-counted across the
  // page boundary.
  private async selectAllPages<Row>(
    build: (
      from: number,
      to: number
    ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
  ): Promise<Row[]> {
    const rows: Row[] = []
    let from = 0
    for (;;) {
      const { data, error } = await build(from, from + PAGE_SIZE - 1)
      const page = this.assert(data, error)
      rows.push(...page)
      if (page.length < PAGE_SIZE) return rows
      from += PAGE_SIZE
    }
  }

  // ── Offline plumbing ────────────────────────────────────────────────────
  //
  // Every read funnels through `read()`: run the query, and on success mirror
  // the whole result (write-through) and mark online; on what looks like a
  // network failure, fall back to whatever was last mirrored for this exact
  // key and mark offline (the "Offline — viewing only" pill), rather than
  // surfacing an error to a read-only view. A genuine (non-network) query
  // error still throws.
  //
  // Every mutation funnels through `write()`: on a network failure it marks
  // offline, fires the toast, and throws OfflineError — this is the single
  // choke point the future write outbox replaces (see docs/BACKLOG.md).
  private async read<T>(queryName: string, params: unknown, run: () => Promise<T>): Promise<T> {
    const key = mirrorKey(queryName, params)
    try {
      const result = await run()
      markOnline()
      void writeMirror(key, result)
      return result
    } catch (err) {
      if (!isNetworkError(err)) throw err
      markOffline()
      const mirrored = await readMirror<T>(key)
      if (mirrored !== null) return mirrored
      throw err
    }
  }

  private async write<T>(run: () => Promise<T>): Promise<T> {
    try {
      const result = await run()
      markOnline()
      return result
    } catch (err) {
      if (!isNetworkError(err)) throw err
      markOffline()
      emitOfflineToast()
      throw new OfflineError()
    }
  }

  async getPassages(): Promise<Passage[]> {
    return this.read('getPassages', undefined, async () => {
      return this.selectAllPages<Passage>((from, to) =>
        this.db
          .from('passages')
          .select(PASSAGE_COLS)
          .eq('workspace_id', this.workspaceId)
          .order('reference_label', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      )
    })
  }

  async getPassagesByBook(bookNumber: number): Promise<Passage[]> {
    return this.read('getPassagesByBook', bookNumber, async () => {
      return this.selectAllPages<Passage>((from, to) =>
        this.db
          .from('passages')
          .select(PASSAGE_COLS)
          .eq('workspace_id', this.workspaceId)
          .eq('book_number', bookNumber)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      )
    })
  }

  async getPassageById(id: string): Promise<Passage | null> {
    return this.read('getPassageById', id, async () => {
      const { data, error } = await this.db
        .from('passages')
        .select(PASSAGE_COLS)
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Passage) ?? null
    })
  }

  async createPassage(input: CreatePassageInput): Promise<Passage> {
    return this.write(async () => {
      const row = {
        id: uuid(),
        workspace_id: this.workspaceId,
        created_at: now(),
        ...input
      }
      const { data, error } = await this.db
        .from('passages')
        .insert(row)
        .select(PASSAGE_COLS)
        .single()
      return this.assert(data, error) as Passage
    })
  }

  async deletePassageAll(passageId: string): Promise<{ deletedPassageId: string }> {
    return this.write(async () => {
      // ON DELETE CASCADE removes sessions and notes underneath.
      const { error } = await this.db.from('passages').delete().eq('id', passageId)
      if (error) throw new Error(error.message)
      return { deletedPassageId: passageId }
    })
  }

  async getJournalEntries(): Promise<JournalEntry[]> {
    return this.read('getJournalEntries', undefined, async () => {
      // Two queries: all passages, plus one join query pulling every note's
      // (id, content, created_at, passage_id) in the workspace; aggregate here.
      const passages = await this.getPassages()
      type JournalNoteRow = {
        id: string
        content: string
        created_at: string
        sessions: { passage_id: string } | { passage_id: string }[]
      }
      const rows = await this.selectAllPages<JournalNoteRow>((from, to) =>
        this.db
          .from('notes')
          .select(
            'id, content, created_at, sessions!inner ( passage_id, passages!inner ( workspace_id ) )'
          )
          .eq('sessions.passages.workspace_id', this.workspaceId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      )
      const first = <T>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v)
      const byPassage = new Map<string, { content: string; created_at: string }[]>()
      for (const r of rows) {
        const pid = first(r.sessions).passage_id
        if (!byPassage.has(pid)) byPassage.set(pid, [])
        byPassage.get(pid)!.push({ content: r.content, created_at: r.created_at })
      }
      return passages.map(p => {
        const ns = byPassage.get(p.id) ?? []
        return {
          passage: p,
          note_count: ns.length,
          last_note_at: ns.length ? ns[ns.length - 1].created_at : null,
          preview: ns.length ? ns[0].content : null
        }
      })
    })
  }

  async getSessionsByPassage(passageId: string): Promise<Session[]> {
    return this.read('getSessionsByPassage', passageId, async () => {
      return this.selectAllPages<Session>((from, to) =>
        this.db
          .from('sessions')
          .select('id, passage_id, created_at')
          .eq('passage_id', passageId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to)
      )
    })
  }

  async createSession(passageId: string): Promise<Session> {
    return this.write(async () => {
      const row = { id: uuid(), passage_id: passageId, created_at: now() }
      const { data, error } = await this.db
        .from('sessions')
        .insert(row)
        .select('id, passage_id, created_at')
        .single()
      return this.assert(data, error) as Session
    })
  }

  async getNotesBySession(sessionId: string): Promise<Note[]> {
    return this.read('getNotesBySession', sessionId, async () => {
      return this.selectAllPages<Note>((from, to) =>
        this.db
          .from('notes')
          .select(NOTE_COLS)
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      )
    })
  }

  async getNotesByPassage(passageId: string): Promise<Note[]> {
    return this.read('getNotesByPassage', passageId, async () => {
      const sessions = await this.getSessionsByPassage(passageId)
      const ids = sessions.map(s => s.id)
      if (ids.length === 0) return []
      return this.selectAllPages<Note>((from, to) =>
        this.db
          .from('notes')
          .select(NOTE_COLS)
          .in('session_id', ids)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      )
    })
  }

  async getNotesByBook(bookNumber: number): Promise<NoteWithPassageInfo[]> {
    return this.read('getNotesByBook', bookNumber, async () => {
      // One join query: notes -> sessions -> passages filtered by book + workspace.
      const rows = await this.selectAllPages<Record<string, unknown>>((from, to) =>
        this.db
          .from('notes')
          .select(
            `${NOTE_COLS}, sessions!inner ( passage_id, passages!inner ( workspace_id, book_number, chapter_start, chapter_end, verse_start, verse_end, reference_label, created_at ) )`
          )
          .eq('sessions.passages.workspace_id', this.workspaceId)
          .eq('sessions.passages.book_number', bookNumber)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      )
      return this.mapNotesWithPassageInfo(rows)
    })
  }

  // Every note in the workspace, enriched exactly like getNotesByBook — same
  // join query, just without the book filter. This is the Journal's source of
  // truth, so it must never come back short of a real page: PAGE_SIZE-chunked
  // via .range() rather than one unranged select PostgREST would silently cap.
  async getAllNotes(): Promise<NoteWithPassageInfo[]> {
    return this.read('getAllNotes', undefined, async () => {
      const rows = await this.selectAllPages<Record<string, unknown>>((from, to) =>
        this.db
          .from('notes')
          .select(
            `${NOTE_COLS}, sessions!inner ( passage_id, passages!inner ( workspace_id, book_number, chapter_start, chapter_end, verse_start, verse_end, reference_label, created_at ) )`
          )
          .eq('sessions.passages.workspace_id', this.workspaceId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      )
      return this.mapNotesWithPassageInfo(rows)
    })
  }

  // Nested relations come back as objects (or arrays under some driver
  // versions); normalise defensively. Shared by getNotesByBook and getAllNotes.
  private mapNotesWithPassageInfo(data: unknown): NoteWithPassageInfo[] {
    const first = <T>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v)
    const rows = data as unknown as Array<
      Record<string, unknown> & {
        sessions: { passages: Record<string, unknown> } | { passages: Record<string, unknown> }[]
      }
    >
    return rows.map(r => {
      const p = first(first(r.sessions).passages) as Record<string, unknown>
      const note = { ...r } as Record<string, unknown>
      delete note.sessions
      return {
        ...(note as unknown as Note),
        chapter_start: p.chapter_start as number,
        chapter_end: p.chapter_end as number,
        verse_start: p.verse_start as number,
        verse_end: p.verse_end as number,
        reference_label: p.reference_label as string
      }
    })
  }

  async createNote(input: CreateNoteInput): Promise<Note> {
    return this.write(async () => {
      const ts = now()
      const row = { id: uuid(), created_by: this.userId, created_at: ts, updated_at: ts, ...input }
      const { data, error } = await this.db.from('notes').insert(row).select(NOTE_COLS).single()
      return this.assert(data, error) as Note
    })
  }

  async updateNote(id: string, input: UpdateNoteInput): Promise<Note> {
    return this.write(async () => {
      const { data, error } = await this.db
        .from('notes')
        .update({ ...input, updated_at: now() })
        .eq('id', id)
        .select(NOTE_COLS)
        .single()
      return this.assert(data, error) as Note
    })
  }

  async deleteNote(id: string): Promise<void> {
    return this.write(async () => {
      const { error } = await this.db.from('notes').delete().eq('id', id)
      if (error) throw new Error(error.message)
    })
  }

  async deleteNoteAndCascade(id: string): Promise<DeleteNoteResult> {
    return this.write(async () => {
      // Read the note's session before deleting so we can walk upward.
      const { data: noteRow, error: readErr } = await this.db
        .from('notes')
        .select('id, session_id')
        .eq('id', id)
        .maybeSingle()
      if (readErr) throw new Error(readErr.message)
      if (!noteRow) return { deletedNoteId: id }

      const sessionId = noteRow.session_id as string
      const { error: nDelErr } = await this.db.from('notes').delete().eq('id', id)
      if (nDelErr) throw new Error(nDelErr.message)
      const result: DeleteNoteResult = { deletedNoteId: id }

      // Empty session -> delete it.
      const { count: noteCount, error: cErr } = await this.db
        .from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
      if (cErr) throw new Error(cErr.message)
      if ((noteCount ?? 0) > 0) return result

      const { data: sessionRow } = await this.db
        .from('sessions')
        .select('id, passage_id')
        .eq('id', sessionId)
        .maybeSingle()
      const { error: sDelErr } = await this.db.from('sessions').delete().eq('id', sessionId)
      if (sDelErr) throw new Error(sDelErr.message)
      result.deletedSessionId = sessionId
      if (!sessionRow) return result

      // Empty passage -> delete it.
      const passageId = sessionRow.passage_id as string
      const { count: sessCount, error: scErr } = await this.db
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('passage_id', passageId)
      if (scErr) throw new Error(scErr.message)
      if ((sessCount ?? 0) > 0) return result

      const { error: pDelErr } = await this.db.from('passages').delete().eq('id', passageId)
      if (pDelErr) throw new Error(pDelErr.message)
      result.deletedPassageId = passageId
      return result
    })
  }

  async searchNotes(query: string): Promise<NoteSearchResult[]> {
    const q = query.trim()
    if (!q) return []
    return this.read('searchNotes', q, async () => {
      // v1: case-insensitive substring match via ilike, joined up to the
      // owning passage for the workspace filter + result context. A Postgres
      // full-text index is a future optimization (see docs/BACKLOG.md).
      // `%` and `_` are ilike wildcards — escape them so a literal query with
      // those characters still matches literally.
      const escaped = q.replace(/[\\%_]/g, m => `\\${m}`)
      const { data, error } = await this.db
        .from('notes')
        .select(
          `${NOTE_COLS}, sessions!inner ( passage_id, passages!inner ( workspace_id, book_number, reference_label ) )`
        )
        .eq('sessions.passages.workspace_id', this.workspaceId)
        .ilike('content', `%${escaped}%`)
        .order('updated_at', { ascending: false })
        .limit(50)
      const first = <T>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v)
      const rows = this.assert(data, error) as unknown as Array<
        Record<string, unknown> & {
          sessions:
            | { passage_id: string; passages: Record<string, unknown> }
            | { passage_id: string; passages: Record<string, unknown> }[]
        }
      >
      return rows.map(r => {
        const sess = first(r.sessions)
        const p = first(sess.passages) as Record<string, unknown>
        const note = { ...r } as Record<string, unknown>
        delete note.sessions
        return {
          note: note as unknown as Note,
          passage_id: sess.passage_id,
          book_number: p.book_number as number,
          reference_label: p.reference_label as string
        }
      })
    })
  }

  async getBibleVerse(reference: string): Promise<BiblePassage | null> {
    // Scripture is not Supabase data — it's fetched client-side from BSB via
    // helloao (cached forever in IndexedDB, see src/bible/cache.ts), which has
    // its own cache-forever fallback, so it isn't routed through the notes
    // mirror here. Delegate to the shared lookup so both this and the memory
    // stub share one implementation.
    return getBibleVerse(reference)
  }

  async getSettings(): Promise<UserSettings> {
    return this.read('getSettings', undefined, async () => {
      const { data, error } = await this.db
        .from('profiles')
        .select('settings')
        .eq('id', this.userId)
        .single()
      if (error) throw new Error(error.message)
      return (data?.settings ?? {}) as UserSettings
    })
  }

  async updateSettings(patch: Partial<UserSettings>): Promise<void> {
    return this.write(async () => {
      // Merge-patch, not a full replace: read the current blob and apply the
      // patch on top before writing back. Fine to be read-modify-write rather
      // than a single atomic statement — these are low-stakes, last-write-wins
      // prefs (docs/proposals/guest-preview-mode.md §2b), never notes.
      const { data: current, error: readError } = await this.db
        .from('profiles')
        .select('settings')
        .eq('id', this.userId)
        .single()
      if (readError) throw new Error(readError.message)
      const merged = { ...((current?.settings ?? {}) as UserSettings), ...patch }
      const { error } = await this.db
        .from('profiles')
        .update({ settings: merged })
        .eq('id', this.userId)
      if (error) throw new Error(error.message)
    })
  }
}
