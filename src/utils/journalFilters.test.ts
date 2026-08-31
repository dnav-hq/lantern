import { describe, it, expect } from 'vitest'
import {
  ALL,
  NO_FILTERS,
  applyJournalFilters,
  booksPresent,
  categoriesPresent,
  emptyResultMessage,
  hasActiveFilter,
  type JournalFilters
} from './journalFilters'

const BUILT_INS = ['observation', 'historical', 'application', 'personal'] as const

interface Note {
  id: string
  category: string | null
}
interface Entry {
  key: string
  bookNumber: number | null
  notes: Note[]
}

const entries: Entry[] = [
  {
    key: 'rom-8',
    bookNumber: 45,
    notes: [
      { id: 'a', category: 'observation' },
      { id: 'b', category: 'personal' }
    ]
  },
  { key: 'gen-1', bookNumber: 1, notes: [{ id: 'c', category: 'observation' }] },
  { key: 'ecc-1', bookNumber: 21, notes: [{ id: 'd', category: null }] }
]

describe('categoriesPresent', () => {
  it('returns only categories actually used, in the preferred order', () => {
    expect(categoriesPresent(entries, BUILT_INS)).toEqual(['observation', 'personal'])
  })

  it('appends unknown categories alphabetically, so user-owned ones need no second pass', () => {
    const withCustom = [
      ...entries,
      { key: 'x', bookNumber: 2, notes: [{ id: 'e', category: 'typology' }] },
      { key: 'y', bookNumber: 3, notes: [{ id: 'f', category: 'prayer' }] }
    ]
    expect(categoriesPresent(withCustom, BUILT_INS)).toEqual([
      'observation',
      'personal',
      'prayer',
      'typology'
    ])
  })

  it('ignores null categories rather than offering a blank option', () => {
    expect(categoriesPresent([{ bookNumber: 1, notes: [{ id: 'a', category: null }] }])).toEqual([])
  })
})

describe('booksPresent', () => {
  it('lists only books written in, in canon order, with real names', () => {
    expect(booksPresent(entries)).toEqual([
      { number: 1, name: 'Genesis' },
      { number: 21, name: 'Ecclesiastes' },
      { number: 45, name: 'Romans' }
    ])
  })

  it('skips entries whose book could not be resolved', () => {
    expect(booksPresent([{ bookNumber: null, notes: [{ id: 'a', category: null }] }])).toEqual([])
  })

  it('never returns a book the reader has not written in', () => {
    const numbers = booksPresent(entries).map(b => b.number)
    expect(numbers).not.toContain(43) // John — untouched in the fixture
    expect(numbers).toHaveLength(3)
  })
})

describe('applyJournalFilters', () => {
  it('returns the same array identity when nothing is filtered', () => {
    expect(applyJournalFilters(entries, NO_FILTERS)).toBe(entries)
  })

  it('filters by book at the entry level', () => {
    const out = applyJournalFilters(entries, { category: ALL, bookNumber: 45 })
    expect(out.map(e => e.key)).toEqual(['rom-8'])
    expect(out[0].notes).toHaveLength(2)
  })

  it('filters by category at the note level and drops emptied entries', () => {
    const out = applyJournalFilters(entries, { category: 'personal', bookNumber: ALL })
    expect(out.map(e => e.key)).toEqual(['rom-8'])
    expect(out[0].notes.map(n => n.id)).toEqual(['b'])
  })

  it('composes both axes', () => {
    expect(
      applyJournalFilters(entries, { category: 'observation', bookNumber: 1 }).map(e => e.key)
    ).toEqual(['gen-1'])
    expect(applyJournalFilters(entries, { category: 'personal', bookNumber: 1 })).toEqual([])
  })

  it('does not clone entries the category filter leaves untouched', () => {
    // Book-only filtering must preserve identity so untouched rows don't re-render.
    const out = applyJournalFilters(entries, { category: ALL, bookNumber: 45 })
    expect(out[0]).toBe(entries[0])
  })
})

describe('hasActiveFilter', () => {
  it('is false only when nothing is set', () => {
    expect(hasActiveFilter(NO_FILTERS)).toBe(false)
    expect(hasActiveFilter({ category: 'personal', bookNumber: ALL })).toBe(true)
    expect(hasActiveFilter({ category: ALL, bookNumber: 1 })).toBe(true)
  })
})

describe('emptyResultMessage', () => {
  const cases: Array<[JournalFilters, { category?: string; book?: string }, string]> = [
    [NO_FILTERS, {}, 'No notes yet.'],
    [{ category: 'personal', bookNumber: ALL }, { category: 'Personal' }, 'No personal notes yet.'],
    [{ category: ALL, bookNumber: 45 }, { book: 'Romans' }, 'No notes in Romans yet.'],
    [
      { category: 'personal', bookNumber: 45 },
      { category: 'Personal', book: 'Romans' },
      'No personal notes in Romans.'
    ]
  ]

  it.each(cases)('names the filter that caused the emptiness', (filters, labels, expected) => {
    expect(emptyResultMessage(filters, labels)).toBe(expected)
  })

  it('never renders a bare void', () => {
    for (const [filters, labels] of cases) {
      expect(emptyResultMessage(filters, labels).length).toBeGreaterThan(0)
    }
  })
})
