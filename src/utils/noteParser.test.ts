import { describe, it, expect } from 'vitest'
import { parseNoteLine, parseReferenceLabel, parseScriptureQuery } from './noteParser'
import { isHighlight, noteProse } from './noteKind'

// Regression coverage for the tag-parsing layer. The workstream-4 keydown changes
// must NOT touch this behavior — these tests pin it so a regression fails loudly.

describe('parseNoteLine — @ category tags', () => {
  it('recognizes a full @observation tag and extracts the category', () => {
    const p = parseNoteLine('@observation the Word was God')
    expect(p.category).toBe('observation')
    const tag = p.segments.find(s => s.type === 'tag')
    expect(tag?.data?.category).toBe('observation')
    expect(tag?.display).toBe('@observation')
  })

  it('normalizes shorthand tags (@obs, @hist, @app, @per)', () => {
    expect(parseNoteLine('@obs x').category).toBe('observation')
    expect(parseNoteLine('@hist x').category).toBe('historical')
    expect(parseNoteLine('@app x').category).toBe('application')
    expect(parseNoteLine('@per x').category).toBe('personal')
  })

  it('keeps the first tag when several appear', () => {
    expect(parseNoteLine('@application then @personal').category).toBe('application')
  })
})

/* ─── Generic @tag parsing (custom-categories slice A) ────────────────────────
   The tag regex was built from the four built-in keys until 2026-09-01. It now
   matches any key-shaped word, which is the change every other surface depends
   on and the one with silent failure modes: a mark that stops being a mark, a
   tag that stops being a pill, a note filed under the wrong key. These pin all
   three. See docs/proposals/custom-categories.md §3.
   ──────────────────────────────────────────────────────────────────────────── */
describe('parseNoteLine — tags the app has never seen', () => {
  it('parses an unknown key as that key, not as observation', () => {
    // The old parser defaulted every unrecognised tag to 'observation', which
    // could only ever mis-file a note.
    const p = parseNoteLine('v9 @typology the bronze serpent')
    expect(p.category).toBe('typology')
    const tag = p.segments.find(s => s.type === 'tag')
    expect(tag?.raw).toBe('@typology')
    expect(tag?.display).toBe('@typology')
  })

  it('accepts digits and hyphens inside a key', () => {
    expect(parseNoteLine('@christ-in-the-ot fulfilment').category).toBe('christ-in-the-ot')
    expect(parseNoteLine('@psalm119 acrostic').category).toBe('psalm119')
  })

  it('lowercases what the reader typed', () => {
    expect(parseNoteLine('@Typology x').category).toBe('typology')
    expect(parseNoteLine('@OBS x').category).toBe('observation')
  })

  it('does not resolve a key off Object.prototype', () => {
    // A plain-object alias table would hand back Object.prototype.constructor.
    expect(parseNoteLine('@constructor x').category).toBe('constructor')
    expect(parseNoteLine('@tostring x').category).toBe('tostring')
  })

  it('leaves an over-long @word as prose rather than truncating it to a wrong key', () => {
    // 24 is the key-length cap. A longer word does NOT match a truncated key —
    // the trailing \b refuses to land mid-word — so it stays text. Truncating
    // would file the note under a key nobody chose.
    expect(parseNoteLine(`@${'a'.repeat(24)} x`).category).toBe('a'.repeat(24))
    expect(parseNoteLine(`@${'a'.repeat(25)} x`).category).toBeNull()
    expect(parseNoteLine('@abcdefghijklmnopqrstuvwxyz rest').category).toBeNull()
  })

  it('keeps a wordless mark tagged with an unknown key a MARK', () => {
    // The live bug this change fixes: 'v4 @typology' used to parse as text, so
    // noteProse returned "@typology" and the mark rendered as a written note
    // whose entire body was the tag (src/utils/noteKind.ts).
    expect(noteProse('v4 @typology')).toBe('')
    expect(isHighlight({ content: 'v4 @typology' })).toBe(true)
    // and the built-in case it always handled is unchanged.
    expect(isHighlight({ content: 'v4 @personal' })).toBe(true)
    expect(isHighlight({ content: 'v4 @typology worth chasing' })).toBe(false)
  })
})

