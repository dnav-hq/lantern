import { describe, expect, it } from 'vitest'
import {
  STOP_WORDS,
  THRESHOLD,
  classify,
  connectionsCacheKey,
  connectionsForVerse,
  contentTokens,
  doorOpens,
  sharedRun,
  topScore,
  type ChapterConnections
} from './connections'

// Verse text is the BSB, verbatim from bible.helloao.org (2026-09-13). The
// classifier's one embarrassing failure is a false "quotes" (brief §9), so the
// negative cases below are the ones that matter.
const GEN_15_6 = 'Abram believed the LORD, and it was credited to him as righteousness.'
const ROM_4_3 =
  'For what does the Scripture say? “Abraham believed God, and it was credited to him as righteousness.”'
const JAS_2_23 =
  'And the Scripture was fulfilled that says, “Abraham believed God, and it was credited to him as righteousness,” and he was called a friend of God.'
const ROM_4_9 =
  'Is this blessing only on the circumcised, or also on the uncircumcised? We have been saying that Abraham’s faith was credited to him as righteousness.'
const PSA_106_31 = 'It was credited to him as righteousness for all generations to come.'
const HEB_11_8 =
  'By faith Abraham, when called to go to a place he would later receive as his inheritance, obeyed and went, without knowing where he was going.'
const TWO_CO_5_19 =
  'that God was reconciling the world to Himself in Christ, not counting men’s trespasses against them. And He has committed to us the message of reconciliation.'

describe('the stop-word list (brief §4)', () => {
  it('is exactly the ten function words the brief names', () => {
    expect([...STOP_WORDS].sort()).toEqual(
      ['a', 'an', 'and', 'in', 'is', 'of', 'that', 'the', 'to', 'was'].sort()
    )
  })

  it('drops them from the tokens, case-folded and unpunctuated, keeping offsets', () => {
    const tokens = contentTokens('And it was credited to him, as Righteousness.')
    expect(tokens.map(t => t.word)).toEqual(['it', 'credited', 'him', 'as', 'righteousness'])
    const last = tokens[tokens.length - 1]
    expect('And it was credited to him, as Righteousness.'.slice(last.start, last.end)).toBe(
      'Righteousness'
    )
  })

  it('tokenizes non-Latin text too, so a Tamil quote is still a quote', () => {
    expect(contentTokens('ஆபிராம் கர்த்தரை விசுவாசித்தான்').map(t => t.word)).toHaveLength(3)
  })
})

describe('quote vs echo (brief §4)', () => {
  it('calls Romans 4:3 a quote of Genesis 15:6 and lights the shared run', () => {
    const run = sharedRun(GEN_15_6, ROM_4_3)
    expect(run).not.toBeNull()
    expect(run!.words).toBeGreaterThanOrEqual(4)
    expect(ROM_4_3.slice(...run!.target)).toBe('it was credited to him as righteousness')
    expect(GEN_15_6.slice(...run!.source)).toBe('it was credited to him as righteousness')
    expect(classify(GEN_15_6, ROM_4_3)).toBe('quotes')
  })

  it('calls James 2:23 and Psalm 106:31 quotes', () => {
    expect(classify(GEN_15_6, JAS_2_23)).toBe('quotes')
    expect(classify(GEN_15_6, PSA_106_31)).toBe('quotes')
  })

  it('calls Romans 4:9 a quote — the same run, "credited to him as righteousness"', () => {
    expect(classify(GEN_15_6, ROM_4_9)).toBe('quotes')
  })

  it('calls Hebrews 11:8 and 2 Corinthians 5:19 echoes', () => {
    expect(classify(GEN_15_6, HEB_11_8)).toBe('echoes')
    expect(classify(GEN_15_6, TWO_CO_5_19)).toBe('echoes')
  })

  it('needs FOUR shared words: three is an echo', () => {
    expect(classify('he believed God and rejoiced', 'she believed God and wept')).toBe('echoes')
    expect(
      classify('he believed God and rejoiced greatly', 'she believed God and rejoiced greatly')
    ).toBe('quotes')
  })

  it('needs the words CONTIGUOUS: four shared words scattered are an echo', () => {
    expect(
      classify('credited righteousness him as faith', 'as him faith credited hope righteousness')
    ).toBe('echoes')
  })

  it('does not let stop words make up the four', () => {
    // "and it came to pass" → after stop words: it, came, pass — three.
    expect(classify('And it came to pass that he went', 'And it came to pass in those days')).toBe(
      'echoes'
    )
  })

  it('ignores case and punctuation', () => {
    expect(classify('Blessed are those who bless you.', '“BLESSED are those who bless you!”')).toBe(
      'quotes'
    )
  })
})

