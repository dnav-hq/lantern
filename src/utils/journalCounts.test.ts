import { describe, it, expect } from 'vitest'
import { chapterCountLabel } from './journalCounts'

// A mark is a property of a verse, not a note. The Journal's chapter row used
// to say "1 note" for a chapter holding one highlight and no writing — the one
// place the Journal contradicted the rest of the product (desktop sweep,
// finding 10).
const note = { highlight: false }
const mark = { highlight: true }

describe('chapterCountLabel', () => {
  it('counts notes alone', () => {
    expect(chapterCountLabel([note])).toBe('1 note')
    expect(chapterCountLabel([note, note, note])).toBe('3 notes')
  })

  it('never calls a mark a note', () => {
    expect(chapterCountLabel([mark])).toBe('1 mark')
    expect(chapterCountLabel([mark, mark])).toBe('2 marks')
  })

  it('reports both when a chapter has both, rather than one total', () => {
    expect(chapterCountLabel([note, note, mark])).toBe('2 notes · 1 mark')
    expect(chapterCountLabel([note, mark, mark])).toBe('1 note · 2 marks')
  })
})
