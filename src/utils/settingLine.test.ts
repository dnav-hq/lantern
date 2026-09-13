import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HEADING_REACH,
  MAX_WORDS,
  SETTING_LINES_URL,
  bannedTerm,
  buildSettingLine,
  checkSettingLines,
  headingLine,
  loadSettingLines,
  settingLineIn,
  settingLineKey,
  superscriptionLine,
  wordCount,
  type SettingLineFile
} from './settingLine'

describe('headingLine — the reach gate (brief §4, R6)', () => {
  it('takes the heading for a verse sitting under it', () => {
    expect(headingLine({ heading: 'God’s Covenant with Abram', sinceHeading: 0 })).toBe(
      'God’s Covenant with Abram'
    )
  })

  it('still takes it at the edge of the reach', () => {
    expect(headingLine({ heading: 'Faith and Works', sinceHeading: HEADING_REACH })).toBe(
      'Faith and Works'
    )
  })

  it('drops it one verse past the reach — Proverbs 21:30 under “The King’s Heart”', () => {
    expect(headingLine({ heading: 'The King’s Heart', sinceHeading: HEADING_REACH + 1 })).toBeNull()
    expect(headingLine({ heading: 'The King’s Heart', sinceHeading: 29 })).toBeNull()
  })

  it('has nothing to say where the chapter carries no heading', () => {
    expect(headingLine({ heading: null, sinceHeading: 0 })).toBeNull()
    expect(headingLine({ heading: '   ', sinceHeading: 0 })).toBeNull()
  })
})

describe('superscriptionLine', () => {
  it('strips the musical directions and keeps the setting', () => {
    expect(
      superscriptionLine({
        subtitle:
          'For the choirmaster. With stringed instruments. A Psalm of David, when he fled from his son Absalom.'
      })
    ).toBe('A Psalm of David, when he fled from his son Absalom.')
  })

  it('returns null where the subtitle is nothing but directions', () => {
    expect(
      superscriptionLine({ subtitle: 'For the choirmaster. With stringed instruments.' })
    ).toBeNull()
  })

  it('has nothing to say where there is no subtitle', () => {
    expect(superscriptionLine({})).toBeNull()
  })
})

describe('the rules as rejects (R3, R4)', () => {
  it('counts words the way the cap does', () => {
    expect(wordCount('  Here Is  My Servant ')).toBe(4)
  })

  it('names the banned verb a line contains', () => {
    expect(bannedTerm('Love Fulfills the Law')).toBe('fulfills')
    expect(bannedTerm('The Fulfillment of the Law')).toBe('fulfillment')
    expect(bannedTerm('Jesus Teaches at the Feast')).toBe('teaches')
    expect(bannedTerm('This passage points to Christ')).toBe('points to')
  })

  it('does not trip on a word that merely contains one', () => {
    expect(bannedTerm('The Proverbs of Solomon')).toBeNull()
    expect(bannedTerm('Meaningless, Says the Teacher')).toBeNull()
  })

  it('rejects a banned heading rather than shipping it — no line at all', () => {
    expect(buildSettingLine({ heading: 'Love Fulfills the Law', sinceHeading: 1 })).toBeNull()
  })

  it('rejects an over-long line rather than truncating it', () => {
    const long = Array.from({ length: MAX_WORDS + 1 }, (_, i) => `word${i}`).join(' ')
    expect(wordCount(long)).toBeGreaterThan(MAX_WORDS)
    expect(buildSettingLine({ heading: long, sinceHeading: 0 })).toBeNull()
  })
})

describe('buildSettingLine — the chain', () => {
  it('prefers the gated heading', () => {
    expect(
      buildSettingLine({
        heading: 'Faith and Works',
        sinceHeading: 2,
        subtitle: 'A Psalm of David.'
      })
    ).toEqual({ text: 'Faith and Works', source: 'h' })
  })

  it('falls through to the superscription when the heading is out of reach', () => {
    expect(
      buildSettingLine({
        heading: 'Book Two',
        sinceHeading: 40,
        subtitle: 'For the choirmaster. A Psalm of the Sons of Korah.'
      })
    ).toEqual({ text: 'A Psalm of the Sons of Korah.', source: 's' })
  })

  it('says nothing when nothing in the chain qualifies', () => {
    expect(buildSettingLine({ heading: null, sinceHeading: 0, subtitle: null })).toBeNull()
  })
})

describe('checkSettingLines — what the build runs over the file it wrote', () => {
  it('passes a clean file', () => {
    expect(
      checkSettingLines([
        { key: '59002023', text: 'Faith and Works', source: 'h', reach: 4 },
        { key: '19003001', text: 'A Psalm of David.', source: 's' }
      ])
    ).toEqual([])
  })

  it('reports each rule by name', () => {
    const violations = checkSettingLines([
      { key: '45013008', text: 'Love Fulfills the Law', source: 'h', reach: 0 },
      { key: '20021030', text: 'The King’s Heart', source: 'h', reach: 29 },
      {
        key: '00000000',
        text: 'one two three four five six seven eight nine ten eleven twelve thirteen',
        source: 'h',
        reach: 0
      }
    ])
    expect(violations.map(v => v.rule).sort()).toEqual(['R3', 'R4', 'R6'])
    expect(violations.find(v => v.rule === 'R6')?.key).toBe('20021030')
  })

  it('does not apply the reach gate to a superscription, which belongs to the whole psalm', () => {
    expect(
      checkSettingLines([{ key: '19003008', text: 'A Psalm of David.', source: 's', reach: 40 }])
    ).toEqual([])
  })
})

describe('the key and the lookup', () => {
  it('is the BBCCCVVV VerseKey the map data already uses', () => {
    expect(settingLineKey(1, 15, 6)).toBe('01015006')
    expect(settingLineKey(66, 22, 21)).toBe('66022021')
  })

  it('reads a line out of the file, or nothing', () => {
    const file: SettingLineFile = {
      v: 1,
      attribution: 'x',
      lines: { '59002023': ['Faith and Works', 'h'] }
    }
    expect(settingLineIn(file, 59, 2, 23)).toEqual({ text: 'Faith and Works', source: 'h' })
    expect(settingLineIn(file, 59, 2, 24)).toBeNull()
    expect(settingLineIn(null, 59, 2, 23)).toBeNull()
  })
})

describe('loadSettingLines — lazy, memoized, and never fatal', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is one static asset under /bible/, so vite.config.ts’s workbox globIgnores (**/bible/**/*.json.gz) keeps it out of the PWA precache', () => {
    expect(SETTING_LINES_URL.startsWith('/bible/')).toBe(true)
    expect(SETTING_LINES_URL.endsWith('.json.gz')).toBe(true)
  })

  it('resolves to null when the file cannot be fetched, and does not remember the failure', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    await expect(loadSettingLines(failing)).resolves.toBeNull()
    expect(failing).toHaveBeenCalledTimes(1)
  })

  it('parses an uncompressed body (the dev-server case) and loads it exactly once', async () => {
    const file: SettingLineFile = {
      v: 1,
      attribution: 'Berean Standard Bible',
      lines: { '59002023': ['Faith and Works', 'h'] }
    }
    const ok = vi.fn(
      async () => new Response(new TextEncoder().encode(JSON.stringify(file)))
    ) as unknown as typeof fetch
    await expect(loadSettingLines(ok)).resolves.toEqual(file)
    await expect(loadSettingLines(ok)).resolves.toEqual(file)
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
