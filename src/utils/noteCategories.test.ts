import { describe, it, expect } from 'vitest'
import {
  BUILT_IN_CATEGORIES,
  BUILT_IN_KEYS,
  CATEGORY_KEY_SOURCE,
  RESERVED_CATEGORY_KEYS,
  changedFromDefaults,
  isHexColor,
  isValidCategoryKey,
  labelFor,
  resolveCategories
} from './noteCategories'
import { ALL } from './journalFilters'
import { parseNoteLine } from './noteParser'
import type { NoteCategoryDef } from '../types'

// The category set is the retrieval index, so the rules that decide what a
// reader sees have to be safe against partial or bad stored data. Absence must
// mean "defaults", never "no categories at all" — a workspace that renders no
// categories cannot capture a note.

describe('resolveCategories', () => {
  it('returns the built-ins when nothing is stored, which is every workspace today', () => {
    expect(resolveCategories([])).toEqual([...BUILT_IN_CATEGORIES])
  })

  it('overrides one category without dropping the other three', () => {
    const out = resolveCategories([
      { key: 'personal', label: 'Prayer', color: '#111111', sort_order: 3 }
    ])
    expect(out).toHaveLength(4)
    expect(out.find(c => c.key === 'personal')).toEqual({
      key: 'personal',
      label: 'Prayer',
      color: '#111111',
      sort_order: 3
    })
    expect(out.find(c => c.key === 'observation')?.label).toBe('Observation')
  })

  it('respects a customised order', () => {
    const out = resolveCategories([
      { key: 'personal', label: 'Personal', color: '#c05070', sort_order: -1 }
    ])
    expect(out[0].key).toBe('personal')
  })

  it('falls back rather than rendering a category with no name', () => {
    const out = resolveCategories([
      { key: 'personal', label: '   ', color: '#c05070', sort_order: 3 }
    ])
    expect(out.find(c => c.key === 'personal')?.label).toBe('Personal')
  })

  it('falls back rather than trusting a malformed colour', () => {
    const out = resolveCategories([
      { key: 'personal', label: 'Prayer', color: 'not-a-colour', sort_order: 3 }
    ])
    expect(out.find(c => c.key === 'personal')?.color).toBe('#c05070')
  })

  it('ignores a stored key this build cannot render', () => {
    // Forward compatibility: a newer build's custom category must not appear in
    // an older one, where the composer and parser could not apply it.
    const out = resolveCategories([
      { key: 'typology', label: 'Typology', color: '#123456', sort_order: 9 }
    ])
    expect(out.map(c => c.key)).toEqual(['observation', 'historical', 'application', 'personal'])
  })

  it('never returns an empty set, whatever it is given', () => {
    for (const stored of [[], [{ key: 'nope', label: '', color: '', sort_order: 0 }]]) {
      expect(resolveCategories(stored as NoteCategoryDef[]).length).toBe(4)
    }
  })
})

describe('labelFor', () => {
  const cats = resolveCategories([
    { key: 'personal', label: 'Prayer', color: '#c05070', sort_order: 3 }
  ])

  it('uses the customised label', () => {
    expect(labelFor(cats, 'personal')).toBe('Prayer')
  })

  it('passes null through', () => {
    expect(labelFor(cats, null)).toBeNull()
  })

  it('falls back to the key rather than rendering blank', () => {
    // A note whose category was removed still has to show something.
    expect(labelFor(cats, 'typology')).toBe('typology')
  })
})

describe('isHexColor', () => {
  it('accepts six-digit hex only', () => {
    expect(isHexColor('#6b62d6')).toBe(true)
    expect(isHexColor('#ABCDEF')).toBe(true)
    expect(isHexColor('#abc')).toBe(false)
    expect(isHexColor('6b62d6')).toBe(false)
    expect(isHexColor('rgb(1,2,3)')).toBe(false)
  })
})

describe('changedFromDefaults', () => {
  it('stores nothing when nothing was changed', () => {
    expect(changedFromDefaults([...BUILT_IN_CATEGORIES])).toEqual([])
  })

  it('stores only what actually differs', () => {
    const edited = resolveCategories([]).map(c =>
      c.key === 'historical' ? { ...c, label: 'Context' } : c
    )
    const out = changedFromDefaults(edited)
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('historical')
  })

  it('detects a colour-only change', () => {
    const edited = resolveCategories([]).map(c =>
      c.key === 'personal' ? { ...c, color: '#000000' } : c
    )
    expect(changedFromDefaults(edited).map(c => c.key)).toEqual(['personal'])
  })
})

/* ─── What replaced the compiler ──────────────────────────────────────────────
   `NoteCategory` was a closed union of four literals until slice A. Widening it
   to `string` means every one of these rules now compiles whether it holds or
   not, so each one needs a test rather than a type. See src/types/index.ts.
   ──────────────────────────────────────────────────────────────────────────── */
describe('isValidCategoryKey', () => {
  it('accepts every built-in key', () => {
    for (const key of BUILT_IN_KEYS) expect(isValidCategoryKey(key)).toBe(true)
  })

  it('accepts a plausible custom key', () => {
    expect(isValidCategoryKey('typology')).toBe(true)
    expect(isValidCategoryKey('christ-in-the-ot')).toBe(true)
    expect(isValidCategoryKey('psalm119')).toBe(true)
  })

  it('refuses a key the parser could never read back', () => {
    // A key the @tag regex cannot match is a key whose notes lose their
    // category the moment they are re-parsed.
    expect(isValidCategoryKey('')).toBe(false)
    expect(isValidCategoryKey('Typology')).toBe(false)
    expect(isValidCategoryKey('2nd-temple')).toBe(false)
    expect(isValidCategoryKey('my category')).toBe(false)
    expect(isValidCategoryKey('café')).toBe(false)
    expect(isValidCategoryKey('a'.repeat(25))).toBe(false)
    expect(isValidCategoryKey('a'.repeat(24))).toBe(true)
  })

  it("refuses 'all', which the Journal filter already means something by", () => {
    // journalFilters.ALL is the "no category filter" sentinel, so a category
    // keyed 'all' would make its own notes invisible under its own filter.
    expect(RESERVED_CATEGORY_KEYS).toContain(ALL)
    expect(isValidCategoryKey(ALL)).toBe(false)
  })

  it('agrees with what the note parser will actually read back as a tag', () => {
    // The two are built from CATEGORY_KEY_SOURCE for exactly this reason. If
    // they ever drift, a category can be created that no note can carry.
    for (const key of ['typology', 'christ-in-the-ot', 'psalm119', 'observation']) {
      expect(isValidCategoryKey(key)).toBe(true)
      expect(parseNoteLine(`v1 @${key} x`).category).toBe(key)
    }
    expect(new RegExp(`^${CATEGORY_KEY_SOURCE}$`).test('typology')).toBe(true)
  })
})
