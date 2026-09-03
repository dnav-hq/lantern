import { describe, expect, it } from 'vitest'
import {
  countRenderings,
  decodeOccurrence,
  groupRenderings,
  hasGloss,
  headWord,
  LEMMA_SHARD_SIZE,
  lemmaShard,
  normalizeRendering,
  packRef,
  strongsKey,
  unpackRef,
  type ParsingEntry,
  type RenderingCount
} from './wordIndex'

// The 73 occurrences of H1892 (hebel) in the BSB Translation Tables, as the
// English the BSB prints for each one. Measured from bsb_tables.tsv on
// 2026-09-02 and pasted verbatim, because this is the worked example the brief
// (sections 9a and 11) and the design session both reason from: 73 occurrences,
// 35 distinct raw forms, 24 once grouped by head word, top group 24 of 73.
//
// It lives here rather than only in the build script's assertions so the numbers
// are checked by `npm test`, with no 85 MB download.
const HEBEL_RENDERINGS = [
  ...Array<string>(20).fill('is futile'),
  ...Array<string>(3).fill('with their worthless idols'),
  ...Array<string>(3).fill('worthless idols'),
  ...Array<string>(3).fill('in vain'),
  ...Array<string>(3).fill('of futilities'),
  ...Array<string>(3).fill('futility'),
  ...Array<string>(3).fill('to be futile'),
  ...Array<string>(3).fill('are worthless'),
  ...Array<string>(2).fill('in futility'),
  ...Array<string>(2).fill('a breath'),
  ...Array<string>(2).fill('Futility'),
  ...Array<string>(2).fill('idols'),
  '[but] a breath',
  'with empty words',
  'empty talk',
  'to worthless idols',
  'exists as but a breath',
  '[is] but a vapor',
  'a vapor',
  'they are but a vapor',
  'are futile',
  'Dishonest',
  'mist',
  'is fleeting',
  'bring futility',
  'his fleeting',
  'In my futile',
  'a futility',
  'of the fleeting',
  'your fleeting',
  'are fleeting',
  'and vanity',
  'by worthless idols',
  'the worthless idols',
  'as we looked in vain',
  'and offer empty'
]

describe('verse references', () => {
  it('packs and unpacks', () => {
    expect(packRef(21, 1, 2)).toBe(21001002)
    expect(unpackRef(packRef(21, 1, 2))).toEqual({ book: 21, chapter: 1, verse: 2 })
    expect(unpackRef(packRef(66, 22, 21))).toEqual({ book: 66, chapter: 22, verse: 21 })
  })

  it('survives the largest reference in the canon (Psalm 119:176)', () => {
    expect(unpackRef(packRef(19, 119, 176))).toEqual({ book: 19, chapter: 119, verse: 176 })
  })

  it('keeps references in canonical order when sorted as numbers', () => {
    const refs = [packRef(21, 1, 2), packRef(1, 1, 1), packRef(19, 119, 176), packRef(1, 10, 1)]
    expect([...refs].sort((a, b) => a - b)).toEqual([
      packRef(1, 1, 1),
      packRef(1, 10, 1),
      packRef(19, 119, 176),
      packRef(21, 1, 2)
    ])
  })
})

describe('strongsKey / lemmaShard', () => {
  it('pads to the four digits STEPBible uses', () => {
    expect(strongsKey('H', '1892')).toBe('H1892')
    expect(strongsKey('H', 1)).toBe('H0001')
    expect(strongsKey('G', '26')).toBe('G0026')
  })

  it('buckets by number so the shard is derivable without a manifest', () => {
    expect(lemmaShard('H1892')).toBe('H07')
    expect(lemmaShard('H0001')).toBe('H00')
    expect(lemmaShard('G0026')).toBe('G00')
    expect(lemmaShard(strongsKey('H', LEMMA_SHARD_SIZE))).toBe('H01')
    expect(lemmaShard('H8674')).toBe('H34')
  })
})

