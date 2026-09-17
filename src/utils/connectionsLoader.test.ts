import { describe, expect, it, vi } from 'vitest'
import {
  connectionLabel,
  createConnectionsLoader,
  type ConnectionsSources
} from './connectionsLoader'
import type { ChapterConnections } from './connections'

// Genesis 15 as open-cross-ref serves it (verse 6 verbatim, brief §2.1; verse 9
// invented below the line), and the BSB verses the classifier reads.
const GEN_15: ChapterConnections = {
  6: [
    { book: 59, chapter: 2, verse: 23, score: 85 },
    { book: 48, chapter: 3, verse: 6, endVerse: 14, score: 59 },
    { book: 45, chapter: 4, verse: 9, score: 56 },
    { book: 45, chapter: 4, verse: 3, endVerse: 6, score: 48 },
    { book: 58, chapter: 11, verse: 8, score: 31 }
  ],
  9: [{ book: 3, chapter: 1, verse: 14, score: 12 }]
}

const TEXT: Record<string, Record<number, string>> = {
  '1/15': { 6: 'Abram believed the LORD, and it was credited to him as righteousness.' },
  '59/2': {
    23: 'And the Scripture was fulfilled that says, “Abraham believed God, and it was credited to him as righteousness,” and he was called a friend of God.'
  },
  '48/3': { 6: 'So also, “Abraham believed God, and it was credited to him as righteousness.”' },
  '45/4': {
    3: 'For what does the Scripture say? “Abraham believed God, and it was credited to him as righteousness.”',
    9: 'Is this blessing only on the circumcised, or also on the uncircumcised? We have been saying that Abraham’s faith was credited to him as righteousness.'
  },
  '58/11': {
    8: 'By faith Abraham, when called to go to a place he would later receive as his inheritance, obeyed and went, without knowing where he was going.'
  }
}

function sources(): {
  sources: ConnectionsSources
  refs: ReturnType<typeof vi.fn>
  text: ReturnType<typeof vi.fn>
} {
  const refs = vi.fn(async (book: number, chapter: number) => {
    if (book === 1 && chapter === 15) return GEN_15
    if (book === 16) throw new Error('offline')
    return {}
  })
  const text = vi.fn(async (book: number, chapter: number) => {
    const lines = TEXT[`${book}/${chapter}`]
    if (!lines) return null
    return Object.entries(lines).map(([v, t]) => ({ verse: Number(v), text: t }))
  })
  return { sources: { chapterConnections: refs, chapterText: text }, refs, text }
}

describe('createConnectionsLoader', () => {
  it('fetches nothing until a verse is asked for', () => {
    const { refs, text } = sources()
    createConnectionsLoader(sources().sources)
    expect(refs).not.toHaveBeenCalled()
    expect(text).not.toHaveBeenCalled()
  })

  it('types the rows against the translation text, in the dataset order', async () => {
    const s = sources()
    const found = await createConnectionsLoader(s.sources).verse(1, 15, 6, 'BSB')
    expect(found).not.toBeNull()
    expect(found!.rows.map(r => [r.label, r.kind])).toEqual([
      ['James 2:23', 'quotes'],
      ['Galatians 3:6–14', 'quotes'],
      ['Romans 4:9', 'quotes'],
      ['Romans 4:3–6', 'quotes'],
      ['Hebrews 11:8', 'echoes']
    ])
    expect(found!.quotes).toBe(4)
    expect(found!.echoes).toBe(1)
    expect(found!.top).toBe(85)
    const rom = found!.rows[3]
    expect(rom.text!.slice(...rom.shared!)).toBe('it was credited to him as righteousness')
  })

  it('reads each connected chapter ONCE, plus the held verse’s own', async () => {
    const s = sources()
    await createConnectionsLoader(s.sources).verse(1, 15, 6, 'BSB')
    const chapters = s.text.mock.calls.map(c => `${c[0]}/${c[1]}`).sort()
    expect(chapters).toEqual(['1/15', '45/4', '48/3', '58/11', '59/2'])
    expect(s.text.mock.calls.every(c => c[2] === 'BSB')).toBe(true)
  })

  it('a verse below the line costs one chapter fetch and no text at all', async () => {
    const s = sources()
    const found = await createConnectionsLoader(s.sources).verse(1, 15, 9, 'BSB')
    expect(found).toBeNull()
    expect(s.refs).toHaveBeenCalledTimes(1)
    expect(s.text).not.toHaveBeenCalled()
  })

  it('a verse with no connections has no door', async () => {
    const s = sources()
    expect(await createConnectionsLoader(s.sources).verse(1, 15, 2, 'BSB')).toBeNull()
  })

  it('offline, an unfetchable chapter is no door — not an error — and is retried later', async () => {
    const s = sources()
    const loader = createConnectionsLoader(s.sources)
    expect(await loader.verse(16, 7, 1, 'BSB')).toBeNull()
    expect(await loader.verse(16, 7, 1, 'BSB')).toBeNull()
    expect(s.refs).toHaveBeenCalledTimes(2)
  })

  it('shares one chapter fetch between two verses, and one load between two askers', async () => {
    const s = sources()
    const loader = createConnectionsLoader(s.sources)
    await Promise.all([loader.verse(1, 15, 6, 'BSB'), loader.verse(1, 15, 6, 'BSB')])
    await loader.verse(1, 15, 9, 'BSB')
    expect(s.refs).toHaveBeenCalledTimes(1)
    expect(s.text.mock.calls.filter(c => c[0] === 45).length).toBe(1)
  })

  it('a row whose text cannot be read is an echo, still listed', async () => {
    const s = sources()
    s.text.mockImplementation(async (book: number) =>
      book === 59
        ? null
        : [
            {
              verse: 6,
              text: 'Abram believed the LORD, and it was credited to him as righteousness.'
            }
          ]
    )
    const found = await createConnectionsLoader(s.sources).verse(1, 15, 6, 'BSB')
    expect(found!.rows[0].label).toBe('James 2:23')
    expect(found!.rows[0].kind).toBe('echoes')
    expect(found!.rows[0].text).toBeNull()
  })
})

