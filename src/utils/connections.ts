/**
 * The connections door's pure logic — docs/proposals/connections-door.md.
 *
 * Three decisions live here and nowhere else, so each is testable without a
 * network or a DOM:
 *
 *   1. SALIENCE (brief §5). A verse has a door only when its single strongest
 *      connection scores at or above THRESHOLD. 93.5% of verses carry at least
 *      one connection, so "has any" is not a door — the strength of the best
 *      one is. Below the line: nothing, and nothing hints.
 *   2. QUOTE vs ECHO (brief §4). A row is a quote ONLY when four or more
 *      non-trivial words run contiguously through both verses' own text in the
 *      translation on screen. Everything else is an echo. This is computed from
 *      text Lantern already has the rights to; the quotation database the
 *      prototype assumed is unlicensed and is not used in any form (§3.2).
 *      Precision beats recall here: a false "quotes" fabricates a relationship
 *      between two verses, which is the one failure that would embarrass the
 *      feature (§9).
 *   3. THE CACHE KEY. Connections are addressed by book and chapter alone and
 *      do not vary by translation, so one cached chapter serves BSB, KJV and
 *      Tamil readers alike (§7).
 */

/** One outgoing cross-reference as the dataset carries it, resolved to our book numbers. */
export interface RawConnection {
  book: number
  chapter: number
  verse: number
  endVerse?: number
  /** OpenBible's relevance weighting: unbounded, occasionally negative. Never shown. */
  score: number
}

/** `{ "<verse>": RawConnection[] }` — one chapter's outgoing lists, in the dataset's own order. */
export type ChapterConnections = Record<number, RawConnection[]>

export type ConnectionKind = 'quotes' | 'echoes'

/** Brief §5: the recommended salience line, measured over a 200-verse sample. */
export const THRESHOLD = 30

/** Brief §4: how many shared non-trivial words make a quote. */
export const QUOTE_RUN = 4

/** Brief §4's stop-word list, exactly. Deliberately small: only function words. */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'and',
  'of',
  'to',
  'in',
  'that',
  'is',
  'was'
])

/** Where one chapter's connections live in the IndexedDB cache — translation-free on purpose. */
export function connectionsCacheKey(book: number, chapter: number): string {
  return `xref/${book}/${chapter}`
}

/**
 * The connections a verse may show: the dataset's own order, minus rows the
 * dataset itself votes against (a negative or zero score is OpenBible's own
 * "no", and the door adds nothing evaluative in either direction).
 */
export function connectionsForVerse(chapter: ChapterConnections, verse: number): RawConnection[] {
  return (chapter[verse] ?? []).filter(c => c.score > 0)
}

/** The strongest connection's score, or null where the verse has none. */
export function topScore(connections: RawConnection[]): number | null {
  if (connections.length === 0) return null
  return connections.reduce((best, c) => Math.max(best, c.score), -Infinity)
}

/** Brief §8 step 2: the door exists only where the best connection clears the line. */
export function doorOpens(connections: RawConnection[]): boolean {
  const top = topScore(connections)
  return top !== null && top >= THRESHOLD
}

interface Token {
  word: string
  start: number
  end: number
}

/**
 * The non-trivial words of a verse with their character offsets, so a shared
 * run can be lit in the text it was found in. Case-folded, punctuation dropped,
 * stop words removed. Unicode-aware so a Tamil verse tokenizes too (a quote
 * there is a quote there).
 */
export function contentTokens(text: string): Token[] {
  const out: Token[] = []
  const re = /[\p{L}\p{M}\p{N}’']+/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const word = m[0].replace(/[’']/g, '').toLowerCase()
    if (!word || STOP_WORDS.has(word)) continue
    out.push({ word, start: m.index, end: m.index + m[0].length })
  }
  return out
}

/** A run of shared words, as character offsets into each text. */
export interface SharedRun {
  /** Offsets into the SOURCE text (the verse the reader is holding). */
  source: [number, number]
  /** Offsets into the TARGET text (the connected verse). */
  target: [number, number]
  words: number
}

/**
 * The longest contiguous run of non-trivial words the two texts share, or null
 * where none reaches QUOTE_RUN. Contiguity is over the content tokens: "it was
 * credited to him as righteousness" is one run of four (credited, him, as,
 * righteousness) even though stop words sit between them in the sentence.
 */
export function sharedRun(source: string, target: string): SharedRun | null {
  const a = contentTokens(source)
  const b = contentTokens(target)
  if (a.length < QUOTE_RUN || b.length < QUOTE_RUN) return null
  // Classic longest-common-substring over token arrays; verses are short.
  let best = 0
  let endA = 0
  let endB = 0
  let prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1].word === b[j - 1].word) {
        cur[j] = prev[j - 1] + 1
        if (cur[j] > best) {
          best = cur[j]
          endA = i
          endB = j
        }
      }
    }
    prev = cur
  }
  if (best < QUOTE_RUN) return null
  return {
    source: [a[endA - best].start, a[endA - 1].end],
    target: [b[endB - best].start, b[endB - 1].end],
    words: best
  }
}

/** Brief §4's rule, as a label. */
export function classify(source: string, target: string): ConnectionKind {
  return sharedRun(source, target) ? 'quotes' : 'echoes'
}