describe('headWord', () => {
  it('strips leading articles, prepositions and copulas', () => {
    expect(headWord('is futile')).toBe('futile')
    expect(headWord('to be futile')).toBe('futile')
    expect(headWord('are futile')).toBe('futile')
    expect(headWord('of the fleeting')).toBe('fleeting')
    expect(headWord('by worthless idols')).toBe('worthless idols')
  })

  it('drops the translators bracketed supplied words', () => {
    expect(headWord('[is] but a vapor')).toBe('vapor')
    expect(headWord('[but] a breath')).toBe('breath')
  })

  it('leaves possessives and pronouns alone, so real differences survive', () => {
    expect(headWord('In my futile')).toBe('my futile')
    expect(headWord('with their worthless idols')).toBe('their worthless idols')
    expect(headWord('they are but a vapor')).toBe('they are but a vapor')
    expect(headWord('his fleeting')).toBe('his fleeting')
  })

  it('never collapses a rendering to nothing', () => {
    expect(headWord('the')).toBe('the')
    expect(headWord('of')).toBe('of')
    expect(headWord('[the]')).toBe('[the]')
    expect(headWord('-')).toBe('-')
  })

  it('case-folds and collapses whitespace', () => {
    expect(headWord('  In   Vain ')).toBe('vain')
    expect(headWord('Futility')).toBe('futility')
  })
})

describe('normalizeRendering', () => {
  it('case-folds and collapses whitespace but keeps brackets', () => {
    expect(normalizeRendering('  Is   Futile ')).toBe('is futile')
    expect(normalizeRendering('[but] a breath')).toBe('[but] a breath')
  })
})

describe('countRenderings and groupRenderings, against the measured H1892 figures', () => {
  const renderings = countRenderings(HEBEL_RENDERINGS)
  const grouped = groupRenderings(renderings)

  it('has the 73 occurrences the brief measured', () => {
    expect(HEBEL_RENDERINGS).toHaveLength(73)
    expect(renderings.reduce((sum, [, n]) => sum + n, 0)).toBe(73)
  })

  it('counts 35 distinct raw forms', () => {
    expect(renderings).toHaveLength(35)
  })

  it('counts 24 head-word groups, with a top group of 24', () => {
    expect(grouped).toHaveLength(24)
    expect(grouped[0]).toEqual(['futile', 24])
  })

  it('keeps both numbers, so the UI can label the grouping as a grouping', () => {
    // The brief's whole point in section 9a decision 1: the raw figure is a fact
    // about the BSB, the grouped one is an editorial transformation. Losing
    // either makes the door dishonest, so they must not be the same array.
    expect(renderings.length).not.toBe(grouped.length)
    expect(grouped.reduce((sum, [, n]) => sum + n, 0)).toBe(73)
  })

  it('orders by count, breaking ties on code points rather than locale', () => {
    expect(renderings[0]).toEqual(['is futile', 20])
    const ones = renderings.filter(([, n]) => n === 1).map(([form]) => form)
    expect(ones).toEqual([...ones].sort())
  })

  it('folds case before counting, so Futility and futility are one form', () => {
    expect(renderings.find(([form]) => form === 'futility')).toEqual(['futility', 5])
    expect(renderings.some(([form]) => form === 'Futility')).toBe(false)
  })
})

describe('decodeOccurrence', () => {
  const parsingTable: ParsingEntry[] = [
    ['Noun - masculine singular construct', 'N-msc'],
    ['Preposition-b | Noun - feminine singular', 'Prep-b | N-fs']
  ]

  it('restores the English and prefers the expanded morphology', () => {
    const entry = { w: ['is futile', 'a breath'] }
    expect(decodeOccurrence(entry, [21001002, 0, 1], parsingTable)).toEqual({
      ref: 21001002,
      book: 21,
      chapter: 1,
      verse: 2,
      english: 'is futile',
      morphology: 'Preposition-b | Noun - feminine singular',
      morphologyCode: 'Prep-b | N-fs'
    })
  })

  it('does not throw on an untagged parse', () => {
    const entry = { w: ['-'] }
    const decoded = decodeOccurrence(entry, [1001001, 0, -1], parsingTable)
    expect(decoded.morphology).toBe('')
    expect(decoded.english).toBe('-')
  })
})

describe('hasGloss', () => {
  it('is false for the 542 lemmas no lexicon covers, and that is not an error', () => {
    expect(hasGloss({ g: [] })).toBe(false)
    expect(hasGloss({ g: ['vanity'] })).toBe(true)
  })
})

describe('countRenderings edge cases', () => {
  it('returns nothing for no renderings', () => {
    expect(countRenderings([])).toEqual([])
    expect(groupRenderings([])).toEqual([])
  })

  it('handles a lemma the BSB does not render separately', () => {
    const counts: RenderingCount[] = countRenderings(['-', '-', '-'])
    expect(counts).toEqual([['-', 3]])
    expect(groupRenderings(counts)).toEqual([['-', 3]])
  })
})
