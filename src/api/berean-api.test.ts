import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseBereanApi } from './berean-api'

// getAllNotes() (and the rest of the list queries in berean-api.ts) used to
// run a single unranged .select(), which PostgREST silently caps at its
// project-configured `max_rows` (confirmed 1000 — see supabase/config.toml
// `[api] max_rows`) rather than erroring. Past that ceiling, older notes just
// stopped coming back from the Journal with no signal anything was wrong.
//
// This mock simulates BOTH code paths against the exact same dataset so one
// test file proves both halves of the fix:
//   - awaiting the query chain directly (no .range() call) resolves to
//     exactly what real PostgREST does: the first SIMULATED_MAX_ROWS rows,
//     silently truncated — this is what the old implementation got.
//   - calling .range(from, to) resolves to the correctly sliced page — this
//     is what the paging implementation uses.
// Running this file's tests against the pre-fix berean-api.ts (no .range()
// calls anywhere) reproduces the truncation and fails; against the current
// paged implementation it passes. See PR description for the before/after run.

const SIMULATED_MAX_ROWS = 1000

type NoteRow = Record<string, unknown>

function buildNoteRow(index: number, createdAtMs: number): NoteRow {
  const createdAt = new Date(createdAtMs).toISOString()
  return {
    id: `note-${String(index).padStart(6, '0')}`,
    session_id: 'session-1',
    content: `note body ${index}`,
    anchor_start_verse: null,
    anchor_end_verse: null,
    anchor_book_override: null,
    anchor_chapter_override: null,
    category: null,
    indent_level: 0,
    created_at: createdAt,
    updated_at: createdAt,
    sessions: {
      passage_id: 'passage-1',
      passages: {
        workspace_id: 'ws-1',
        book_number: 43,
        chapter_start: 1,
        chapter_end: 1,
        verse_start: 1,
        verse_end: 1,
        reference_label: 'John 1:1',
        created_at: createdAt
      }
    }
  }
}

// Rows pre-sorted the way a real `.order('created_at').order('id')` clause
// would return them — the mock doesn't run SQL, so the ordering has to be
// baked into the array it slices from.
function buildSortedNotes(count: number): NoteRow[] {
  const base = Date.parse('2026-01-01T00:00:00.000Z')
  return Array.from({ length: count }, (_, i) => buildNoteRow(i, base + i * 1000))
}

interface NotesMock {
  db: SupabaseClient
  rangeCallCount: () => number
}

function makeNotesMock(rows: NoteRow[]): NotesMock {
  let rangeCalls = 0

  function makeBuilder(): Record<string, unknown> {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      range: (from: number, to: number) => {
        rangeCalls += 1
        // Guards the "terminates rather than looping forever" assertion: a
        // buggy page-walk that never notices a short/empty page would hit
        // this long before a real request timeout would, turning a hang into
        // a fast, readable failure.
        if (rangeCalls > 10) {
          throw new Error('range() called more than 10 times — page walk did not terminate')
        }
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
      },
      // No .range() in the chain = the pre-fix code path. Real PostgREST
      // silently truncates an unranged select at max_rows instead of erroring.
      then: (
        resolve: (value: { data: NoteRow[]; error: null }) => void,
        reject: (reason: unknown) => void
      ) =>
        Promise.resolve({ data: rows.slice(0, SIMULATED_MAX_ROWS), error: null }).then(
          resolve,
          reject
        )
    }
    return builder
  }

  return {
    db: { from: () => makeBuilder() } as unknown as SupabaseClient,
    rangeCallCount: () => rangeCalls
  }
}

function makeApi(db: SupabaseClient): SupabaseBereanApi {
  // The constructor is private (workspace resolution happens in the async
  // `create()` factory, which needs a live auth+workspaces round trip this
  // test isn't exercising) — construct directly to drive getAllNotes() in
  // isolation against a fixed workspace/user id.
  return Reflect.construct(SupabaseBereanApi, [db, 'ws-1', 'user-1']) as SupabaseBereanApi
}

describe('SupabaseBereanApi.getAllNotes — pagination past the PostgREST row ceiling', () => {
  it('fully returns a dataset larger than one page, in created_at ascending order', async () => {
    const total = SIMULATED_MAX_ROWS + 5
    const { db } = makeNotesMock(buildSortedNotes(total))
    const api = makeApi(db)

    const notes = await api.getAllNotes()

    expect(notes).toHaveLength(total)
    expect(notes[0].content).toBe('note body 0')
    expect(notes[notes.length - 1].content).toBe(`note body ${total - 1}`)
    const timestamps = notes.map(n => n.created_at)
    expect(timestamps).toEqual([...timestamps].sort())
  })

  it('terminates on an exact page-multiple dataset instead of looping on the empty final page', async () => {
    const total = SIMULATED_MAX_ROWS * 2
    const { db, rangeCallCount } = makeNotesMock(buildSortedNotes(total))
    const api = makeApi(db)

    const notes = await api.getAllNotes()

    expect(notes).toHaveLength(total)
    // Two full pages plus the empty page that proves it stopped: 3 calls,
    // not an unbounded/never-ending series of them.
    expect(rangeCallCount()).toBe(3)
  })

  it('returns a small dataset (below the ceiling) unchanged and in the same order', async () => {
    const { db } = makeNotesMock(buildSortedNotes(3))
    const api = makeApi(db)

    const notes = await api.getAllNotes()

    expect(notes.map(n => n.content)).toEqual(['note body 0', 'note body 1', 'note body 2'])
  })
})
