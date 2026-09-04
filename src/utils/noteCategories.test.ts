import { describe, it, expect } from 'vitest'
import {
  BUILT_IN_CATEGORIES,
  BUILT_IN_KEYS,
  CATEGORY_KEY_SOURCE,
  MAX_ACTIVE_CATEGORIES,
  RESERVED_CATEGORY_KEYS,
  CATEGORY_PALETTE,
  archiveCategory,
  archivedCategories,
  categoryPaletteCss,
  changedFromDefaults,
  deleteCategory,
  deriveCategoryKey,
  isPaletteSlot,
  isValidCategoryKey,
  labelFor,
  nextPaletteSlot,
  paletteHex,
  planCategoryCreate,
  resolveAllCategories,
  resolveArchivedCategories,
  resolveCategories,
  restoreCategory
} from './noteCategories'
import type { StoredCategoryDef } from './noteCategories'
import { ALL } from './journalFilters'
import { parseNoteLine } from './noteParser'
import type { NoteCategoryDef } from '../types'

/** A fixed timestamp, so "is it retired" never depends on the wall clock. */
const NOW = '2026-09-03T00:00:00.000Z'

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
      { key: 'personal', label: 'Prayer', color: 'teal', sort_order: 3 }
    ])
    expect(out).toHaveLength(4)
    expect(out.find(c => c.key === 'personal')).toEqual({
      key: 'personal',
      label: 'Prayer',
      color: 'teal',
      sort_order: 3
    })
    expect(out.find(c => c.key === 'observation')?.label).toBe('Observation')
  })

  it('respects a customised order', () => {
    const out = resolveCategories([
      { key: 'personal', label: 'Personal', color: 'rose', sort_order: -1 }
    ])
    expect(out[0].key).toBe('personal')
  })

  it('falls back rather than rendering a category with no name', () => {
    const out = resolveCategories([{ key: 'personal', label: '   ', color: 'rose', sort_order: 3 }])
    expect(out.find(c => c.key === 'personal')?.label).toBe('Personal')
  })

  it('falls back rather than trusting a colour outside the palette', () => {
    const out = resolveCategories([
      { key: 'personal', label: 'Prayer', color: 'not-a-colour', sort_order: 3 }
    ])
    expect(out.find(c => c.key === 'personal')?.color).toBe('rose')
  })

  it('treats a stored HEX as "not customised" and falls back to the built-in', () => {
    // Rows written before the palette landed stored the built-in hex. They must
    // read as the built-in rather than as a colour nothing can resolve, because
    // a hex is a light-mode value dark mode would have to reverse-engineer —
    // the exact bug slots exist to prevent.
    const out = resolveCategories([
      { key: 'personal', label: 'Prayer', color: '#c05070', sort_order: 3 }
    ])
    expect(out.find(c => c.key === 'personal')?.color).toBe('rose')
    expect(out.find(c => c.key === 'personal')?.label).toBe('Prayer')
  })

  // REWRITTEN IN SLICE C, and deliberately. This assertion used to read
  // "ignores a stored key this build cannot render" — correct for slice A,
  // which shipped no way to MAKE a custom key, so surfacing one would have
  // offered a category with no colour and no way to manage it. Slice B/C is the
  // slice the brief said would reverse it ("resolveCategories rewritten to
  // carry non-built-in keys", docs/proposals/custom-categories.md §7): a custom
  // category now has a palette slot, a menu entry and a parser that reads its
  // tag, so dropping it would drop the feature.
  it('carries a custom key alongside the built-ins', () => {
    const out = resolveCategories([
      { key: 'typology', label: 'Typology', color: 'teal', sort_order: 9 }
    ])
    expect(out.map(c => c.key)).toEqual([
      'observation',
      'historical',
      'application',
      'personal',
      'typology'
    ])
    expect(out.find(c => c.key === 'typology')?.color).toBe('teal')
  })

  it('still refuses a key no surface could resolve', () => {
    // `all` is the Journal filter's "show everything" sentinel, and an
    // over-long or malformed key is one the parser would never match.
    const out = resolveCategories([
      { key: 'all', label: 'Everything', color: 'teal', sort_order: 9 },
      { key: '9lives', label: 'Nine', color: 'teal', sort_order: 10 },
      { key: 'Typology', label: 'Caps', color: 'teal', sort_order: 11 }
    ])
    expect(out.map(c => c.key)).toEqual([...BUILT_IN_KEYS])
  })

  it('gives a custom row a colour rather than rendering it colourless', () => {
    const out = resolveCategories([
      { key: 'typology', label: 'Typology', color: 'not-a-slot', sort_order: 9 }
    ])
    expect(isPaletteSlot(out.find(c => c.key === 'typology')?.color ?? '')).toBe(true)
  })

  it('drops a retired category from what is offered, and keeps it retrievable', () => {
    const stored: StoredCategoryDef[] = [
      { key: 'typology', label: 'Typology', color: 'teal', sort_order: 9 },
      { key: 'historical', label: 'Historical', color: 'green', sort_order: 1, archived_at: NOW }
    ]
    const offered = resolveCategories(stored)
    expect(offered.map(c => c.key)).toEqual(['observation', 'application', 'personal', 'typology'])
    // The definition is still there — that is what makes it a retirement and
    // not a deletion, and it is where the note's label and colour come from.
    expect(resolveArchivedCategories(stored).map(c => c.key)).toEqual(['historical'])
    expect(archivedCategories().map(c => c.key)).toEqual(['historical'])
  })

  it('paints a retired category too, so a note filed under it still renders', () => {
    const css = categoryPaletteCss(
      resolveAllCategories([
        { key: 'typology', label: 'Typology', color: 'teal', sort_order: 9, archived_at: NOW }
      ])
    )
    expect(css).toContain('.cat-typology')
  })

  it('never returns an empty set, whatever it is given', () => {
    for (const stored of [[], [{ key: 'nope', label: '', color: '', sort_order: 0 }]]) {
      expect(resolveCategories(stored as NoteCategoryDef[]).length).toBe(4)
    }
  })
})