describe('parseNoteLine — tags versus ordinary prose', () => {
  it('leaves an email address alone', () => {
    // A tag has to START a word, or 'paul@corinth.org' files the note under
    // 'corinth'. This corrects docs/proposals/custom-categories.md §3, which
    // claimed the \b boundary covered this.
    const p = parseNoteLine('v2 ask paul@corinth.org about this')
    expect(p.category).toBeNull()
    expect(p.segments.some(s => s.type === 'tag')).toBe(false)
    expect(noteProse('v2 ask paul@corinth.org about this')).toBe('ask paul@corinth.org about this')
  })

  it('ignores an @ that is not followed by a key-shaped word', () => {
    // A key must start with a letter, so none of these is a tag.
    for (const line of ['cost @ 5 denarii', 'v1 @2nd temple', 'ping @-x', 'a @ b']) {
      expect(parseNoteLine(line).segments.some(s => s.type === 'tag')).toBe(false)
      expect(parseNoteLine(line).category).toBeNull()
    }
  })

  it('DOES treat a bare @word in prose as a tag — the one visible change', () => {
    // Documented in the brief as the single behaviour a reader could notice.
    // It renders as a neutral pill and is stripped from prose exactly like a
    // known tag, so no text is lost; open question §9.4 is whether to keep it.
    const p = parseNoteLine('v3 @dennis said this is key')
    expect(p.category).toBe('dennis')
    expect(noteProse('v3 @dennis said this is key')).toBe('said this is key')
  })

  it('does not swallow the word after a tag', () => {
    const p = parseNoteLine('@personal a hard week')
    expect(p.category).toBe('personal')
    const text = p.segments
      .filter(s => s.type === 'text')
      .map(s => s.raw)
      .join('')
    expect(text).toBe(' a hard week')
  })
})

describe('parseNoteLine — content written under the OLD parser', () => {
  // Every note stores its category as an @tag inside its own content, so a
  // parser regression silently re-files real data. These are the exact shapes
  // composeNoteContent has been writing.
  const legacy: Array<[string, string | null, number | null]> = [
    ['v4 @personal', 'personal', 4],
    ['v1 @historical context here', 'historical', 1],
    ['v3-5 @observation a cluster', 'observation', 3],
    ['v12 @application do this', 'application', 12],
    ['@obs shorthand someone typed', 'observation', null],
    ['v7 @hist the exile', 'historical', 7],
    ['v8 @app and @per together', 'application', 8],
    ['plain prose with no metadata at all', null, null]
  ]

  it.each(legacy)('parses %j exactly as it always did', (content, category, anchor) => {
    const p = parseNoteLine(content)
    expect(p.category).toBe(category)
    expect(p.anchorStart).toBe(anchor)
  })

  it('keeps displaying legacy shorthand under its full name', () => {
    const tag = parseNoteLine('v7 @hist the exile').segments.find(s => s.type === 'tag')
    expect(tag?.raw).toBe('@hist')
    expect(tag?.display).toBe('@historical')
  })
})

describe('parseNoteLine — verse anchors', () => {
  it('parses a single verse anchor (v4)', () => {
    const p = parseNoteLine('v4 the light shines')
    expect(p.anchorStart).toBe(4)
    expect(p.anchorEnd).toBe(4)
    const seg = p.segments.find(s => s.type === 'verse-anchor')
    expect(seg?.data?.startVerse).toBe(4)
  })

  it('parses a verse range (v3-5)', () => {
    const p = parseNoteLine('v3-5 a cluster')
    expect(p.anchorStart).toBe(3)
    expect(p.anchorEnd).toBe(5)
  })

  it('takes the first anchor when several appear', () => {
    const p = parseNoteLine('v2 and later v9')
    expect(p.anchorStart).toBe(2)
    expect(p.anchorEnd).toBe(2)
  })

  it('tags and verse anchors coexist on one line', () => {
    const p = parseNoteLine('v1 @historical context here')
    expect(p.anchorStart).toBe(1)
    expect(p.category).toBe('historical')
  })
})

