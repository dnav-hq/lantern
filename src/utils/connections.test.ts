import { describe, it, expect } from 'vitest'
import {
  classifyConnection,
  connectionsCacheKey,
  hasConnectionsDoor,
  QUOTE_MIN_WORDS,
  SALIENCE_MIN_SCORE,
  verseTokens
} from './connections'
import type { VerseConnection } from '../bible/provider'

// Real BSB text, so the classifier is checked against the sentences it will
// actually meet rather than against strings written to make it pass.
const GEN_15_6 = 'Abram believed the LORD, and it was credited to him as righteousness.'
const ROM_4_3 =
  'For what does the Scripture say? “Abraham believed God, and it was credited to him as ' +
  'righteousness.”'
const JAS_2_23 =
  'And the Scripture was fulfilled that says, “Abraham believed God, and it was credited to ' +
  'him as righteousness,” and he was called a friend of God.'
const PSA_106_31 = 'It was credited to him as righteousness for endless generations to come.'
const HEB_11_8 =
  'By faith Abraham, when called to go to a place he would later receive as his inheritance, ' +
  'obeyed and went, without knowing where he was going.'

const connection = (score: number): VerseConnection => ({ book: 45, chapter: 4, verse: 3, score })

describe('verseTokens', () => {
  it('drops the stop words and keeps everything else in order', () => {
    expect(verseTokens('And it was in the house of God').map(t => t.word)).toEqual([
      'it',
      'house',
      'god'
    ])
  })

  it('keeps an apostrophe inside a word rather than splitting on it', () => {
    expect(verseTokens('the LORD’s hand').map(t => t.word)).toEqual(['lords', 'hand'])
  })

  it('points each word back at the characters it came from', () => {
    const text = 'Abram believed the LORD'
    for (const token of verseTokens(text)) {
      expect(text.slice(token.start, token.end).toLowerCase().replace(/['’]/g, '')).toBe(token.word)
    }
  })
})

describe('classifyConnection', () => {
  it('calls a real quotation a quote', () => {
    expect(classifyConnection(GEN_15_6, ROM_4_3).kind).toBe('quote')
    expect(classifyConnection(GEN_15_6, JAS_2_23).kind).toBe('quote')
    expect(classifyConnection(GEN_15_6, PSA_106_31).kind).toBe('quote')
  })

  it('calls a thematic link an echo, and gives it no phrase to light', () => {
    const match = classifyConnection(GEN_15_6, HEB_11_8)
    expect(match.kind).toBe('echo')
    expect(match.span).toBeNull()
  })

  it('lights exactly the shared words in the TARGET text', () => {
    const match = classifyConnection(GEN_15_6, ROM_4_3)
    expect(match.span).not.toBeNull()
    expect(ROM_4_3.slice(match.span![0], match.span![1])).toBe(
      'it was credited to him as righteousness'
    )
  })

  // The whole reason the bar exists: a stock formula is not a quotation, and
  // calling one a quote lights words in a verse the source never quoted. These
  // four are the false positives the 2026-09-13 measurement pass found at the
  // brief's provisional four-word threshold — they are the reason it is five.
  it.each([
    [
      'and it came to pass',
      'And it came to pass in those days that a decree went out.',
      'And it came to pass that the famine was severe in the land.'
    ],
    [
      'do not be afraid (Genesis 15:1 / Isaiah 41:10)',
      'Do not be afraid, Abram. I am your shield, your very great reward.',
      'Do not fear, for I am with you; do not be afraid, for I am your God.'
    ],
    [
      'what we do not (Hebrews 11:1 / Romans 8:24)',
      'Now faith is the assurance of what we hope for and the certainty of what we do not see.',
      'For in this hope we were saved; but hope that is seen is no hope at all. Who hopes for ' +
        'what he can already see? But if we hope for what we do not yet see, we wait for it ' +
        'patiently.'
    ],
    [
      'are those who hear (Revelation 1:3 / Luke 11:28)',
      'Blessed is the one who reads the words of this prophecy, and blessed are those who hear ' +
        'and obey what is written in it.',
      'But He replied, “Blessed rather are those who hear the word of God and obey it.”'
    ]
  ])('does not let a stock formula score as a quotation: %s', (_name, source, target) => {
    expect(classifyConnection(source, target).kind).toBe('echo')
  })

  it('requires the run to be CONTIGUOUS, not merely shared', () => {
    // Every non-trivial word of the source stands in the target, scattered.
    const source = 'bread wine oil salt honey'
    const target = 'bread with wine beside oil under salt over honey'
    expect(classifyConnection(source, target).kind).toBe('echo')
  })

  it('needs QUOTE_MIN_WORDS non-trivial words, counting stop words for none', () => {
    expect(QUOTE_MIN_WORDS).toBe(5)
    expect(
      classifyConnection('alpha beta gamma delta epsilon', 'alpha beta gamma delta epsilon').kind
    ).toBe('quote')
    // One word short.
    expect(classifyConnection('alpha beta gamma delta', 'alpha beta gamma delta').kind).toBe('echo')
    // Five words, but one of them is a stop word — four non-trivial, so an echo.
    expect(
      classifyConnection('alpha and beta gamma delta', 'alpha and beta gamma delta').kind
    ).toBe('echo')
  })

  it('ignores case and punctuation on both sides', () => {
    expect(
      classifyConnection('Alpha, beta; gamma — delta: epsilon!', 'alpha beta gamma delta epsilon')
        .kind
    ).toBe('quote')
  })
})

describe('hasConnectionsDoor', () => {
  it('opens at the threshold and not below it', () => {
    expect(hasConnectionsDoor([connection(SALIENCE_MIN_SCORE)])).toBe(true)
    expect(hasConnectionsDoor([connection(SALIENCE_MIN_SCORE - 1)])).toBe(false)
    expect(SALIENCE_MIN_SCORE).toBe(30)
  })

  it('is silent where a verse has nothing, or nothing strong', () => {
    expect(hasConnectionsDoor([])).toBe(false)
    expect(hasConnectionsDoor(undefined)).toBe(false)
    expect(hasConnectionsDoor([connection(9), connection(4), connection(-8)])).toBe(false)
  })

  // The source data happens to arrive sorted, but that is an observed property
  // rather than a contract — a door must not depend on it.
  it('finds a qualifying connection wherever it stands in the list', () => {
    expect(hasConnectionsDoor([connection(2), connection(48), connection(1)])).toBe(true)
  })
})

describe('connectionsCacheKey', () => {
  it('is addressed by book and chapter alone — no translation', () => {
    expect(connectionsCacheKey(1, 15)).toBe('connections/1/15')
    expect(connectionsCacheKey(45, 4)).toBe('connections/45/4')
  })

  it('never collides with another chapter', () => {
    const keys = new Set([
      connectionsCacheKey(1, 15),
      connectionsCacheKey(1, 5),
      connectionsCacheKey(15, 1),
      connectionsCacheKey(11, 5)
    ])
    expect(keys.size).toBe(4)
  })
})
