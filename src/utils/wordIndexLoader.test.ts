import { describe, expect, it, vi } from 'vitest'
import { createWordIndexLoader, salientWords, type SalientWord } from './wordIndexLoader'
import type { ParsingEntry, VerseWord } from './wordIndex'

// Ecclesiastes 1:2 VERBATIM out of public/bible/words/verses/21.json.gz, and the
// parsing rows those ids really point at. Pasted rather than invented, because
// the whole point of these tests is that the loader agrees with the shipped
// data — an invented fixture would prove the loader agrees with itself.
const ECC_1_2: VerseWord[] = [
  ['Futility', 'H1892', 'hă·ḇêl', 42],
  ['of futilities', 'H1892', 'hă·ḇā·lîm', 1],
  ['says', 'H0559', '’ā·mar', 3],
  ['the Teacher', 'H6953', 'qō·he·leṯ', 9],
  ['futility', 'H1892', 'hă·ḇêl', 42],
  ['of futilities', 'H1892', 'hă·ḇā·lîm', 1],
  ['Everything', 'H3605', 'hak·kōl', 23],
  ['is futile', 'H1892', 'hā·ḇel', 9]
]

const PARSING: ParsingEntry[] = []
PARSING[1] = ['Noun - masculine plural', 'N-mp']
PARSING[3] = ['Verb - Qal - Perfect - third person masculine singular', 'V-Qal-Perf-3ms']
PARSING[9] = ['Noun - masculine singular', 'N-ms']
PARSING[23] = ['Article | Noun - masculine singular', 'Art | N-ms']
PARSING[42] = ['Noun - masculine singular construct', 'N-msc']

const shards = {
  '/bible/words/verses/21.json.gz': { '1': { '2': ECC_1_2 } },
  '/bible/words/parsing.json.gz': PARSING,
  '/bible/words/lemmas/H07.json.gz': { H1892: { l: 'הֶ֫בֶל', t: 'he.vel', n: 73 } },
  '/bible/words/lemmas/H27.json.gz': { H6953: { l: 'קֹהֶ֫לֶת', t: 'qo.he.let', n: 7 } }
} as Record<string, unknown>

function loaderWithSpy(): {
  loader: ReturnType<typeof createWordIndexLoader>
  fetcher: ReturnType<typeof vi.fn>
} {
  const fetcher = vi.fn(async (url: string) => {
    if (!(url in shards)) throw new Error(`WORD_INDEX_FETCH_FAILED 404 ${url}`)
    return shards[url]
  })
  return { loader: createWordIndexLoader(fetcher), fetcher }
}

describe('createWordIndexLoader', () => {
  it('fetches nothing until something is actually asked for', () => {
    const { fetcher } = loaderWithSpy()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fetches ONLY the shard holding the opened lemma', async () => {
    const { loader, fetcher } = loaderWithSpy()
    const entry = await loader.lemma('H1892')
    expect(entry?.n).toBe(73)
    expect(fetcher.mock.calls.map(c => c[0])).toEqual(['/bible/words/lemmas/H07.json.gz'])
  })

  it('shares one download between two lemmas in the same shard', async () => {
    const { loader, fetcher } = loaderWithSpy()
    const [a, b] = await Promise.all([loader.lemma('H1892'), loader.lemma('H1893')])
    expect(a?.t).toBe('he.vel')
    expect(b).toBeNull() // absent from the shard: null, not a throw
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('fetches a second shard for a lemma that lives in one', async () => {
    const { loader, fetcher } = loaderWithSpy()
    await loader.lemma('H1892')
    await loader.lemma('H6953')
    expect(fetcher.mock.calls.map(c => c[0])).toEqual([
      '/bible/words/lemmas/H07.json.gz',
      '/bible/words/lemmas/H27.json.gz'
    ])
  })

  it('reads a verse out of its book shard, and memoizes the book', async () => {
    const { loader, fetcher } = loaderWithSpy()
    expect(await loader.verseWords(21, 1, 2)).toEqual(ECC_1_2)
    expect(await loader.verseWords(21, 1, 3)).toEqual([]) // untagged verse, not an error
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('memoizes the parsing table across doors', async () => {
    const { loader, fetcher } = loaderWithSpy()
    expect((await loader.parsing())[42][0]).toBe('Noun - masculine singular construct')
    await loader.parsing()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('salientWords', () => {
  const words = (list: SalientWord[]): string[] => list.map(w => w.english)

  it('collapses repeats of one lemma to its first instance', () => {
    const found = salientWords(ECC_1_2, PARSING)
    expect(words(found)).toEqual(['Futility', 'says', 'the Teacher', 'Everything'])
    expect(found[0]).toMatchObject({ strongs: 'H1892', translit: 'hă·ḇêl', position: 0 })
  })

  it('keeps a compound parse whose head is grammar but whose word is a noun', () => {
    const parsing: ParsingEntry[] = [
      ['Preposition-b | Noun - masculine plural construct | third person masculine plural', 'x']
    ]
    expect(words(salientWords([['in their hands', 'H3027', 'bî·ḏām', 0]], parsing))).toEqual([
      'in their hands'
    ])
  })

  it('drops words that are only grammar', () => {
    const parsing: ParsingEntry[] = [
      ['Conjunctive waw', 'Conj-w'],
      ['Direct object marker', 'DirObjM'],
      ['Article', 'Art'],
      ['Personal / Possessive Pronoun - third person masculine singular', 'Pro-3ms']
    ]
    const rows: VerseWord[] = [
      ['and', 'H9002', 'wə', 0],
      ['-', 'H0853', '’êṯ', 1],
      ['the', 'H9009', 'ha', 2],
      ['he', 'H1931', 'hū', 3]
    ]
    expect(salientWords(rows, parsing)).toEqual([])
  })

  it('keeps a word with no parse rather than guessing it is grammar', () => {
    expect(words(salientWords([['Selah', 'H5542', 'se·lāh', 7]], []))).toEqual(['Selah'])
  })

  it('ignores rows with no Strong’s number, which have no door to open', () => {
    expect(salientWords([['—', '', '', 1]], PARSING)).toEqual([])
  })
})
