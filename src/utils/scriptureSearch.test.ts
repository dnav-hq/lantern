import { describe, expect, it } from 'vitest'
import { MAX_HITS, scanBundle } from './scriptureSearch'

const DATA = {
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
} as Record<string, Record<string, [number, string][]>>

describe('scanBundle', () => {
  it('finds a word case-insensitively, in canonical order, with the match offsets', () => {
    const { hits, truncated } = scanBundle(DATA, 'Believed')
    expect(truncated).toBe(false)
    expect(hits.map(h => `${h.bookName} ${h.chapter}:${h.verse}`)).toEqual([
      'Genesis 15:6',
      'Romans 4:3'
    ])
    expect(hits[0].text.slice(hits[0].at[0], hits[0].at[1])).toBe('believed')
  })
  it('finds a phrase', () => {
    expect(scanBundle(DATA, 'credited to him').hits).toHaveLength(2)
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