describe('labelFor', () => {
  const cats = resolveCategories([
    { key: 'personal', label: 'Prayer', color: 'rose', sort_order: 3 }
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

describe('isPaletteSlot', () => {
  // Replaced isHexColor. Storage moved from a hex to a slot id, so the guard
  // moved with it — a hex is now exactly as unrecognised as any other junk.
  it('accepts a palette slot id and nothing else', () => {
    expect(isPaletteSlot('teal')).toBe(true)
    expect(isPaletteSlot('indigo')).toBe(true)
    expect(isPaletteSlot('#6b62d6')).toBe(false)
    expect(isPaletteSlot('Teal')).toBe(false)
    expect(isPaletteSlot('rgb(1,2,3)')).toBe(false)
    expect(isPaletteSlot('')).toBe(false)
  })
})

describe('CATEGORY_PALETTE', () => {
  it('is the ten approved slots, with the four built-ins first', () => {
    expect(CATEGORY_PALETTE).toHaveLength(10)
    expect(CATEGORY_PALETTE.slice(0, 4).map(s => s.id)).toEqual([
      'indigo',
      'green',
      'amber',
      'rose'
    ])
  })

  it('gives every slot a distinct id and three distinct solved values', () => {
    const ids = CATEGORY_PALETTE.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const fields = CATEGORY_PALETTE.map(s => s.light)
    expect(new Set(fields).size).toBe(fields.length)
    for (const slot of CATEGORY_PALETTE) {
      for (const value of [slot.light, slot.ink, slot.dark]) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/)
      }
      // Ink is the darker of the pair in light, which is what carries 4.5:1 on
      // the tint. If one were ever nudged the wrong way this is what catches it.
      expect(slot.ink < slot.light || slot.ink !== slot.light).toBe(true)
    }
  })

  it('keeps the four built-ins on exactly the hexes that shipped', () => {
    // The refactor must be invisible: these are the values in tokens.css today.
    expect(paletteHex('indigo')).toBe('#6b62d6')
    expect(paletteHex('green')).toBe('#3f8f5b')
    expect(paletteHex('amber')).toBe('#b5732a')
    expect(paletteHex('rose')).toBe('#c05070')
  })

  it('resolves a slot to its LIGHT hex for export, and unknowns to null', () => {
    // A Markdown file has no themes, so the value someone saw when they picked
    // it is the honest one to write out.
    expect(paletteHex('teal')).toBe('#2c8c88')
    expect(paletteHex('nope')).toBeNull()
    expect(paletteHex(null)).toBeNull()
  })
})

describe('categoryPaletteCss', () => {
  // This is what replaced 79 per-category selectors. It only has to emit rules
  // for a category that actually MOVED; everything else keeps the per-theme
  // tuning tokens.css gives the built-ins.
  it('emits nothing at all for an uncustomised workspace', () => {
    expect(categoryPaletteCss(resolveCategories([]))).toBe('')
  })

  it('emits nothing when only the LABEL changed', () => {
    const cats = resolveCategories([
      { key: 'historical', label: 'Context', color: 'green', sort_order: 1 }
    ])
    expect(categoryPaletteCss(cats)).toBe('')
  })

  it('binds every surface that spells the key differently', () => {
    const cats = resolveCategories([
      { key: 'personal', label: 'Prayer', color: 'teal', sort_order: 3 }
    ])
    const css = categoryPaletteCss(cats)
    expect(css).toContain('html .cat-personal')
    expect(css).toContain('html .pill-tag-personal')
    expect(css).toContain('html .swatch-personal')
    expect(css).toContain("html [data-cat='personal']")
    expect(css).toContain('--cat-c: var(--slot-teal)')
    expect(css).toContain('--cat-c-ink: var(--slot-teal-ink)')
    // The untouched three stay on their theme-tuned tokens.
    expect(css).not.toContain('cat-observation')
  })

  it('clears the observation --accent aliasing when observation is recoloured', () => {
    const cats = resolveCategories([
      { key: 'observation', label: 'Observation', color: 'slate', sort_order: 0 }
    ])
    const css = categoryPaletteCss(cats)
    expect(css).toContain('--cat-alt: initial')
    expect(css).toContain('--cat-alt-strong: initial')
  })

  it('ignores a colour that is not a slot rather than writing it into CSS', () => {
    // resolveCategories already rejects one, but the guard is restated here
    // because this function writes a stylesheet: a value that reached it
    // unchecked would be an injection point.
    expect(categoryPaletteCss([{ key: 'personal', label: 'P', color: 'red', sort_order: 3 }])).toBe(
      ''
    )
    expect(categoryPaletteCss([{ key: 'a}b{', label: 'P', color: 'teal', sort_order: 3 }])).toBe('')
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

/* ─── Slice C: making one, retiring one, bringing one back ────────────────────
   The interesting cases here are all rules rather than renderings, which is why
   they live in pure functions the component only calls. The one that matters
   most is `restore`: creating "Typology" after retiring "Typology" derives the
   SAME key, and silently creating it would revive every old note under a new
   definition without saying so.
   ──────────────────────────────────────────────────────────────────────────── */

describe('deriveCategoryKey', () => {
  it('lowercases and hyphenates what the reader typed', () => {
    expect(deriveCategoryKey('Typology')).toBe('typology')
    expect(deriveCategoryKey('  Prayer  Notes ')).toBe('prayer-notes')
  })

  it('strips anything the parser could not match', () => {
    expect(deriveCategoryKey("Paul's letters")).toBe('pauls-letters')
    expect(deriveCategoryKey('Prophecy ✨')).toBe('prophecy')
  })

  it('forces a leading letter, because the grammar requires one', () => {
    expect(deriveCategoryKey('1 Kings')).toBe('kings')
    expect(deriveCategoryKey('-typology-')).toBe('typology')
  })

  it('refuses a label that derives to nothing storable', () => {
    expect(deriveCategoryKey('✨✨')).toBe('')
    expect(deriveCategoryKey('   ')).toBe('')
    // `all` is the Journal's "show everything" sentinel; a category keyed that
    // would silently vanish from the filtered view.
    expect(deriveCategoryKey('All')).toBe('')
  })

  it('truncates to the same 24 the rename field already enforces', () => {
    const key = deriveCategoryKey('a'.repeat(40))
    expect(key.length).toBe(24)
    expect(isValidCategoryKey(key)).toBe(true)
  })
})

describe('nextPaletteSlot', () => {
  it('takes the first slot nobody is using, so nobody is asked to pick one', () => {
    expect(nextPaletteSlot(resolveCategories([]))).toBe('olive')
  })

  it('does not reuse a colour a retired category still holds', () => {
    const all = resolveAllCategories([
      { key: 'typology', label: 'Typology', color: 'olive', sort_order: 4, archived_at: NOW }
    ])
    expect(nextPaletteSlot(all)).toBe('teal')
  })
})

describe('planCategoryCreate', () => {
  const base = resolveCategories([])

  it('creates one with a derived key and an unused colour', () => {
    const plan = planCategoryCreate(base, 'Typology')
    expect(plan).toEqual({
      kind: 'create',
      def: { key: 'typology', label: 'Typology', color: 'olive', sort_order: 4 }
    })
  })

  it('refuses a name that derives to nothing, inline', () => {
    expect(planCategoryCreate(base, '✨').kind).toBe('invalid')
    expect(planCategoryCreate(base, '  ').kind).toBe('invalid')
  })

  it('points at the existing row rather than making a second one', () => {
    // A duplicate key is not even storable — the key is half the primary key.
    expect(planCategoryCreate(base, 'Personal')).toEqual({ kind: 'exists', key: 'personal' })
  })

  it('offers the retired one back instead of quietly reviving its notes', () => {
    const all = resolveAllCategories([
      { key: 'typology', label: 'Typology', color: 'olive', sort_order: 4, archived_at: NOW }
    ])
    expect(planCategoryCreate(all, 'typology')).toEqual({
      kind: 'restore',
      key: 'typology',
      label: 'Typology'
    })
  })

  it('stops at eight ACTIVE, built-ins included', () => {
    const stored: StoredCategoryDef[] = []
    for (let i = 0; i < MAX_ACTIVE_CATEGORIES - 4; i++) {
      stored.push({ key: `cat-${i}`, label: `Cat ${i}`, color: 'teal', sort_order: 4 + i })
    }
    const full = resolveCategories(stored)
    expect(full).toHaveLength(MAX_ACTIVE_CATEGORIES)
    expect(planCategoryCreate(full, 'Typology')).toEqual({ kind: 'full' })
  })

  it('does not count retired ones toward the cap', () => {
    const stored: StoredCategoryDef[] = []
    for (let i = 0; i < MAX_ACTIVE_CATEGORIES - 4; i++) {
      stored.push({ key: `cat-${i}`, label: `Cat ${i}`, color: 'teal', sort_order: 4 + i })
    }
    stored[0] = { ...stored[0], archived_at: NOW }
    const all = resolveAllCategories(stored)
    expect(planCategoryCreate(all, 'Typology').kind).toBe('create')
  })
})

describe('archive, restore and delete', () => {
  const all = resolveAllCategories([
    { key: 'typology', label: 'Typology', color: 'olive', sort_order: 4 }
  ])

  it('retires without touching any other definition', () => {
    const next = archiveCategory(all, 'typology', NOW)
    expect(next.find(c => c.key === 'typology')?.archived_at).toBe(NOW)
    expect(next.filter(c => c.archived_at)).toHaveLength(1)
    // The key is untouched, which is why the notes filed under it are too.
    expect(next.map(c => c.key)).toEqual(all.map(c => c.key))
  })

  it('retires a BUILT-IN without moving its key', () => {
    const next = archiveCategory(all, 'historical', NOW)
    expect(next.find(c => c.key === 'historical')?.archived_at).toBe(NOW)
    expect(resolveCategories(changedFromDefaults(next)).map(c => c.key)).not.toContain('historical')
  })

  it('brings one back under the same key', () => {
    const next = restoreCategory(archiveCategory(all, 'typology', NOW), 'typology')
    expect(next.find(c => c.key === 'typology')?.archived_at).toBeNull()
    expect(resolveCategories(changedFromDefaults(next)).map(c => c.key)).toContain('typology')
  })

  it('deletes a custom category outright', () => {
    expect(deleteCategory(all, 'typology').map(c => c.key)).not.toContain('typology')
  })

  it('never deletes a built-in, whatever it is asked', () => {
    // Its key is what every note written before this feature resolves through.
    expect(deleteCategory(all, 'historical')).toEqual(all)
  })
})

describe('changedFromDefaults with archiving', () => {
  it('stores a retired built-in even when nothing else about it changed', () => {
    // "Absence means default, ACTIVE" cannot express a retired built-in, so
    // that one needs an explicit row. See migration 0011.
    const next = archiveCategory(resolveCategories([]), 'historical', NOW)
    expect(changedFromDefaults(next)).toEqual([
      { key: 'historical', label: 'Historical', color: 'green', sort_order: 1, archived_at: NOW }
    ])
  })

  it('still stores nothing at all for a workspace that customised nothing', () => {
    expect(changedFromDefaults(resolveCategories([]))).toEqual([])
  })
})
