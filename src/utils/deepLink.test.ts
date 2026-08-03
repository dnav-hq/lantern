import { describe, it, expect } from 'vitest'
import { parseDeepLink } from './deepLink'
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

  it('returns null for a malformed path (missing segments)', () => {
    expect(parseDeepLink('/read/john')).toBeNull()
    expect(parseDeepLink('/read')).toBeNull()
    expect(parseDeepLink('/')).toBeNull()
    expect(parseDeepLink('/read/john/3/extra')).toBeNull()
  })

  it('returns null when the path does not start with /read', () => {
    expect(parseDeepLink('/study/john/3')).toBeNull()
  })
})
