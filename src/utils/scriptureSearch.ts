// Searching the text of Scripture, in the browser — docs/audits/world-class-
// pass-2026-09-18.md, finding 1; ranked since the 2026-10-28 pass.
//
// The complete BSB already ships as public/bible/bsb.json.gz (the read path's
// fallback), so a word search needs no backend and no index file: the bundle
// is fetched once, on the first word query, and every verse is scanned. That
// is 31,102 short strings, which takes a few milliseconds; an inverted index
// would save nothing a reader could feel and would cost a second download.
// The BSB is the study text, so this searches the BSB whatever translation is
// on screen, and the results say so.
//
// Matching is a case-folded substring of the query, but the results are
// RANKED, not canonical: "faith" used to return Genesis 24:27 first and stop
// at the cap before reaching Romans or Hebrews, which is not what anyone
// typing "faith" wants. Every verse is still scanned; each hit is scored and
// the top MAX_HITS come back, with `truncated` saying when more matched.
// The score, in order of weight:
//   - the whole query as a phrase of whole words beats every word present as
//     a whole word, which beats a bare substring ("faith" inside
//     "faithfulness"; for several words, each present inside some word);
//   - a shorter verse scores a little higher than a long one (density);
//   - a match near the start of the verse scores a little higher;
//   - New Testament books get a small prior, so theological words surface
//     the epistles rather than every Old Testament mention of the letters.
// Ties keep canonical order. The ranking is a heuristic, not a promise: it
// is tuned so the obvious verse for a common word is near the top, and the
// cap is reported honestly when more verses matched than are shown.
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
  /** Offsets of the best match inside `text`. */
  at: [number, number]
}

export interface ScriptureSearch {
  hits: ScriptureHit[]
  /** True when more verses matched than `hits` carries. */
  truncated: boolean
}

/** Shortest query that is searched; shorter ones match half the Bible. */
export const MIN_QUERY = 3
export const MAX_HITS = 50

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

// ─── scoring ────────────────────────────────────────────────────────────────

const SCORE_PHRASE = 1000
const SCORE_ALL_WORDS = 600
const SCORE_SUBSTRING = 100
const SCORE_DENSITY_MAX = 60
const SCORE_EARLY_MAX = 25
const SCORE_NT_PRIOR = 15
const FIRST_NT_BOOK = 40

// Word characters for the boundary test: letters (any script the BSB uses,
// including the accented names), digits and the apostrophe inside "LORD's".
const WORD_CHAR = /[\p{L}\p{N}’']/u

function isWordChar(s: string, i: number): boolean {
  return i >= 0 && i < s.length && WORD_CHAR.test(s[i])
}

/** First whole-word occurrence of `needle` in `hay` (both already folded), or -1. */
function wholeWordIndex(hay: string, needle: string): number {
  let from = 0
  for (;;) {
    const i = hay.indexOf(needle, from)
    if (i === -1) return -1
    if (!isWordChar(hay, i - 1) && !isWordChar(hay, i + needle.length)) return i
    from = i + 1
  }
}

interface Scored extends ScriptureHit {
  score: number
  order: number
}

/**
 * Scores one verse against the query, or returns null when it does not match
 * at all. `folded` is the verse text lower-cased once by the caller.
 */
function scoreVerse(
  folded: string,
  q: string,
  words: string[]
): { score: number; at: [number, number] } | null {
  // The phrase as typed, as whole words: the strongest signal.
  const phraseAt = wholeWordIndex(folded, q)
  let base: number
  let at: [number, number]
  if (phraseAt !== -1) {
    base = SCORE_PHRASE
    at = [phraseAt, phraseAt + q.length]
  } else {
    const sub = folded.indexOf(q)
    if (words.length > 1) {
      // Every word present as a whole word, anywhere in the verse. Anchor the
      // highlight on the first word's whole-word position so the reader sees
      // why the verse is here.
      const positions = words.map(w => wholeWordIndex(folded, w))
      if (positions.every(p => p !== -1)) {
        base = SCORE_ALL_WORDS
        at = [positions[0], positions[0] + words[0].length]
      } else if (sub !== -1) {
        // The phrase inside a longer word ("walk by faithfulness").
        base = SCORE_SUBSTRING + 30
        at = [sub, sub + q.length]
      } else {
        // Every word present somewhere, if only inside other words.
        const subs = words.map(w => folded.indexOf(w))
        if (subs.some(p => p === -1)) return null
        base = SCORE_SUBSTRING
        at = [subs[0], subs[0] + words[0].length]
      }
    } else if (sub !== -1) {
      base = SCORE_SUBSTRING
      at = [sub, sub + q.length]
    } else {
      return null
    }
  }

  // Density: a short verse where the match is most of the text beats a long
  // one where it is one word in forty. 0..SCORE_DENSITY_MAX, by length.
  const density = Math.max(0, SCORE_DENSITY_MAX * (1 - Math.min(folded.length, 400) / 400))
  // Early: a match in the first few words of the verse. 0..SCORE_EARLY_MAX.
  const early = Math.max(0, SCORE_EARLY_MAX * (1 - Math.min(at[0], 120) / 120))

  return { score: base + density + early, at }
}

/** The pure, ranked scan, exported for tests. */
export function scanBundle(data: BsbBundle, query: string, max = MAX_HITS): ScriptureSearch {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (q.length < MIN_QUERY) return { hits: [], truncated: false }
  const words = q.split(' ').filter(Boolean)
  const scored: Scored[] = []
  let order = 0
  const books = Object.keys(data)
    .map(Number)
    .sort((a, b) => a - b)
  for (const b of books) {
    const chapters = data[String(b)]
    const name = bookByNumber(b)?.name ?? `Book ${b}`
    const prior = b >= FIRST_NT_BOOK ? SCORE_NT_PRIOR : 0
    const nums = Object.keys(chapters)
      .map(Number)
      .sort((a, b2) => a - b2)
    for (const c of nums) {
      for (const [v, text] of chapters[String(c)]) {
        order++
        const folded = text.toLowerCase()
        // Cheap pre-check: a verse missing the first word cannot match at all.
        if (folded.indexOf(words[0]) === -1) continue
        const s = scoreVerse(folded, q, words)
        if (!s) continue
        scored.push({
          bookNumber: b,
          bookName: name,
          chapter: c,
          verse: v,
          text,
          at: s.at,
          score: s.score + prior,
          order
        })
      }
    }
  }
  scored.sort((x, y) => y.score - x.score || x.order - y.order)
  const truncated = scored.length > max
  const hits: ScriptureHit[] = scored.slice(0, max).map(h => ({
    bookNumber: h.bookNumber,
    bookName: h.bookName,
    chapter: h.chapter,
    verse: h.verse,
    text: h.text,
    at: h.at
  }))
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
