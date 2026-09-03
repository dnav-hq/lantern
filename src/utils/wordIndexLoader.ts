// Loading the shipped word index, lazily, one shard at a time.
//
// Slice 2 of the word door (docs/proposals/word-door-guardrails.md). Slice 1
// built the data (`public/bible/words/…`) and `wordIndex.ts` holds the shapes
// and the pure logic both sides share; this file is the only thing that fetches
// it, so the laziness the brief insists on (§5.3, §5.4) lives in one place:
//
//   - NOTHING is fetched until a reader opens a door. A reader who never opens
//     one downloads not a single byte of the 8.17 MB index.
//   - Opening a door fetches exactly three files: the verse shard for the book
//     they are in, the parsing table, and the ONE lemma shard holding the word
//     they tapped. Never the other 57 lemma shards, never another book.
//   - Everything fetched is memoized as a PROMISE, so two doors opened in the
//     same book (or two words in one lemma shard) share one download rather
//     than racing two.
//   - The shards are excluded from the service-worker precache in
//     `vite.config.ts` — precaching them would defeat every line above.
//
// Nothing here may import a Node API — this file lives under src/ and obeys the
// pure-web rule in CLAUDE.md.
import {
  lemmaShard,
  type ParsingEntry,
  type RawLemmaEntry,
  type StrongsKey,
  type VerseWord
} from './wordIndex'

/** `{ "<chapter>": { "<verse>": VerseWord[] } }` — one book's tagged words. */
export type VerseShard = Record<string, Record<string, VerseWord[]>>

/** `{ "<strongsKey>": RawLemmaEntry }` — one bucket of 250 Strong's numbers. */
export type LemmaShard = Record<string, RawLemmaEntry>

/** Fetch + decode one shipped `.json.gz`. Injected so tests need no network. */
export type ShardFetcher = (url: string) => Promise<unknown>

const BASE = '/bible/words'

/**
 * Decompression is decided by the BYTES received, never by headers — exactly as
 * `src/bible/self-hosted.ts` does it, and for the same reason: Vite's dev server
 * tags `.gz` with `Content-Encoding: gzip` (so the browser has already
 * decompressed it), while a static host may hand back the raw gzip stream. The
 * gzip magic number (1f 8b) cannot collide with JSON, which always starts `{`.
 */
export async function fetchShard(url: string): Promise<unknown> {
  const res = await fetch(url)
  // A bare Error, NOT a CodedError, and deliberately not interpolated (see
  // src/errors.guardrail.test.ts): `ErrorCode` lives in src/errors.ts, which
  // this slice's scope fence does not cover, so there is no honest code to
  // throw yet — and borrowing BIBLE_BUNDLE_FETCH_FAILED would poison a real
  // outage signal. The message is therefore a constant carrying no status and
  // no url. Promoting this to a real WORD_INDEX_FETCH_FAILED code is a one-line
  // follow-up in a slice whose fence includes src/errors.ts.
  if (!res.ok) throw new Error('WORD_INDEX_FETCH_FAILED')
  const bytes = new Uint8Array(await res.arrayBuffer())
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const json = isGzip
    ? await new Response(
        new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))
      ).text()
    : new TextDecoder().decode(bytes)
  return JSON.parse(json)
}

export interface WordIndexLoader {
  /** The tagged words of one verse, in reading order. `[]` where none exist. */
  verseWords(book: number, chapter: number, verse: number): Promise<VerseWord[]>
  /** The parsing table — expanded English first, the terse code alongside. */
  parsing(): Promise<ParsingEntry[]>
  /** One lemma, or null where the shard genuinely has no such entry. */
  lemma(key: StrongsKey): Promise<RawLemmaEntry | null>
}

