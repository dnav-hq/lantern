import { describe, it, expect } from 'vitest'
import {
  buildExportFiles,
  compareNotes,
  groupByBook,
  noteReference,
  resolveExportCategories,
  safeFilename,
  serializeBookMarkdown
} from './export'
import type { NoteCategoryDef, NoteWithPassageInfo } from '../types'

// Export is a trust precondition, not a feature: the durable anger in this
// category is about custody, not functionality. So these tests are mostly about
// FIDELITY — that nothing a reader wrote is silently dropped on the way out.
// See docs/proposals/journal-retrieval.md §4.

let seq = 0
function note(over: Partial<NoteWithPassageInfo> = {}): NoteWithPassageInfo {
  seq += 1
  return {
    id: `n${seq}`,
    session_id: 's1',
    content: 'a note',
    anchor_start_verse: null,
    anchor_end_verse: null,
    anchor_book_override: null,
    anchor_chapter_override: null,
    category: null,
    indent_level: 0,
    created_at: `2026-01-0${(seq % 9) + 1}T00:00:00.000Z`,
    updated_at: null,
    book_number: 45,
    chapter_start: 8,
    chapter_end: 8,
    verse_start: 1,
    verse_end: 39,
    reference_label: 'Romans 8',
    ...over
  } as NoteWithPassageInfo
}

describe('safeFilename', () => {
  it('replaces characters that are illegal in filenames', () => {
    expect(safeFilename('Romans 8:1-11')).toBe('Romans 8.1-11')
    expect(safeFilename('a/b\\c?d*e"f|g<h>i')).toBe('abcdefghi')
  })
})

describe('noteReference', () => {
  it('renders a single verse, a range, and a whole-chapter anchor', () => {
    expect(noteReference(note({ anchor_start_verse: 28 }))).toBe('8:28')
    expect(noteReference(note({ anchor_start_verse: 28, anchor_end_verse: 30 }))).toBe('8:28-30')
    expect(noteReference(note())).toBe('8')
  })

  it('honours a per-note chapter override', () => {
    expect(noteReference(note({ anchor_chapter_override: 12, anchor_start_verse: 2 }))).toBe('12:2')
  })

  it('does not render a range when end equals start', () => {
    expect(noteReference(note({ anchor_start_verse: 5, anchor_end_verse: 5 }))).toBe('8:5')
  })
})

describe('compareNotes', () => {
  it('orders by chapter, then verse, with whole-chapter notes first', () => {
    const notes = [
      note({ anchor_chapter_override: 9, anchor_start_verse: 1 }),
      note({ anchor_chapter_override: 8, anchor_start_verse: 30 }),
      note({ anchor_chapter_override: 8, anchor_start_verse: null }),
      note({ anchor_chapter_override: 8, anchor_start_verse: 2 })
    ]
    const order = [...notes].sort(compareNotes).map(n => noteReference(n))
    expect(order).toEqual(['8', '8:2', '8:30', '9:1'])
  })

  it('falls back to creation time for two notes on the same verse', () => {
    const older = note({ anchor_start_verse: 1, created_at: '2026-01-01T00:00:00.000Z' })
    const newer = note({ anchor_start_verse: 1, created_at: '2026-06-01T00:00:00.000Z' })
    expect([newer, older].sort(compareNotes).map(n => n.id)).toEqual([older.id, newer.id])
  })
})

describe('groupByBook', () => {
  it('groups in canon order and names the books', () => {
    const notes = [
      note({ book_number: 45, reference_label: 'Romans 8' }),
      note({ book_number: 1, reference_label: 'Genesis 1' }),
      note({ book_number: 19, reference_label: 'Psalms 23' })
    ]
    expect(groupByBook(notes).map(g => g.bookName)).toEqual(['Genesis', 'Psalms', 'Romans'])
  })

  it('includes no book the reader has not written in', () => {
    expect(groupByBook([note({ book_number: 45 })]).map(g => g.bookNumber)).toEqual([45])
  })

  it('degrades to a numbered name rather than dropping an unknown book', () => {
    // Losing notes because a book number is unrecognised would be the exact
    // failure this whole feature exists to prevent.
    const groups = groupByBook([note({ book_number: 999 })])
    expect(groups).toHaveLength(1)
    expect(groups[0].bookName).toBe('Book 999')
  })
})

