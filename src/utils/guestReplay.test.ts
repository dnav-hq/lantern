import { describe, it, expect } from 'vitest'
import { planGuestReplay, guestSnapshotHasNotes, replayGuestSnapshot } from './guestReplay'
import { createMemoryApi, type GuestSnapshot } from '../api/memory'
import type { Note } from '../types'

// The sign-in handoff: a guest snapshot becomes the create calls the real
// api accepts, in the guest's order, with every field intact.

function note(id: string, session_id: string, created_at: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    session_id,
    content: `note ${id}`,
    anchor_start_verse: 1,
    anchor_end_verse: 1,
    anchor_book_override: null,
    anchor_chapter_override: null,
    category: 'observation',
    indent_level: 0,
    highlighted_text: null,
    created_at,
    updated_at: created_at,
    ...extra
  }
}

const snapshot: GuestSnapshot = {
  passages: [
    {
      id: 'p2',
      workspace_id: 'g',
      book_number: 1,
      chapter_start: 1,
      verse_start: 1,
      chapter_end: 1,
      verse_end: 3,
      reference_label: 'Genesis 1:1-3',
      created_at: '2026-10-02T00:00:00.000Z'
    },
    {
      id: 'p1',
      workspace_id: 'g',
      book_number: 43,
      chapter_start: 1,
      verse_start: 1,
      chapter_end: 1,
      verse_end: 5,
      reference_label: 'John 1:1-5',
      created_at: '2026-10-01T00:00:00.000Z'
    },
    {
      id: 'p-empty',
      workspace_id: 'g',
      book_number: 19,
      chapter_start: 23,
      verse_start: 1,
      chapter_end: 23,
      verse_end: 1,
      reference_label: 'Psalm 23:1',
      created_at: '2026-10-03T00:00:00.000Z'
    }
  ],
  sessions: [
    { id: 's1', passage_id: 'p1', created_at: '2026-10-01T00:00:00.000Z' },
    { id: 's1b', passage_id: 'p1', created_at: '2026-10-01T01:00:00.000Z' },
    { id: 's2', passage_id: 'p2', created_at: '2026-10-02T00:00:00.000Z' }
  ],
  notes: [
    note('n3', 's1b', '2026-10-01T03:00:00.000Z', { indent_level: 1, category: 'personal' }),
    note('n1', 's1', '2026-10-01T01:00:00.000Z', { highlighted_text: 'the Word' }),
    note('n2', 's1', '2026-10-01T02:00:00.000Z', {
      anchor_start_verse: 4,
      anchor_end_verse: 5,
      anchor_book_override: 'Genesis',
      anchor_chapter_override: 1,
      category: null
    }),
    note('n4', 's2', '2026-10-02T01:00:00.000Z'),
    note('orphan', 'no-such-session', '2026-10-02T02:00:00.000Z')
  ],
  categories: [{ key: 'observation', label: 'Seen', color: '#6b62d6', sort_order: 0 }]
}

describe('planGuestReplay', () => {
  const plan = planGuestReplay(snapshot)

  it('orders passages by creation and skips ones with no notes', () => {
    expect(plan.passages.map(p => p.passage.reference_label)).toEqual([
      'John 1:1-5',
      'Genesis 1:1-3'
    ])
  })

  it('folds every session of a passage into one note list in created_at order', () => {
    expect(plan.passages[0].notes.map(n => n.content)).toEqual(['note n1', 'note n2', 'note n3'])
  })

  it('preserves every CreateNoteInput field, including word-level highlights', () => {
    expect(plan.passages[0].notes[0]).toEqual({
      content: 'note n1',
      anchor_start_verse: 1,
      anchor_end_verse: 1,
      anchor_book_override: null,
      anchor_chapter_override: null,
      category: 'observation',
      indent_level: 0,
      highlighted_text: 'the Word'
    })
    expect(plan.passages[0].notes[1]).toMatchObject({
      anchor_start_verse: 4,
      anchor_end_verse: 5,
      anchor_book_override: 'Genesis',
      anchor_chapter_override: 1,
      category: null
    })
    expect(plan.passages[0].notes[2]).toMatchObject({ indent_level: 1, category: 'personal' })
  })

  it('maps the passage fields the input type accepts and nothing else', () => {
    expect(plan.passages[1].passage).toEqual({
      book_number: 1,
      chapter_start: 1,
      verse_start: 1,
      chapter_end: 1,
      verse_end: 3,
      reference_label: 'Genesis 1:1-3'
    })
  })

  it('drops notes with no session to anchor to and counts the rest', () => {
    expect(plan.noteCount).toBe(4)
    expect(plan.categories).toHaveLength(1)
  })

  it('guestSnapshotHasNotes is false for null and for an empty store', () => {
    expect(guestSnapshotHasNotes(null)).toBe(false)
    expect(guestSnapshotHasNotes({ passages: [], sessions: [], notes: [], categories: [] })).toBe(
      false
    )
    expect(guestSnapshotHasNotes(snapshot)).toBe(true)
  })
})

describe('replayGuestSnapshot', () => {
  it('recreates the journal through the api with fresh ids', async () => {
    const store = new Map<string, string>()
    const api = createMemoryApi({
      persistKey: 'replay-target',
      storage: {
        getItem: k => store.get(k) ?? null,
        setItem: (k, v) => void store.set(k, v),
        removeItem: k => void store.delete(k)
      }
    })
    const created = await replayGuestSnapshot(api, snapshot)
    expect(created).toBe(4)
    const all = await api.getAllNotes()
    expect(all.map(n => n.content)).toEqual(['note n1', 'note n2', 'note n3', 'note n4'])
    expect(all.every(n => !['n1', 'n2', 'n3', 'n4'].includes(n.id))).toBe(true)
    expect(all[0].highlighted_text).toBe('the Word')
    expect(all[3].reference_label).toBe('Genesis 1:1-3')
    expect(await api.getNoteCategories()).toHaveLength(1)
  })

  it('does not overwrite categories an account already customised', async () => {
    const api = createMemoryApi({ persistKey: 'replay-target-2', storage: null })
    await api.saveNoteCategories([{ key: 'mine', label: 'Mine', color: '#336699', sort_order: 0 }])
    await replayGuestSnapshot(api, snapshot)
    expect((await api.getNoteCategories()).map(c => c.key)).toEqual(['mine'])
  })
})