export function createWordIndexLoader(fetcher: ShardFetcher = fetchShard): WordIndexLoader {
  // Promises, not values: concurrent first reads share one download.
  const verses = new Map<number, Promise<VerseShard>>()
  const lemmas = new Map<string, Promise<LemmaShard>>()
  let parsingTable: Promise<ParsingEntry[]> | null = null

  const verseShard = (book: number): Promise<VerseShard> => {
    let p = verses.get(book)
    if (!p) {
      p = fetcher(`${BASE}/verses/${book}.json.gz`) as Promise<VerseShard>
      verses.set(book, p)
    }
    return p
  }

  return {
    async verseWords(book, chapter, verse) {
      const shard = await verseShard(book)
      return shard[String(chapter)]?.[String(verse)] ?? []
    },
    parsing() {
      if (!parsingTable)
        parsingTable = fetcher(`${BASE}/parsing.json.gz`) as Promise<ParsingEntry[]>
      return parsingTable
    },
    async lemma(key) {
      const name = lemmaShard(key)
      let p = lemmas.get(name)
      if (!p) {
        p = fetcher(`${BASE}/lemmas/${name}.json.gz`) as Promise<LemmaShard>
        lemmas.set(name, p)
      }
      return (await p)[key] ?? null
    }
  }
}

/** The app's one loader. A module singleton so its memoization is app-wide. */
export const wordIndexLoader = createWordIndexLoader()

/**
 * Parsing classes that carry the word rather than the grammar around it.
 *
 * The brief excludes function words from doors outright (§8.2): making "and" a
 * door tells the reader there is something to find in "and". The parsing table's
 * own vocabulary decides it — a segment headed Article, Conjunctive waw,
 * Preposition, Pronoun or Direct object marker is grammar; Noun, Verb,
 * Adjective, Adverb, Number and Interjection are words. A compound parse
 * ("Preposition-b | Noun - masculine plural construct") is a word: the noun is
 * what the reader tapped.
 */
const CONTENT_CLASSES = new Set(['Noun', 'Verb', 'Adjective', 'Adverb', 'Number', 'Interjection'])

function isContentParse(expanded: string): boolean {
  return expanded
    .split('|')
    .some(segment => CONTENT_CLASSES.has(segment.trim().split(/[\s-]/)[0]?.trim() ?? ''))
}

/** One word of a verse that has earned a door. */
export interface SalientWord {
  /** The BSB's English here, e.g. "is futile". */
  english: string
  strongs: StrongsKey
  /** The pointed original-language form as the tables print it, e.g. "hā·ḇel". */
  translit: string
  /** Index into the parsing table for THIS instance. */
  parsing: number
  /** Which word of the verse this is — the door's own identity within the verse. */
  position: number
}

/**
 * The words in one verse a reader may open a door on.
 *
 * Function words are dropped (see above) and repeats of the same lemma collapse
 * to their first instance, because a door is about the lemma and a verse that
 * says *hebel* four times does not offer four doors. Order is the verse's own —
 * deliberately NOT a ranking. §8.2's precedence order decides which word LEADS
 * where something must lead; nothing here reorders a verse into a league table.
 */
export function salientWords(words: VerseWord[], parsing: ParsingEntry[]): SalientWord[] {
  const seen = new Set<string>()
  const out: SalientWord[] = []
  words.forEach(([english, strongs, translit, parsingId], position) => {
    if (!strongs || seen.has(strongs)) return
    // The tables print an untranslated word as "-" or ". . ." (Genesis 15:9's
    // mᵉšullešeṯ, say). There is no English here for a reader to point at, so
    // there is nothing to offer them a door ON — and a door labelled "-" is
    // furniture, not an offer.
    if (!/\p{L}/u.test(english)) return
    const expanded = parsing[parsingId]?.[0] ?? ''
    // No parse at all is not evidence of a function word — keep it, and let the
    // door itself be honest about having no grammar to show.
    if (expanded && !isContentParse(expanded)) return
    seen.add(strongs)
    out.push({ english, strongs, translit, parsing: parsingId, position })
  })
  return out
}