describe('salience (brief §5)', () => {
  const chapter: ChapterConnections = {
    1: [
      { book: 23, chapter: 41, verse: 10, score: 52 },
      { book: 19, chapter: 119, verse: 114, score: 44 }
    ],
    6: [
      { book: 59, chapter: 2, verse: 23, score: 85 },
      { book: 48, chapter: 3, verse: 6, endVerse: 14, score: 59 },
      { book: 47, chapter: 5, verse: 19, score: -8 }
    ],
    9: [
      { book: 3, chapter: 1, verse: 14, score: 12 },
      { book: 3, chapter: 1, verse: 10, score: 0 }
    ]
  }

  it('the line is 30', () => {
    expect(THRESHOLD).toBe(30)
  })

  it('opens the door only where the top connection clears the line', () => {
    expect(doorOpens(connectionsForVerse(chapter, 1))).toBe(true)
    expect(doorOpens(connectionsForVerse(chapter, 6))).toBe(true)
    expect(doorOpens(connectionsForVerse(chapter, 9))).toBe(false)
    expect(doorOpens(connectionsForVerse(chapter, 2))).toBe(false) // no entry at all
    expect(doorOpens([{ book: 1, chapter: 1, verse: 1, score: 29 }])).toBe(false)
    expect(doorOpens([{ book: 1, chapter: 1, verse: 1, score: 30 }])).toBe(true)
  })

  it('drops the rows the dataset itself votes against, keeping its order', () => {
    expect(connectionsForVerse(chapter, 6).map(c => c.score)).toEqual([85, 59])
    expect(connectionsForVerse(chapter, 9).map(c => c.score)).toEqual([12])
    expect(topScore([])).toBeNull()
  })
})

describe('the cache key (brief §7)', () => {
  it('carries the book and chapter and NO translation', () => {
    expect(connectionsCacheKey(1, 15)).toBe('xref/1/15')
    expect(connectionsCacheKey(1, 15)).not.toMatch(/BSB|KJV/)
  })

  it('cannot collide with a scripture chapter key', () => {
    // Scripture records are keyed `${translation}/${book}/${chapter}`.
    expect(connectionsCacheKey(1, 15)).not.toBe('BSB/1/15')
  })
})

// ── dive-in-2: the parallel-account gate, shared places, the row window ──────
import { sharedPlaces, windowAround } from './connections'

const GAL_1_17 =
  'nor did I go up to Jerusalem to the apostles who came before me, but I went into Arabia and later returned to Damascus.'
const ACTS_9_20 =
  'Saul promptly began to proclaim Jesus in the synagogues, declaring, “He is the Son of God.” All who heard him were astounded and asked, “Isn’t this the man who wreaked havoc in Jerusalem on those who call on this name?”'

describe('doorOpens with a parallel account (dive-in-2)', () => {
  const below = [{ book: 44, chapter: 9, verse: 20, endVerse: 25, score: 4 }]
  it('still shuts below the line by default', () => {
    expect(doorOpens(below)).toBe(false)
  })
  it('opens below the line when the strongest row is a parallel account', () => {
    expect(doorOpens(below, true)).toBe(true)
  })
  it('never opens on nothing, parallel or not', () => {
    expect(doorOpens([], true)).toBe(false)
  })
})

describe('sharedPlaces', () => {
  const places = ['Arabia', 'Cilicia', 'Damascus', 'Jerusalem', 'Judea', 'Syria']
  it('names the chapter places both texts write, in the place list’s order, once each', () => {
    expect(sharedPlaces(places, GAL_1_17, ACTS_9_20)).toEqual(['Jerusalem'])
    expect(sharedPlaces(places, GAL_1_17, 'In Damascus, the governor under King Aretas')).toEqual([
      'Damascus'
    ])
  })
  it('matches whole words only, so a name inside another word does not count', () => {
    expect(sharedPlaces(['Ur'], 'out of Ur of the Chaldeans', 'your urn')).toEqual([])
    expect(sharedPlaces(['Ur'], 'out of Ur of the Chaldeans', 'from Ur.')).toEqual(['Ur'])
  })
  it('marks nothing the place list does not carry', () => {
    expect(sharedPlaces([], GAL_1_17, ACTS_9_20)).toEqual([])
    expect(sharedPlaces(['Rome'], GAL_1_17, ACTS_9_20)).toEqual([])
  })
})

describe('windowAround', () => {
  it('shows the whole text when the anchor is near the start', () => {
    expect(windowAround(GEN_15_6, 6)).toEqual({ text: GEN_15_6, offset: 0 })
  })
  it('opens at the nearest opening quote before a deep anchor', () => {
    const at = JAS_2_23.indexOf('it was credited')
    const w = windowAround(JAS_2_23, at)
    expect(w.text.startsWith('“Abraham believed God')).toBe(true)
    expect(JAS_2_23.slice(w.offset)).toBe(w.text)
  })
  it('falls back to a sentence, then a clause, then a word boundary', () => {
    const at = ROM_4_9.indexOf('credited')
    const w = windowAround(ROM_4_9, at)
    expect(w.text.startsWith('We have been saying')).toBe(true)
    const long = 'a'.repeat(30) + ' ' + 'word '.repeat(20) + 'anchor here'
    const w2 = windowAround(long, long.indexOf('anchor'))
    expect(w2.offset).toBeGreaterThan(0)
    expect(long.slice(w2.offset)).toBe(w2.text)
    expect(w2.text.includes('anchor')).toBe(true)
  })
})
