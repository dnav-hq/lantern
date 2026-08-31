import { describe, it, expect } from 'vitest'
import { isHighlight, noteKindOf, noteProse } from './noteKind'

// A highlight is a note with no BODY. The subtlety this file exists to pin
// down: a wordless mark is not stored as an empty string. composeNoteContent
// always writes the anchor and the category tag, so a mark on verse 4 is
// stored as "v4 @personal". Testing content === '' would classify every mark
// as a written note whose text had gone missing.

describe('noteProse', () => {
  it('strips a leading verse anchor and the category tag', () => {
    expect(noteProse('v4 @personal Through the valley')).toBe('Through the valley')
  })

  it('is empty for a mark, which is the whole point', () => {
    expect(noteProse('v4 @personal')).toBe('')
    expect(noteProse('v4-5 @observation')).toBe('')
  })

  it('is empty for a mark with no category', () => {
    expect(noteProse('v4')).toBe('')
  })

  it('keeps a verse anchor that is not leading, since that is prose', () => {
    // "compare v12" is something the reader wrote, not the note's own anchor.
    expect(noteProse('v4 @personal compare v12')).toContain('12')
  })

  it('joins multiple lines', () => {
    expect(noteProse('v4 @personal first\nsecond')).toBe('first second')
  })

  it('collapses whitespace rather than leaving ragged text', () => {
    expect(noteProse('v4 @personal  spaced   out ')).toBe('spaced out')
  })
})

describe('isHighlight', () => {
  it('is true for a wordless mark', () => {
    expect(isHighlight({ content: 'v4 @personal' })).toBe(true)
    expect(isHighlight({ content: 'v4' })).toBe(true)
    expect(isHighlight({ content: '' })).toBe(true)
  })

  it('is false as soon as the reader has written anything', () => {
    expect(isHighlight({ content: 'v4 @personal a' })).toBe(false)
    expect(isHighlight({ content: 'no anchor, just prose' })).toBe(false)
  })

  it('stops being a highlight once a body is added', () => {
    // The kind is derived, never stored, so this transition is free and a note
    // can never disagree with itself about what it is.
    const mark = { content: 'v4 @personal' }
    const grown = { content: 'v4 @personal now I have words' }
    expect(noteKindOf(mark)).toBe('highlight')
    expect(noteKindOf(grown)).toBe('note')
  })
})
