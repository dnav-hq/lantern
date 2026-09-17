import { describe, expect, it } from 'vitest'

// ── dive-in-2: the map only where the verse earns it ─────────────────────────
import { citationSpan, verseHasMap, type ChapterMap } from './diveMapLoader'

describe('verseHasMap', () => {
  const base: ChapterMap = {
    book: 21,
    chapter: 1,
    places: [{ x: 0, y: 0, name: 'Jerusalem', type: 'settlement', indexes: [7], inVerse: false }],
    placeNames: ['Jerusalem'],
    route: null,
    bearings: [],
    sea: { x: 0, y: 0 },
    versePlaces: { 1: [7], 12: [7], 16: [7] }
  }
  it('is true only for the verses that name a place (Ecclesiastes 1: verses 1, 12, 16)', () => {
    expect(verseHasMap(base, 1)).toBe(true)
    expect(verseHasMap(base, 6)).toBe(false)
    expect(verseHasMap(base, 12)).toBe(true)
  })
  it('is true for a verse a journey leg is cited from, in this chapter only', () => {
    const stop = { order: 1, id: 'a', name: 'A', index: 1, x: 0, y: 0 }
    const withRoute: ChapterMap = {
      ...base,
      book: 48,
      versePlaces: {},
      route: {
        id: 'j',
        title: 'Paul',
        source: 'Galatians 1',
        stops: [stop],
        legs: [
          { from: stop, to: stop, ref: 'Galatians 1:17-18', note: null, silent: false },
          { from: stop, to: stop, ref: null, note: 'silent', silent: true }
        ],
        unlocated: []
      }
    }
    expect(verseHasMap(withRoute, 17)).toBe(true)
    expect(verseHasMap(withRoute, 18)).toBe(true)
    expect(verseHasMap(withRoute, 5)).toBe(false)
    expect(verseHasMap({ ...withRoute, chapter: 2 }, 17)).toBe(false)
  })
})

describe('citationSpan', () => {
  it('reads a verse and a range', () => {
    expect(citationSpan('Galatians 1:21')).toEqual({ chapter: 1, from: 21, to: 21 })
    expect(citationSpan('Genesis 12:4-6')).toEqual({ chapter: 12, from: 4, to: 6 })
    expect(citationSpan('nothing')).toBeNull()
  })
})
