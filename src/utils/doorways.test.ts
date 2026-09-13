import { describe, expect, it } from 'vitest'
import {
  buildDoorways,
  connectionsDoorwayLabel,
  doorwayTranslit,
  leadWord,
  mapDoorwayLabel,
  wordDoorwayLabel
} from './doorways'
import type { ParsingEntry, VerseWord } from './wordIndex'

// Real rows out of public/bible/words/verses/1.json.gz and 21.json.gz; the
// parsing ids are remapped onto the small table below.
const PARSING: ParsingEntry[] = [
  [
    'Conjunctive waw | Verb - Piel - Conjunctive imperfect Cohortative - first person common singular',
    ''
  ],
  ['Verb - Piel - Participle - masculine plural construct | second person masculine singular', ''],
  ['Noun - masculine singular construct', ''],
  ['Article | Noun - feminine singular', ''],
  ['Conjunctive waw | Verb - Nifal - Conjunctive perfect - third person common plural', ''],
  ['Preposition-k | Pronoun - relative', '']
]

const GEN_12_3: VerseWord[] = [
  ['I will bless', 'H1288', 'wa·’ă·ḇā·ră·ḵāh', 0],
  ['those who bless you', 'H1288', 'mə·ḇā·rə·ḵe·ḵā', 1],
  ['and all', 'H3605', 'kōl', 2],
  ['of the earth', 'H0127', 'hā·’ă·ḏā·māh', 3],
  ['will be blessed', 'H1288', 'wə·niḇ·rə·ḵū', 4]
]

describe('leadWord', () => {
  it('leads with the lemma the verse says most often', () => {
    const lead = leadWord(GEN_12_3, PARSING)
    expect(lead?.lead.strongs).toBe('H1288')
    expect(lead?.count).toBe(3)
  })

  it('breaks ties in verse order', () => {
    const words: VerseWord[] = [
      ['the earth', 'H0127', 'hā·’ă·ḏā·māh', 3],
      ['all', 'H3605', 'kōl', 2]
    ]
    expect(leadWord(words, PARSING)?.lead.strongs).toBe('H0127')
  })

  it('is null where the verse has only grammar or nothing at all', () => {
    expect(leadWord([], PARSING)).toBeNull()
    expect(leadWord([['When', 'H0834', 'ka·’ă·šer', 5]], PARSING)).toBeNull()
  })
})

describe('labels', () => {
  it('strips the syllable dots the row uses as its separator', () => {
    expect(doorwayTranslit('hă·ḇêl')).toBe('hăḇêl')
  })

  it('names the word and its count in the verse', () => {
    const lead = leadWord(GEN_12_3, PARSING)!
    expect(wordDoorwayLabel(lead)).toBe('wa’ăḇārăḵāh · 3× here')
    expect(wordDoorwayLabel({ lead: lead.lead, count: 1 })).toBe('wa’ăḇārăḵāh · once here')
  })

  it('handles quote and echo singulars and plurals, and drops zeros', () => {
    expect(connectionsDoorwayLabel({ count: 6, quotes: 2, echoes: 4, top: 0 })).toBe(
      '2 quotes · 4 echoes'
    )
    expect(connectionsDoorwayLabel({ count: 1, quotes: 1, echoes: 0, top: 0 })).toBe('1 quote')
    expect(connectionsDoorwayLabel({ count: 4, quotes: 0, echoes: 4, top: 0 })).toBe('4 echoes')
    expect(connectionsDoorwayLabel({ count: 1, quotes: 0, echoes: 1, top: 0 })).toBe('1 echo')
    expect(connectionsDoorwayLabel({ count: 3, quotes: 0, echoes: 0, top: 0 })).toBe(
      '3 connections'
    )
  })

  it('words the map door as the chapter, never the verse', () => {
    expect(mapDoorwayLabel({ places: 8 })).toBe('8 places in this chapter')
    expect(mapDoorwayLabel({ places: 1 })).toBe('1 place in this chapter')
  })
})

describe('buildDoorways', () => {
  const word = leadWord(GEN_12_3, PARSING)!

  it('is empty when nothing is behind the verse', () => {
    expect(buildDoorways({})).toEqual([])
    expect(buildDoorways({ word: null, connections: null, map: null })).toEqual([])
    expect(buildDoorways({ map: { places: 0 } })).toEqual([])
    expect(buildDoorways({ connections: { count: 0, quotes: 0, echoes: 0, top: 0 } })).toEqual([])
  })

  it('orders word → connections → map regardless of arrival', () => {
    const row = buildDoorways({
      map: { places: 8 },
      connections: { count: 6, quotes: 2, echoes: 4, top: 0 },
      word
    })
    expect(row.map(d => d.kind)).toEqual(['word', 'connections', 'map'])
    expect(row.map(d => d.label)).toEqual([
      'wa’ăḇārăḵāh · 3× here',
      '2 quotes · 4 echoes',
      '8 places in this chapter'
    ])
  })

  it('renders a thin row for a thin verse', () => {
    expect(buildDoorways({ word, connections: null, map: { places: 0 } })).toEqual([
      { kind: 'word', label: 'wa’ăḇārăḵāh · 3× here' }
    ])
  })
})
