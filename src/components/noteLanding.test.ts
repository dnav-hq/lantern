import { describe, it, expect } from 'vitest'
import { noteLanding } from './GlobalSearch'
import type { NoteSearchResult, Note } from '../types'

// Where a note search result takes you. Under the note-centric model a passage
// is invisible interim storage, so "open the study" was never an honest
// destination — the honest one is the chapter, at the verse the note is
// anchored to. See docs/proposals/journal-retrieval.md §3.2, which calls this
// "the single highest-value line of the whole brief".

function result(over: Partial<Note> & { reference_label?: string; book_number?: number } = {}) {
  const note = {
    id: 'n1',
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
    ...over
  } as unknown as Note
  return {
    note,
    passage_id: 'p1',
    book_number: over.book_number ?? 45,
    reference_label: over.reference_label ?? 'Romans 8'
  } as NoteSearchResult
}

describe('noteLanding', () => {
  it('resolves a chapter-only label', () => {
    expect(noteLanding(result())).toEqual({ bookName: 'Romans', chapter: 8, verse: null })
  })

  it('carries the anchored verse, which is the point', () => {
    expect(noteLanding(result({ anchor_start_verse: 28 }))).toEqual({
      bookName: 'Romans',
      chapter: 8,
      verse: 28
    })
  })

  it('parses a label with a verse range without mistaking it for the chapter', () => {
    expect(noteLanding(result({ reference_label: 'Romans 8:28-30' }))).toEqual({
      bookName: 'Romans',
      chapter: 8,
      verse: null
    })
  })

  it('handles books whose names start with a number', () => {
    expect(noteLanding(result({ reference_label: '1 Corinthians 13:4', book_number: 46 }))).toEqual(
      { bookName: '1 Corinthians', chapter: 13, verse: null }
    )
    expect(noteLanding(result({ reference_label: '3 John 1', book_number: 64 }))).toEqual({
      bookName: '3 John',
      chapter: 1,
      verse: null
    })
  })

  it('handles multi-word book names', () => {
    expect(
      noteLanding(result({ reference_label: 'Song of Solomon 2:1', book_number: 22 }))
    ).toEqual({ bookName: 'Song of Solomon', chapter: 2, verse: null })
  })

  it("prefers the note's own chapter override over the label", () => {
    // The override exists precisely because a note can be anchored somewhere
    // other than where its passage row says.
    expect(
      noteLanding(result({ reference_label: 'Romans 8', anchor_chapter_override: 12 }))
    ).toEqual({ bookName: 'Romans', chapter: 12, verse: null })
  })

  it('returns null rather than guessing when the book is unknown', () => {
    expect(noteLanding(result({ book_number: 999 }))).toBeNull()
  })

  it('returns null when no chapter can be read from the label', () => {
    expect(noteLanding(result({ reference_label: 'Romans' }))).toBeNull()
  })
})
