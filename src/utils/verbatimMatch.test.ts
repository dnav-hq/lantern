import { describe, it, expect } from 'vitest'
import { findVerbatimMatch, noteAlternative } from './verbatimMatch'

describe('findVerbatimMatch', () => {
  it('finds the John 1:5 motivating example', () => {
    // docs/proposals/cross-version-renderings.md's archetype: BSB note "Or
    // comprehended", and the KJV really does read it.
    const match = findVerbatimMatch('comprehended', 'the darkness comprehended it not')
    expect(match).not.toBeNull()
    expect('the darkness comprehended it not'.slice(match!.start, match!.end)).toBe('comprehended')
  })

  it('is case-insensitive but indexes into the haystack as given', () => {
    const match = findVerbatimMatch('comprehended', 'Comprehended it the darkness did not')
    expect(match).toEqual({ start: 0, end: 12 })
  })

  it('returns null when the needle does not occur at all', () => {
    expect(findVerbatimMatch('overcome', 'the darkness comprehended it not')).toBeNull()
  })

  it('returns null on a repeated occurrence — no way to say which is meant', () => {
    expect(findVerbatimMatch('the', 'in the beginning was the Word')).toBeNull()
  })

  it('returns null for an empty or whitespace-only needle', () => {
    expect(findVerbatimMatch('', 'the darkness comprehended it not')).toBeNull()
    expect(findVerbatimMatch('   ', 'the darkness comprehended it not')).toBeNull()
  })

  it('matches a whole-word substring, not a bigger word it hides inside', () => {
    // "comprehend" is a substring of "comprehended" — this is intentionally
    // still a match (it IS verbatim text the reader can find), but the span
    // returned is exactly the needle's length, not the whole word.
    const match = findVerbatimMatch('comprehend', 'the darkness comprehended it not')
    expect(match).toEqual({ start: 13, end: 23 })
  })
})

describe('noteAlternative', () => {
  it('extracts the John 1:5 example', () => {
    expect(noteAlternative('Or comprehended')).toBe('comprehended')
  })

  it("takes the whole remainder, not footnoteSpan.ts's precise cut", () => {
    // footnoteSpan.ts's alternativeWordCount would trim this to "Gashmu" — this
    // simpler cut deliberately keeps the aside, which only makes the verbatim
    // check more conservative (see the NOTE_LEAD comment in verbatimMatch.ts).
    expect(noteAlternative('Hebrew Gashmu, a variant of Geshem')).toBe(
      'Gashmu, a variant of Geshem'
    )
  })

  it('returns null when the note has no recognised lead word', () => {
    expect(noteAlternative('A gloss with no lead at all')).toBeNull()
  })

  it('returns null when the lead word is followed by nothing', () => {
    expect(noteAlternative('Or   ')).toBeNull()
  })
})