describe('connectionLabel', () => {
  it('names a verse, and a range with an en dash', () => {
    expect(connectionLabel({ book: 45, chapter: 4, verse: 3, score: 1 })).toBe('Romans 4:3')
    expect(connectionLabel({ book: 45, chapter: 4, verse: 3, endVerse: 6, score: 1 })).toBe(
      'Romans 4:3–6'
    )
    expect(connectionLabel({ book: 45, chapter: 4, verse: 3, endVerse: 3, score: 1 })).toBe(
      'Romans 4:3'
    )
  })
})

// ── dive-in-2: shared places on rows, and the parallel-account gate ──────────
describe('shared places and the parallel-account gate (dive-in-2)', () => {
  const GAL_1: ChapterConnections = {
    17: [
      { book: 44, chapter: 9, verse: 20, endVerse: 25, score: 4 },
      { book: 47, chapter: 11, verse: 32, endVerse: 33, score: 3 }
    ],
    18: [{ book: 44, chapter: 15, verse: 4, score: 2 }]
  }
  const GAL_TEXT: Record<string, Record<number, string>> = {
    '48/1': {
      17: 'nor did I go up to Jerusalem to the apostles who came before me, but I went into Arabia and later returned to Damascus.',
      18: 'Only after three years did I go up to Jerusalem to confer with Cephas, and I stayed with him fifteen days.'
    },
    '44/9': {
      20: 'Saul promptly began to proclaim Jesus in the synagogues, declaring, “He is the Son of God.”',
      21: 'All who heard him were astounded and asked, “Isn’t this the man who wreaked havoc in Jerusalem on those who call on this name?”',
      22: 'But Saul was empowered all the more, and he confounded the Jews living in Damascus.',
      23: 'After many days had passed, the Jews conspired to kill him,',
      24: 'but Saul learned of their plot.',
      25: 'One night, however, his disciples took him and lowered him in a basket through a window in the wall.'
    },
    '47/11': {
      32: 'In Damascus, the governor under King Aretas secured the city of the Damascenes in order to arrest me.',
      33: 'But I was lowered in a basket through a window in the wall and escaped his grasp.'
    },
    '44/15': { 4: 'On their arrival in Jerusalem, they were welcomed by the church.' }
  }
  function galSources(places: string[]): ConnectionsSources {
    return {
      chapterConnections: async (book, chapter) => (book === 48 && chapter === 1 ? GAL_1 : {}),
      chapterText: async (book, chapter) => {
        const lines = GAL_TEXT[`${book}/${chapter}`]
        return lines ? Object.entries(lines).map(([v, t]) => ({ verse: Number(v), text: t })) : null
      },
      chapterPlaces: async () => places
    }
  }

  it('opens Galatians 1:17 on Acts 9 as a parallel account, and marks the shared places', async () => {
    const found = await createConnectionsLoader(
      galSources(['Arabia', 'Cilicia', 'Damascus', 'Jerusalem', 'Syria'])
    ).verse(48, 1, 17, 'BSB')
    expect(found).not.toBeNull()
    expect(found!.parallel).toBe(true)
    expect(found!.rows[0].places).toEqual(['Damascus', 'Jerusalem'])
    expect(found!.rows[1].places).toEqual(['Damascus'])
    // a ranged row is compared against its whole range
    expect(found!.rows[0].text!.startsWith('Saul promptly')).toBe(true)
    expect(found!.rows[0].text!.includes('living in Damascus')).toBe(true)
  })

  it('stays shut below the line when the chapter has no places', async () => {
    expect(await createConnectionsLoader(galSources([])).verse(48, 1, 17, 'BSB')).toBeNull()
  })

  it('stays shut when the strongest row shares no place', async () => {
    expect(
      await createConnectionsLoader(galSources(['Cilicia', 'Syria'])).verse(48, 1, 17, 'BSB')
    ).toBeNull()
  })

  it('Genesis 15:6 opens on score as before, with no places marked and parallel false', async () => {
    const found = await createConnectionsLoader(sources().sources).verse(1, 15, 6, 'BSB')
    expect(found!.parallel).toBe(false)
    expect(found!.rows.every(r => r.places.length === 0)).toBe(true)
  })
})