describe('parseReferenceLabel', () => {
  it('parses a single verse reference', () => {
    expect(parseReferenceLabel('John 3:16')).toEqual({
      chapter_start: 3,
      verse_start: 16,
      chapter_end: 3,
      verse_end: 16
    })
  })

  it('parses a verse range', () => {
    expect(parseReferenceLabel('Matt 5:1-12')).toEqual({
      chapter_start: 5,
      verse_start: 1,
      chapter_end: 5,
      verse_end: 12
    })
  })

  it('returns null for an unparseable reference', () => {
    expect(parseReferenceLabel('not a reference')).toBeNull()
  })
})

describe('parseScriptureQuery — search reference jump', () => {
  it('parses an abbreviation + chapter + verse ("mat 2:13")', () => {
    expect(parseScriptureQuery('mat 2:13')).toEqual([
      { bookNumber: 40, bookName: 'Matthew', chapter: 2, verse: 13, kind: 'verse' }
    ])
  })

  it('parses a full book name + chapter only ("john 1")', () => {
    expect(parseScriptureQuery('john 1')).toEqual([
      { bookNumber: 43, bookName: 'John', chapter: 1, verse: null, kind: 'chapter' }
    ])
  })

  it('parses a numbered book ("1 cor 13:4")', () => {
    expect(parseScriptureQuery('1 cor 13:4')).toEqual([
      { bookNumber: 46, bookName: '1 Corinthians', chapter: 13, verse: 4, kind: 'verse' }
    ])
  })

  it('is case- and whitespace-insensitive', () => {
    expect(parseScriptureQuery('  GEN   3 ')).toEqual([
      { bookNumber: 1, bookName: 'Genesis', chapter: 3, verse: null, kind: 'chapter' }
    ])
  })

  it('clamps an over-large chapter to the book maximum', () => {
    // Jude has a single chapter; asking for 9 clamps to 1.
    expect(parseScriptureQuery('jude 9')[0]?.chapter).toBe(1)
  })

  it('returns a single unambiguous book jump for a bare full name ("matthew")', () => {
    expect(parseScriptureQuery('matthew')).toEqual([
      { bookNumber: 40, bookName: 'Matthew', chapter: 1, verse: null, kind: 'book' }
    ])
  })

  it('returns a single unambiguous book jump for a bare prefix ("matt")', () => {
    expect(parseScriptureQuery('matt')).toEqual([
      { bookNumber: 40, bookName: 'Matthew', chapter: 1, verse: null, kind: 'book' }
    ])
  })

  it('returns a single unambiguous book jump for "rom"', () => {
    expect(parseScriptureQuery('rom')).toEqual([
      { bookNumber: 45, bookName: 'Romans', chapter: 1, verse: null, kind: 'book' }
    ])
  })

  it('returns a single unambiguous book jump for a numbered-book prefix ("1 cor")', () => {
    expect(parseScriptureQuery('1 cor')).toEqual([
      { bookNumber: 46, bookName: '1 Corinthians', chapter: 1, verse: null, kind: 'book' }
    ])
  })

  it('returns multiple ranked results for an ambiguous prefix ("jo")', () => {
    const results = parseScriptureQuery('jo')
    expect(results.length).toBeGreaterThan(1)
    expect(results.length).toBeLessThanOrEqual(5)
    expect(results.every(r => r.kind === 'book' && r.chapter === 1 && r.verse === null)).toBe(true)
    // John's alias list includes the exact alias "jo"; Joel/Jonah/Job/Joshua
    // etc. only startsWith/contains-match "jo" — exact match ranks first.
    expect(results[0].bookName).toBe('John')
  })

  it('caps ambiguous single-letter prefixes ("j") at 5 results, exact/startsWith ordered first', () => {
    const results = parseScriptureQuery('j')
    expect(results.length).toBe(5)
    // Many books have an alias starting with "j" (Joshua "jos", Judges "jdg"
    // no — but "judges"/"jud" etc.); no exact alias is just "j", so ranking
    // falls back to canonical book order (BIBLE_BOOKS / USFM order) among the
    // startsWith matches, capped at 5.
    const names = results.map(r => r.bookName)
    expect(names).toEqual(['Joshua', 'Judges', 'Job', 'Jeremiah', 'Joel'])
  })

  it('returns an empty array for an unknown book', () => {
    expect(parseScriptureQuery('hesitations 3:1')).toEqual([])
  })

  it('returns an empty array for empty input', () => {
    expect(parseScriptureQuery('')).toEqual([])
  })
})
