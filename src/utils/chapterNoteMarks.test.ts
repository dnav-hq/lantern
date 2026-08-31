import { describe, it, expect } from 'vitest'
import { chapterNoteCategories, chapterOfNote } from './chapterNoteMarks'
import type { NoteWithPassageInfo } from '../types'

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
    created_at: '2026-01-01T00:00:00.000Z',
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

describe('chapterOfNote', () => {
  it('uses the passage chapter by default', () => {
    expect(chapterOfNote(note({ chapter_start: 8 }))).toBe(8)
  })

  it('honours a per-note chapter override', () => {
    // The bug this fixes: reading chapter_start directly marked the wrong
    // chapter in the strip and left the right one unmarked.
    expect(chapterOfNote(note({ chapter_start: 8, anchor_chapter_override: 12 }))).toBe(12)
  })
})

describe('chapterNoteCategories', () => {
  it('marks every chapter that has a note', () => {
    const marks = chapterNoteCategories([note({ chapter_start: 8 }), note({ chapter_start: 12 })])
    expect([...marks.keys()].sort((a, b) => a - b)).toEqual([8, 12])
  })

  it('marks a chapter reached only through an override', () => {
    const marks = chapterNoteCategories([note({ chapter_start: 8, anchor_chapter_override: 3 })])
    expect(marks.has(3)).toBe(true)
    expect(marks.has(8)).toBe(false)
  })

  it('colours by the dominant category in that chapter', () => {
    const marks = chapterNoteCategories([
      note({ chapter_start: 8, category: 'observation' }),
      note({ chapter_start: 8, category: 'personal' }),
      note({ chapter_start: 8, category: 'personal' })
    ])
    expect(marks.get(8)).toBe('personal')
  })

  it('keeps chapters independent of each other', () => {
    const marks = chapterNoteCategories([
      note({ chapter_start: 8, category: 'personal' }),
      note({ chapter_start: 9, category: 'historical' })
    ])
    expect(marks.get(8)).toBe('personal')
    expect(marks.get(9)).toBe('historical')
  })

  it('marks the chapter but picks no colour when nothing is categorised', () => {
    const marks = chapterNoteCategories([note({ chapter_start: 8, category: null })])
    expect(marks.has(8)).toBe(true)
    expect(marks.get(8)).toBeNull()
  })

  it('ignores uncategorised notes when choosing the colour', () => {
    const marks = chapterNoteCategories([
      note({ chapter_start: 8, category: null }),
      note({ chapter_start: 8, category: null }),
      note({ chapter_start: 8, category: 'application' })
    ])
    expect(marks.get(8)).toBe('application')
  })

  it('breaks a tie stably, by first appearance rather than iteration luck', () => {
    const notes = [
      note({ chapter_start: 8, category: 'historical' }),
      note({ chapter_start: 8, category: 'personal' })
    ]
    expect(chapterNoteCategories(notes).get(8)).toBe('historical')
    // Same input, same answer, every time.
    expect(chapterNoteCategories(notes).get(8)).toBe('historical')
  })

  it('handles an empty set without inventing marks', () => {
    expect(chapterNoteCategories([]).size).toBe(0)
  })
})
