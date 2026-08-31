import type {
  Passage,
  JournalEntry,
  Session,
  Note,
  NoteWithPassageInfo,
  NoteSearchResult,
  BiblePassage,
  CreatePassageInput,
  CreateNoteInput,
  UpdateNoteInput,
  DeleteNoteResult
} from '../types'
import type { ThemeId } from '../utils/useTheme'
import type { TranslationId } from '../bible/provider'

// The four existing localStorage-only preferences, mirrored onto the account
// for a signed-in user (docs/proposals/guest-preview-mode.md §2b). Each is
// optional: an account that has never synced has none of them yet, and a
// patch only ever sets the keys it's changing.
export interface UserSettings {
  darkMode?: boolean
  visualTheme?: ThemeId
  translation?: TranslationId
  hideAllNotes?: boolean
}

// Adopt-on-first-sign-in: an account with no settings yet has never synced, so
// seed it from the device's current local values ("your settings came with
// you"). Once the account has any settings, it is the source of truth and
// local should adopt its values instead (last-write-wins is fine for these
// low-stakes prefs). Pure on purpose — this is the one piece of the sync flow
// worth unit-testing without a live database or a rendered component; see
// src/api/settings.test.ts.
export function resolveSettingsAdoption(
  local: UserSettings,
  account: UserSettings
): { action: 'seed' | 'hydrate'; settings: UserSettings } {
  const accountIsEmpty = Object.keys(account).length === 0
  return accountIsEmpty
    ? { action: 'seed', settings: local }
    : { action: 'hydrate', settings: account }
}

// BereanApi is the single choke point for all data access and mutation.
// Components consume it via useApi() (src/api/context.tsx) — never a global.
// Evolved from the legacy Electron window.api surface:
//   - integer ids -> UUID strings
//   - book_id / Books-table methods -> book_number on Passage
//   - dropped: vault, updater, translation-settings
// The future offline outbox slots in behind this interface: a failed write is
// caught here and surfaced as a friendly error, which is exactly what the outbox
// later replaces.
export interface BereanApi {
  // Passages
  getPassages(): Promise<Passage[]>
  getPassagesByBook(bookNumber: number): Promise<Passage[]>
  getPassageById(id: string): Promise<Passage | null>
  createPassage(data: CreatePassageInput): Promise<Passage>
  deletePassageAll(passageId: string): Promise<{ deletedPassageId: string }>
  // Journal listing: every studied passage with note count, last activity and a
  // first-note preview, in one call (the Journal page's only read).
  getJournalEntries(): Promise<JournalEntry[]>

  // Sessions
  getSessionsByPassage(passageId: string): Promise<Session[]>
  createSession(passageId: string): Promise<Session>

  // Notes
  getNotesBySession(sessionId: string): Promise<Note[]>
  getNotesByBook(bookNumber: number): Promise<NoteWithPassageInfo[]>
  // Every note in the workspace, enriched exactly like getNotesByBook but
  // without the book filter — the read behind a study-as-notes-on-a-chapter
  // view that isn't scoped to one book.
  getAllNotes(): Promise<NoteWithPassageInfo[]>
  getNotesByPassage(passageId: string): Promise<Note[]>
  createNote(data: CreateNoteInput): Promise<Note>
  updateNote(id: string, data: UpdateNoteInput): Promise<Note>
  deleteNote(id: string): Promise<void>
  deleteNoteAndCascade(id: string): Promise<DeleteNoteResult>

  // Search: match note content across the whole workspace (case-insensitive
  // substring, v1). Returns each match with the passage context needed to jump
  // to it. Scripture-reference matching is done client-side (parseScriptureQuery)
  // and is NOT part of this method — this searches note text only.
  /**
   * Case-insensitive substring match over note bodies, newest first.
   *
   * `limit` is the caller's, so a caller that wants to say "showing the first
   * N of many" can ask for N+1 and check whether it got them. Silently
   * truncating is how a reader concludes a note is lost.
   */
  searchNotes(query: string, limit?: number): Promise<NoteSearchResult[]>

  // Scripture
  getBibleVerse(reference: string): Promise<BiblePassage | null>

  // Account-synced preferences (docs/proposals/guest-preview-mode.md §2b).
  // localStorage stays the write-through cache/offline mirror in every
  // implementation; these two only exist for the signed-in, account-backed
  // path — updateSettings is a merge patch, not a full replace.
  getSettings(): Promise<UserSettings>
  updateSettings(patch: Partial<UserSettings>): Promise<void>
}
