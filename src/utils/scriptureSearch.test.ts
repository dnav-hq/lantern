import { describe, expect, it } from 'vitest'
import { MAX_HITS, scanBundle } from './scriptureSearch'

type Bundle = Record<string, Record<string, [number, string][]>>

const DATA: Bundle = {
  '1': {
    '15': [
      [5, 'Then He told him, “So shall your offspring be.”'],
      [6, 'Abram believed the LORD, and it was credited to him as righteousness.']
    ]
  },
  '45': {
    '4': [
      [
        3,
        'For what does the Scripture say? “Abraham believed God, and it was credited to him as righteousness.”'
      ],
      [9, 'Is this blessing only on the circumcised, or also on the uncircumcised?']
    ]
  }
}

const refs = (hits: { bookName: string; chapter: number; verse: number }[]): string[] =>
  hits.map(h => `${h.bookName} ${h.chapter}:${h.verse}`)

describe('scanBundle', () => {
  it('finds a word case-insensitively with the match offsets', () => {
    const { hits, truncated } = scanBundle(DATA, 'Believed')
    expect(truncated).toBe(false)
    expect(refs(hits).sort()).toEqual(['Genesis 15:6', 'Romans 4:3'])
    expect(hits[0].text.slice(hits[0].at[0], hits[0].at[1])).toBe('believed')
  })

  it('finds a phrase and highlights the phrase', () => {
    const { hits } = scanBundle(DATA, 'credited to him')
    expect(hits).toHaveLength(2)
    expect(hits[0].text.slice(hits[0].at[0], hits[0].at[1])).toBe('credited to him')
  })

  it('ignores queries shorter than three characters', () => {
    expect(scanBundle(DATA, 'be').hits).toHaveLength(0)
  })

  it('caps and reports the cap', () => {
    const many = {
      '1': { '1': Array.from({ length: MAX_HITS + 5 }, (_, i) => [i + 1, 'the word']) }
    }
    const r = scanBundle(many as never, 'word')
    expect(r.hits).toHaveLength(MAX_HITS)
    expect(r.truncated).toBe(true)
  })
})

describe('scanBundle — ranking', () => {
  it('ranks a whole-word match above a substring-only match', () => {
    const data: Bundle = {
      '1': {
        '1': [
          [1, 'Great is Your faithfulness, O LORD, morning by morning.'],
          [2, 'Now faith is the assurance of what we hope for.']
        ]
      }
    }
    const { hits } = scanBundle(data, 'faith')
    expect(refs(hits)).toEqual(['Genesis 1:2', 'Genesis 1:1'])
    expect(hits[0].text.slice(hits[0].at[0], hits[0].at[1])).toBe('faith')
  })

  it('ranks the exact phrase first, then all words present, then substrings', () => {
    const data: Bundle = {
      '1': {
        '1': [
          [1, 'Walk by faith and not by sight.'],
          [2, 'The faithful by sight walk slowly.'],
          [3, 'We walk by faith, not by sight.'],
          [4, 'There is no match here at all.']
        ]
      }
    }
    const { hits } = scanBundle(data, 'walk by faith')
    expect(refs(hits)).toEqual(['Genesis 1:1', 'Genesis 1:3', 'Genesis 1:2'])
    expect(hits[0].text.slice(hits[0].at[0], hits[0].at[1])).toBe('Walk by faith')
  })

  it('breaks ties in canonical order', () => {
    const line = 'By faith we understand.'
    const data: Bundle = {
      '45': { '2': [[1, line]], '1': [[7, line]] },
      '40': { '5': [[3, line]] },
      '58': { '11': [[1, line]] }
    }
    expect(refs(scanBundle(data, 'faith').hits)).toEqual([
      'Matthew 5:3',
      'Romans 1:7',
      'Romans 2:1',
      'Hebrews 11:1'
    ])
  })

  it('lets the New Testament prior lift an equal match out of the Old', () => {
    const line = 'By faith we understand.'
    const data: Bundle = {
      '1': { '1': [[1, line]] },
      '58': { '11': [[3, line]] }
    }
    expect(refs(scanBundle(data, 'faith').hits)).toEqual(['Hebrews 11:3', 'Genesis 1:1'])
  })

  it('prefers the shorter verse and the earlier match, all else equal', () => {
    const data: Bundle = {
      '1': {
        '1': [
          [1, 'And so it was that after many days and many long nights of waiting, faith came.'],
          [2, 'Faith came.']
        ]
      }
    }
    expect(refs(scanBundle(data, 'faith').hits)).toEqual(['Genesis 1:2', 'Genesis 1:1'])
  })

  it('reports truncation from the full ranked set, not the scan order', () => {
    const verses: [number, string][] = Array.from({ length: MAX_HITS + 20 }, (_, i) => [
      i + 1,
      'faithfulness endures'
    ])
    const data: Bundle = {
      '1': { '1': verses },
      '58': { '11': [[1, 'Now faith is the assurance.']] }
    }
    const r = scanBundle(data, 'faith')
    expect(r.truncated).toBe(true)
    expect(r.hits).toHaveLength(MAX_HITS)
    expect(refs(r.hits)[0]).toBe('Hebrews 11:1')
  })
})