describe('serializeBookMarkdown', () => {
  it('groups by chapter under headings, in reading order', () => {
    const md = serializeBookMarkdown('Romans', [
      note({ anchor_chapter_override: 9, anchor_start_verse: 1, content: 'nine' }),
      note({ anchor_chapter_override: 8, anchor_start_verse: 28, content: 'twenty-eight' })
    ])
    expect(md).toContain('# Romans')
    expect(md.indexOf('## Romans 8')).toBeLessThan(md.indexOf('## Romans 9'))
    expect(md.indexOf('twenty-eight')).toBeLessThan(md.indexOf('nine'))
  })

  it('carries the reference, the category and the date — the fields the old format dropped', () => {
    const md = serializeBookMarkdown('Romans', [
      note({
        anchor_start_verse: 28,
        category: 'observation',
        content: 'wider than comfortable',
        created_at: '2026-06-22T10:00:00.000Z'
      })
    ])
    expect(md).toContain('8:28')
    expect(md).toContain('observation')
    expect(md).toContain('2026-06-22')
    expect(md).toContain('wider than comfortable')
  })

  it('omits the category cleanly rather than writing "null"', () => {
    const md = serializeBookMarkdown('Romans', [note({ category: null, content: 'x' })])
    expect(md).not.toContain('null')
  })

  it('preserves sub-note nesting as list indentation', () => {
    const md = serializeBookMarkdown('Romans', [
      note({ anchor_start_verse: 28, content: 'parent', indent_level: 0 }),
      note({ anchor_start_verse: 28, content: 'child', indent_level: 1 })
    ])
    const childLine = md.split('\n').find(l => l.includes('child'))!
    expect(childLine.startsWith('  -')).toBe(true)
  })

  it('keeps a multi-line note readable under its own bullet', () => {
    const md = serializeBookMarkdown('Romans', [note({ content: 'first line\nsecond line' })])
    expect(md).toContain('first line')
    expect(md).toContain('second line')
  })

  it('exports under the current label, not the internal key', () => {
    const md = serializeBookMarkdown(
      'Romans',
      [note({ category: 'observation', content: 'x' })],
      [{ key: 'observation', label: 'Christ in the OT', color: 'indigo', sort_order: 0 }]
    )
    expect(md).toContain('Christ in the OT')
    expect(md).not.toContain('observation')
  })

  it('exports a custom category under its own label', () => {
    const md = serializeBookMarkdown(
      'Romans',
      [note({ category: 'typology', content: 'x' })],
      [{ key: 'typology', label: 'Typology', color: 'teal', sort_order: 4 }]
    )
    expect(md).toContain('Typology')
  })

  it('falls back to the raw key for a category with no definition at all', () => {
    const md = serializeBookMarkdown('Romans', [note({ category: 'ghost', content: 'x' })], [])
    expect(md).toContain('ghost')
  })
})

describe('resolveExportCategories', () => {
  it('resolves a renamed built-in to its new label', () => {
    const resolved = resolveExportCategories([
      { key: 'observation', label: 'Christ in the OT', color: 'indigo', sort_order: 0 }
    ])
    expect(resolved.find(c => c.key === 'observation')?.label).toBe('Christ in the OT')
  })

  it('keeps the other three built-ins at their defaults', () => {
    const resolved = resolveExportCategories([
      { key: 'observation', label: 'Renamed', color: 'indigo', sort_order: 0 }
    ])
    expect(resolved.map(c => c.key).sort()).toEqual([
      'application',
      'historical',
      'observation',
      'personal'
    ])
  })

  it('carries a custom category through, unlike resolveCategories', () => {
    const stored: NoteCategoryDef[] = [
      { key: 'typology', label: 'Typology', color: 'teal', sort_order: 4 }
    ]
    const resolved = resolveExportCategories(stored)
    expect(resolved.find(c => c.key === 'typology')).toEqual({
      key: 'typology',
      label: 'Typology',
      color: 'teal',
      sort_order: 4
    })
  })
})

describe('buildExportFiles', () => {
  const notes = [
    note({ book_number: 45, content: 'romans note' }),
    note({
      book_number: 1,
      content: 'genesis note',
      reference_label: 'Genesis 1',
      chapter_start: 1
    })
  ]

  it('writes one Markdown file per book, plus the JSON', () => {
    const files = buildExportFiles(notes)
    expect(Object.keys(files).sort()).toEqual(['notes.json', 'notes/Genesis.md', 'notes/Romans.md'])
  })

  it('loses nothing: every note appears in the JSON with all its fields', () => {
    const parsed = JSON.parse(buildExportFiles(notes)['notes.json'])
    expect(parsed.note_count).toBe(2)
    expect(parsed.notes).toHaveLength(2)
    expect(parsed.format).toBe('lantern-notes-v1')
    for (const key of ['id', 'content', 'category', 'indent_level', 'created_at', 'book_number']) {
      expect(parsed.notes[0]).toHaveProperty(key)
    }
  })

  it('describes the same notes in the same order in both formats', () => {
    const files = buildExportFiles([
      note({ book_number: 45, anchor_start_verse: 30, content: 'later' }),
      note({ book_number: 45, anchor_start_verse: 2, content: 'earlier' })
    ])
    const md = files['notes/Romans.md']
    expect(md.indexOf('earlier')).toBeLessThan(md.indexOf('later'))
    const json = JSON.parse(files['notes.json'])
    expect(json.notes.map((n: { content: string }) => n.content)).toEqual(['earlier', 'later'])
  })

  it('produces a valid, empty-but-honest export when there are no notes', () => {
    const files = buildExportFiles([])
    expect(Object.keys(files)).toEqual(['notes.json'])
    expect(JSON.parse(files['notes.json']).note_count).toBe(0)
  })

  it('resolves a category colour to its light hex, not the slot id — a file has no themes', () => {
    const files = buildExportFiles(notes, [
      { key: 'observation', label: 'Observation', color: 'indigo', sort_order: 0 }
    ])
    const json = JSON.parse(files['notes.json'])
    expect(json.categories[0].color).toBe('#6b62d6')
  })
})
