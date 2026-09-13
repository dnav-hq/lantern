import { describe, it, expect } from 'vitest'
import { findHighlightSpan, trimToWordBoundaries } from './highlightSpan'

// These tests are the guardrail on the ONE claim the whole feature rests on:
// that a miss is indistinguishable from today's behaviour. A word-level mark is
// stored as a quote and re-located in whatever translation is on screen, so the
// matcher is allowed to find nothing — but it is never allowed to find the WRONG
// words, because a mark on words the reader did not choose is worse than the
// whole-verse tint it replaces. See docs/proposals/word-level-highlights.md §2.

const BSB_GEN_1_3 = 'And God said, "Let there be light," and there was light.'

describe('findHighlightSpan', () => {
  it('finds the exact words, and the span points at them in the original text', () => {
    const span = findHighlightSpan(BSB_GEN_1_3, 'Let there be light')
    expect(span).not.toBeNull()
    expect(BSB_GEN_1_3.slice(span!.start, span!.end)).toBe('Let there be light')
  })

  it('matches case-insensitively', () => {
    const span = findHighlightSpan(BSB_GEN_1_3, 'let THERE be LIGHT')
    expect(BSB_GEN_1_3.slice(span!.start, span!.end)).toBe('Let there be light')
  })

  it('matches across a whitespace difference, including a newline in the verse', () => {
    const verse = 'And God said,\n "Let  there\tbe light,"'
    const span = findHighlightSpan(verse, 'Let there be light')
    expect(span).not.toBeNull()
    // Maps back to the ORIGINAL offsets, odd whitespace and all.
    expect(verse.slice(span!.start, span!.end)).toBe('Let  there\tbe light')
  })

  it('returns null when the words are not in this translation — the verse tint falls back', () => {
    // The KJV of the same verse. "said, Let there be light" is there, but the
    // phrase a reader marked in another translation may simply not be.
    const kjv = 'And God said, Let there be light: and there was light.'
    expect(findHighlightSpan(kjv, 'God spoke and it was so')).toBeNull()
  })

  it('returns null when the words occur TWICE — there is no honest choice', () => {
    // "light" is in this verse twice; tinting the wrong one is worse than
    // tinting the verse.
    expect(findHighlightSpan(BSB_GEN_1_3, 'light')).toBeNull()
    // The longer phrase around the first occurrence is still unique.
    expect(findHighlightSpan(BSB_GEN_1_3, 'there be light')).not.toBeNull()
  })

  it('treats an empty, blank or absent quote as a whole-verse mark', () => {
    expect(findHighlightSpan(BSB_GEN_1_3, null)).toBeNull()
    expect(findHighlightSpan(BSB_GEN_1_3, '')).toBeNull()
    expect(findHighlightSpan(BSB_GEN_1_3, '   ')).toBeNull()
  })

  it('ignores whitespace around the stored quote', () => {
    const span = findHighlightSpan(BSB_GEN_1_3, '  there be light \n')
    expect(BSB_GEN_1_3.slice(span!.start, span!.end)).toBe('there be light')
  })

  it('finds a phrase at the very end of the verse', () => {
    const span = findHighlightSpan(BSB_GEN_1_3, 'there was light')
    expect(span!.end).toBe(BSB_GEN_1_3.length - 1) // the closing full stop is not marked
    expect(BSB_GEN_1_3.slice(span!.start, span!.end)).toBe('there was light')
  })
})

describe('trimToWordBoundaries', () => {
  it('keeps a clean word selection as it is', () => {
    expect(trimToWordBoundaries(BSB_GEN_1_3, 'Let there be light')).toBe('Let there be light')
  })

  it('grows a part-word selection out to whole words', () => {
    // A dragged handle landing mid-word: "et there be ligh".
    expect(trimToWordBoundaries(BSB_GEN_1_3, 'et there be ligh')).toBe('Let there be light')
  })

  it('drops punctuation the selection swallowed at either end', () => {
    expect(trimToWordBoundaries(BSB_GEN_1_3, '"Let there be light,"')).toBe('Let there be light')
    expect(trimToWordBoundaries(BSB_GEN_1_3, 'said, "Let')).toBe('said, "Let')
  })

  it('collapses the whitespace a selection picked up', () => {
    expect(trimToWordBoundaries('Let  there\nbe light', ' there\nbe ')).toBe('there be')
  })

  it('returns null for an empty or punctuation-only selection', () => {
    expect(trimToWordBoundaries(BSB_GEN_1_3, '')).toBeNull()
    expect(trimToWordBoundaries(BSB_GEN_1_3, '   ')).toBeNull()
    expect(trimToWordBoundaries(BSB_GEN_1_3, ',"')).toBeNull()
  })

  it('still trims a selection it cannot locate in the verse', () => {
    // The text on screen changed under the selection; the edge trim still runs.
    expect(trimToWordBoundaries('a different verse', '"nothing like it,"')).toBe('nothing like it')
  })

  it('produces a quote the matcher can find again', () => {
    const quote = trimToWordBoundaries(BSB_GEN_1_3, 'here be ligh')
    expect(quote).toBe('there be light')
    expect(findHighlightSpan(BSB_GEN_1_3, quote)).not.toBeNull()
  })
})
