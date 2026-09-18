// Searching the text of Scripture, in the browser — docs/audits/world-class-
// pass-2026-09-18.md, finding 1.
//
// The complete BSB already ships as public/bible/bsb.json.gz (the read path's
// fallback), so a word search needs no backend and no index file: the bundle
// is fetched once, on the first word query, and every verse is scanned. That
// is 31,102 short strings, which takes a few milliseconds; an inverted index
// would save nothing a reader could feel and would cost a second download.
// The BSB is the study text, so this searches the BSB whatever translation is
// on screen, and the results say so.
//
// Matching is plain: case-folded substring of the whole query, so "credited
// to him" finds the phrase and "faith" finds every verse with the word in it.
// Results come in canonical order and are capped, with the cap reported, so
// the list never lies about being complete.
//
// Nothing here may import a Node API — this file lives under src/ and obeys
// the pure-web rule in CLAUDE.md.
import { CodedError } from '../errors'
import { bookByNumber } from './bibleBooks'

type BsbBundle = Record<string, Record<string, [number, string][]>>

const BUNDLE_URL = '/bible/bsb.json.gz'

export interface ScriptureHit {
  bookNumber: number
  bookName: string
  chapter: number
  verse: number
  text: string
  /** Offsets of the match inside `text`. */
  at: [number, number]
}

export interface ScriptureSearch {
  hits: ScriptureHit[]
  /** True when more verses matched than `hits` carries. */
  truncated: boolean
}

/** Shortest query that is searched; shorter ones match half the Bible. */
export const MIN_QUERY = 3
export const MAX_HITS = 40

let bundle: Promise<BsbBundle> | null = null

async function fetchBundle(url: string): Promise<BsbBundle> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new CodedError('BIBLE_BUNDLE_FETCH_FAILED', `${res.status} ${res.statusText}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  // The gzip magic number decides, not the headers — see self-hosted.ts.
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const json = isGzip
    ? await new Response(
        new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))
      ).text()
    : new TextDecoder().decode(bytes)
  return JSON.parse(json) as BsbBundle
}

function load(): Promise<BsbBundle> {
  if (!bundle) {
    bundle = fetchBundle(BUNDLE_URL).catch(err => {
      bundle = null
      throw err
    })
  }
  return bundle
}

/** Whether the bundle is already here (so a search can answer at once). */
export function scriptureSearchReady(): boolean {
  return bundle !== null
}

/** The pure scan, exported for tests. */
export function scanBundle(data: BsbBundle, query: string, max = MAX_HITS): ScriptureSearch {
  const q = query.trim().toLowerCase()
  const hits: ScriptureHit[] = []
  if (q.length < MIN_QUERY) return { hits, truncated: false }
  let truncated = false
  const books = Object.keys(data)
    .map(Number)
    .sort((a, b) => a - b)
  outer: for (const b of books) {
    const chapters = data[String(b)]
    const name = bookByNumber(b)?.name ?? `Book ${b}`
    const nums = Object.keys(chapters)
      .map(Number)
      .sort((a, b2) => a - b2)
    for (const c of nums) {
      for (const [v, text] of chapters[String(c)]) {
        const i = text.toLowerCase().indexOf(q)
        if (i === -1) continue
        if (hits.length >= max) {
          truncated = true
          break outer
        }
        hits.push({
          bookNumber: b,
          bookName: name,
          chapter: c,
          verse: v,
          text,
          at: [i, i + q.length]
        })
      }
    }
  }
  return { hits, truncated }
}

/** Search the BSB for a word or phrase. Resolves to no hits on any failure. */
export async function searchScripture(query: string): Promise<ScriptureSearch> {
  if (query.trim().length < MIN_QUERY) return { hits: [], truncated: false }
  try {
    return scanBundle(await load(), query)
  } catch {
    return { hits: [], truncated: false }
  }
}

/** Test seam. */
export function resetScriptureSearch(): void {
  bundle = null
}
