import { describe, it, expect } from 'vitest'
import {
  adjacentChapter,
  axisLock,
  chapterKeyOf,
  chapterLabel,
  dragOffset,
  swipeDecision,
  SWIPE_AXIS_LOCK,
  SWIPE_COMMIT_FRACTION,
  SWIPE_EDGE_RESISTANCE,
  SWIPE_FLICK_VELOCITY
} from './useChapterNavigation'
import { BIBLE_BOOKS, bookByNumber } from './bibleBooks'

describe('adjacentChapter', () => {
  it('moves within a book', () => {
    expect(adjacentChapter(1, 1, 1)).toEqual({ bookNumber: 1, bookName: 'Genesis', chapter: 2 })
    expect(adjacentChapter(1, 5, -1)).toEqual({ bookNumber: 1, bookName: 'Genesis', chapter: 4 })
  })

  it('rolls forward across a book boundary onto chapter 1', () => {
    // Genesis 50 (its last) → Exodus 1
    expect(adjacentChapter(1, 50, 1)).toEqual({ bookNumber: 2, bookName: 'Exodus', chapter: 1 })
    // The testament seam: Malachi 4 → Matthew 1
    const malachi = BIBLE_BOOKS.find(b => b.name === 'Malachi')!
    expect(adjacentChapter(malachi.number, malachi.chapters, 1)).toEqual({
      bookNumber: malachi.number + 1,
      bookName: 'Matthew',
      chapter: 1
    })
    // The one Dennis named: the end of John into Acts
    const john = BIBLE_BOOKS.find(b => b.name === 'John')!
    expect(adjacentChapter(john.number, john.chapters, 1)).toEqual({
      bookNumber: john.number + 1,
      bookName: 'Acts',
      chapter: 1
    })
  })

  it('rolls backward onto the previous book’s LAST chapter', () => {
    expect(adjacentChapter(2, 1, -1)).toEqual({ bookNumber: 1, bookName: 'Genesis', chapter: 50 })
    const acts = BIBLE_BOOKS.find(b => b.name === 'Acts')!
    const john = bookByNumber(acts.number - 1)!
    expect(adjacentChapter(acts.number, 1, -1)).toEqual({
      bookNumber: john.number,
      bookName: 'John',
      chapter: john.chapters
    })
  })

  it('stops gracefully at the very start and the very end of the canon', () => {
    expect(adjacentChapter(1, 1, -1)).toBeNull()
    const revelation = BIBLE_BOOKS[BIBLE_BOOKS.length - 1]
    expect(revelation.name).toBe('Revelation')
    expect(revelation.chapters).toBe(22)
    expect(adjacentChapter(revelation.number, revelation.chapters, 1)).toBeNull()
    // …but the step just inside either end still works.
    expect(adjacentChapter(revelation.number, revelation.chapters, -1)).toEqual({
      bookNumber: revelation.number,
      bookName: 'Revelation',
      chapter: 21
    })
  })

  it('rejects nonsense inputs rather than inventing a chapter', () => {
    expect(adjacentChapter(0, 1, 1)).toBeNull()
    expect(adjacentChapter(67, 1, 1)).toBeNull()
    expect(adjacentChapter(1, 0, 1)).toBeNull()
    expect(adjacentChapter(1, 51, 1)).toBeNull() // Genesis has 50
    expect(adjacentChapter(1, 1.5, 1)).toBeNull()
    expect(adjacentChapter(1, 1, 0)).toBeNull()
    expect(adjacentChapter(1, 1, 2)).toBeNull()
  })

  it('walks the whole canon end to end without a gap', () => {
    const totalChapters = BIBLE_BOOKS.reduce((sum, b) => sum + b.chapters, 0)
    let ref = { bookNumber: 1, bookName: 'Genesis', chapter: 1 }
    let steps = 1
    for (;;) {
      const next = adjacentChapter(ref.bookNumber, ref.chapter, 1)
      if (!next) break
      // Every step must land back on itself going the other way.
      expect(adjacentChapter(next.bookNumber, next.chapter, -1)).toEqual(ref)
      ref = next
      steps++
    }
    expect(steps).toBe(totalChapters)
    expect(chapterLabel(ref)).toBe('Revelation 22')
  })

  it('labels and keys a chapter', () => {
    const ref = { bookNumber: 43, bookName: 'John', chapter: 3 }
    expect(chapterLabel(ref)).toBe('John 3')
    expect(chapterKeyOf(ref)).toBe('43:3')
  })
})

describe('axisLock', () => {
  it('claims nothing until the finger has actually travelled', () => {
    expect(axisLock(0, 0)).toBe('none')
    expect(axisLock(SWIPE_AXIS_LOCK - 1, SWIPE_AXIS_LOCK - 1)).toBe('none')
  })

  it('gives a mostly-horizontal drag to the swipe and a mostly-vertical one to the scroll', () => {
    expect(axisLock(-40, 6)).toBe('horizontal')
    expect(axisLock(40, -6)).toBe('horizontal')
    expect(axisLock(6, 40)).toBe('vertical')
    expect(axisLock(-6, -40)).toBe('vertical')
    // A perfect diagonal is scrolling — reading beats page-turning on a tie.
    expect(axisLock(30, 30)).toBe('vertical')
  })
})

describe('swipeDecision', () => {
  const width = 390

  it('does nothing for a tap or a tiny drag', () => {
    expect(swipeDecision({ dx: 0, width, elapsedMs: 100 })).toBe(0)
    expect(swipeDecision({ dx: -8, width, elapsedMs: 400 })).toBe(0)
  })

  it('commits a deliberate drag past the distance threshold', () => {
    const past = -(width * SWIPE_COMMIT_FRACTION + 1)
    expect(swipeDecision({ dx: past, width, elapsedMs: 900 })).toBe(1)
    expect(swipeDecision({ dx: -past, width, elapsedMs: 900 })).toBe(-1)
  })

  it('does not commit a slow drag that stopped short', () => {
    const short = -(width * SWIPE_COMMIT_FRACTION - 10)
    expect(swipeDecision({ dx: short, width, elapsedMs: 2000 })).toBe(0)
  })

  it('commits a quick flick that never travelled far', () => {
    // 60px in 100ms = 0.6 px/ms, comfortably over the flick threshold
    expect(swipeDecision({ dx: -60, width, elapsedMs: 100 })).toBe(1)
    expect(swipeDecision({ dx: 60, width, elapsedMs: 100 })).toBe(-1)
  })

  it('ignores a fast but minuscule jitter', () => {
    const velocity = 20 / 10
    expect(velocity).toBeGreaterThan(SWIPE_FLICK_VELOCITY)
    expect(swipeDecision({ dx: -20, width, elapsedMs: 10 })).toBe(0)
  })

  it('survives a zero width or a zero-length gesture', () => {
    expect(swipeDecision({ dx: -200, width: 0, elapsedMs: 100 })).toBe(1)
    expect(swipeDecision({ dx: -200, width, elapsedMs: 0 })).toBe(1)
    expect(swipeDecision({ dx: -10, width, elapsedMs: 0 })).toBe(0)
  })
})

describe('dragOffset', () => {
  it('tracks the finger exactly when there is somewhere to go', () => {
    expect(dragOffset(-120, true)).toBe(-120)
    expect(dragOffset(75, true)).toBe(75)
  })

  it('rubber-bands at a dead end instead of freezing', () => {
    expect(dragOffset(-120, false)).toBeCloseTo(-120 * SWIPE_EDGE_RESISTANCE)
    expect(Math.abs(dragOffset(-120, false))).toBeLessThan(120)
    expect(dragOffset(-120, false)).not.toBe(0)
  })
})
