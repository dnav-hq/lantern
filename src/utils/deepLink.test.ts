import { describe, it, expect } from 'vitest'
import { buildDeepLink, parseDeepLink } from './deepLink'
import { BIBLE_BOOKS } from './bibleBooks'

describe('parseDeepLink', () => {
  it('resolves a plain book', () => {
    expect(parseDeepLink('/read/genesis/1')).toEqual({ bookNumber: 1, chapter: 1 })
  })

  it('resolves a numbered book by hyphenated slug', () => {
    const john1 = BIBLE_BOOKS.find(b => b.name === '1 John')!
    expect(parseDeepLink('/read/1-john/3')).toEqual({ bookNumber: john1.number, chapter: 3 })
  })

  it('resolves a numbered book given as "1 John" (spaced, %-encoded)', () => {
    const john1 = BIBLE_BOOKS.find(b => b.name === '1 John')!
    expect(parseDeepLink('/read/1%20John/1')).toEqual({ bookNumber: john1.number, chapter: 1 })
  })

  it('resolves a multi-word book by hyphenated slug', () => {
    const song = BIBLE_BOOKS.find(b => b.name === 'Song of Solomon')!
    expect(parseDeepLink('/read/song-of-solomon/2')).toEqual({
      bookNumber: song.number,
      chapter: 2
    })
  })

  it('is case-insensitive and tolerates a trailing slash', () => {
    const john = BIBLE_BOOKS.find(b => b.name === 'John')!
    expect(parseDeepLink('/read/John/3')).toEqual({ bookNumber: john.number, chapter: 3 })
    expect(parseDeepLink('/read/JOHN/3/')).toEqual({ bookNumber: john.number, chapter: 3 })
  })

  it('returns null for an unknown book', () => {
    expect(parseDeepLink('/read/nonsense/1')).toBeNull()
  })

  it('returns null for an out-of-range chapter', () => {
    expect(parseDeepLink('/read/John/999')).toBeNull()
  })

  it('returns null for a non-numeric chapter', () => {
    expect(parseDeepLink('/read/john/abc')).toBeNull()
  })

  it('returns null for a chapter of 0 or negative', () => {
    expect(parseDeepLink('/read/john/0')).toBeNull()
  })

  it('returns null for a malformed path (missing or extra segments)', () => {
    expect(parseDeepLink('/read/john')).toBeNull()
    expect(parseDeepLink('/read')).toBeNull()
    expect(parseDeepLink('/')).toBeNull()
    expect(parseDeepLink('/read/john/3/16/extra')).toBeNull()
  })

  it('returns null when the path does not start with /read', () => {
    expect(parseDeepLink('/study/john/3')).toBeNull()
  })
})

describe('parseDeepLink — verse', () => {
  const john = BIBLE_BOOKS.find(b => b.name === 'John')!

  it('accepts a fourth path segment as the verse', () => {
    expect(parseDeepLink('/read/john/3/16')).toEqual({
      bookNumber: john.number,
      chapter: 3,
      verse: 16
    })
  })

  it('accepts ?v=<verse>', () => {
    expect(parseDeepLink('/read/john/3', '?v=16')).toEqual({
      bookNumber: john.number,
      chapter: 3,
      verse: 16
    })
  })

  it('prefers the path verse over the query verse', () => {
    expect(parseDeepLink('/read/john/3/16', '?v=2')?.verse).toBe(16)
  })

  it('leaves verse out when none is given', () => {
    expect(parseDeepLink('/read/john/3')).toEqual({ bookNumber: john.number, chapter: 3 })
    expect(parseDeepLink('/read/john/3', '?other=1')).toEqual({
      bookNumber: john.number,
      chapter: 3
    })
  })

  it('rejects a non-numeric or non-positive verse', () => {
    expect(parseDeepLink('/read/john/3/abc')).toBeNull()
    expect(parseDeepLink('/read/john/3/0')).toBeNull()
    expect(parseDeepLink('/read/john/3', '?v=x')).toBeNull()
  })

  it('passes an out-of-range verse through (the reading page tolerates it)', () => {
    expect(parseDeepLink('/read/john/3/999')?.verse).toBe(999)
  })
})

describe('buildDeepLink', () => {
  it('builds a hyphenated lowercase slug', () => {
    const john1 = BIBLE_BOOKS.find(b => b.name === '1 John')!
    expect(buildDeepLink(john1.number, 3, 16)).toBe('/read/1-john/3/16')
    expect(buildDeepLink(john1.number, 3)).toBe('/read/1-john/3')
    const song = BIBLE_BOOKS.find(b => b.name === 'Song of Solomon')!
    expect(buildDeepLink(song.number, 2)).toBe('/read/song-of-solomon/2')
  })

  it('leaves out a null or invalid verse', () => {
    expect(buildDeepLink(1, 1, null)).toBe('/read/genesis/1')
    expect(buildDeepLink(1, 1, 0)).toBe('/read/genesis/1')
  })

  it('falls back to / for an unknown book', () => {
    expect(buildDeepLink(99, 1)).toBe('/')
  })

  it('round-trips through parseDeepLink for every book', () => {
    for (const book of BIBLE_BOOKS) {
      const path = buildDeepLink(book.number, book.chapters, 2)
      expect(parseDeepLink(path)).toEqual({
        bookNumber: book.number,
        chapter: book.chapters,
        verse: 2
      })
    }
  })
})
