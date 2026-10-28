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

/**
 * The gutter mark's own line, higher than the entrance's. Measured on live
 * data (2026-10-28): at 30 the dot sat under 14 of John 1's 51 verses and 26
 * of Romans 8's 39, which is a texture, not a signal. At 50 it marks 8 and 16,
 * every verse of Psalm 23, two of Genesis 15 and one of Hosea 1 — the verses a
 * reader would actually want told about. The entrance still opens at THRESHOLD
 * once a verse is chosen; the dot only promises the strong cases.
 */
export const DEPTH_THRESHOLD = 50

/** Whether the gutter dot is earned by the connections alone. */
export function hasDepth(connections: RawConnection[]): boolean {
  const top = topScore(connections)
  return top !== null && top >= DEPTH_THRESHOLD
}

/**
 * The rows the dive-in shows, from the dataset's full list: strongest first,
 * only those that hold up against the strongest (a fifth of its score, and
 * never under the entrance line's half), and at most ROW_CAP of them. A verse
 * like John 1:1 carried 36 rows, most of them one-vote echoes; the reader
 * asked for the good ones, not the long tail (world-class pass 2026-10-28).
 * A parallel-account row (`keep`) is always kept, whatever its score.
 */
export const ROW_CAP = 8

export function selectRows<T extends RawConnection>(
  connections: T[],
  keep: (c: T) => boolean = () => false
): T[] {
  const top = topScore(connections)
  if (top === null) return []
  // A door that opened as a parallel account has low votes throughout (votes
  // measure doctrine, not narrative), so the floor would empty it; there the
  // cap alone applies.
  const floor = connections.some(keep) ? 0 : Math.max(THRESHOLD / 2, top * 0.2)
  const sorted = [...connections].sort((a, b) => b.score - a.score)
  const out: T[] = []
  for (const c of sorted) {
    if (keep(c)) {
      out.push(c)
      continue
    }
    if (c.score < floor) continue
    out.push(c)
  }
  const kept = out.filter(keep)
  const rest = out.filter(c => !keep(c)).slice(0, Math.max(0, ROW_CAP - kept.length))
  return sorted.filter(c => kept.includes(c) || rest.includes(c))
}

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

/**
 * Brief §8 step 2: the door exists only where the best connection clears the
 * line — or, since the dive-in redesign (docs/proposals/dive-in-2.md), where
 * the strongest row is a PARALLEL ACCOUNT of the same events. A narrative
 * verse like Galatians 1:17 scores 4 (votes are a doctrinal measure) yet its
 * top row, Acts 9:20-25, names Damascus and Jerusalem as this chapter does,
 * which is exactly the row a reader of the verse wants. `parallel` is that
 * fact, measured by `sharedPlaces` on the shipped place list, never guessed.
 */
export function doorOpens(connections: RawConnection[], parallel = false): boolean {
  const top = topScore(connections)
  if (top === null) return false
  return top >= THRESHOLD || parallel
}

/**
 * The place names two texts share, bounded to the names the chapter's own
 * place list carries (OpenBible geocoding, via the map bundle). A name that is
 * not a geocoded place of THIS chapter is never marked, so the marks can only
 * ever say "this passage names a place this chapter names" — a fact about the
 * two texts, not a claim about their relationship (dive-in-2.md, "Bounded by
 * the data"). Order follows `placeNames`; each name at most once.
 */
export function sharedPlaces(
  placeNames: readonly string[],
  source: string,
  target: string
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of placeNames) {
    if (!name || seen.has(name)) continue
    seen.add(name)
    const re = new RegExp(`(^|[^\\p{L}])${escapeRegExp(name)}(?![\\p{L}])`, 'u')
    if (re.test(source) && re.test(target)) out.push(name)
  }
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A window of a passage: the text to show and where it starts in the whole. */
export interface TextWindow {
  text: string
  /** Offset of `text[0]` in the original, so runs and marks can be shifted. */
  offset: number
}

/**
 * Where a clipped row should START so its two lines still show the words
 * that make it a connection. When the shared run (or the first shared place)
 * sits deeper than `deep` characters in, the window opens at the nearest
 * opening quote, sentence or clause boundary before it — whichever is closest
 * within its own reach — and the caller prefixes an ellipsis. Otherwise the
 * whole text, from the start.
 */
export function windowAround(text: string, at: number, deep = 48): TextWindow {
  if (at <= deep) return { text, offset: 0 }
  const before = text.slice(0, at)
  const quote = before.lastIndexOf('“')
  const sentence =
    Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! ')) + 2
  const clause =
    Math.max(before.lastIndexOf(', '), before.lastIndexOf('; '), before.lastIndexOf(': ')) + 2
  let start: number
  if (quote >= 0 && at - quote < 75) start = quote
  else if (sentence > 1 && at - sentence < 60) start = sentence
  else if (clause > 1 && at - clause < 40) start = clause
  else start = before.lastIndexOf(' ', Math.max(0, at - 30)) + 1
  return { text: text.slice(start), offset: start }
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

/**
 * Words too common to explain a link on their own. The dive-in shows a row
 * only where it can SAY why the two verses sit together (world-class pass
 * 2026-10-28: "I just don't understand why these verses are shown to me"),
 * and "God" or "said" is not a reason.
 */
const COMMON_WORDS: ReadonlySet<string> = new Set([
  'god',
  'lord',
  'said',
  'says',
  'will',
  'shall',
  'who',
  'whom',
  'him',
  'his',
  'her',
  'them',
  'they',
  'their',
  'you',
  'your',
  'not',
  'but',
  'for',
  'with',
  'from',
  'all',
  'are',
  'have',
  'has',
  'had',
  'this',
  'these',
  'those',
  'one',
  'man',
  'men',
  'then',
  'when',
  'there',
  'upon',
  'into',
  'out',
  'also',
  'may',
  'let',
  'now',
  'even',
  'thus',
  'because',
  'come',
  'came',
  'went',
  'make',
  'made',
  'give',
  'gave',
  'day',
  'days',
  'people',
  'before',
  'after',
  'over',
  'own'
])

/** A light stem so "waters" meets "water" and "created" meets "create". */
function stem(word: string): string {
  let w = word
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1)
  return w
}

/**
 * The content words two verses share, as they appear in the TARGET, in the
 * target's own order, at most `max`. This is the "why" of a row that neither
 * quotes the verse nor names one of its places: Genesis 1:2 and Psalm 104:30
 * sit together because both say "Spirit", "face" and "earth". Stop words,
 * common words and anything under four letters are never a reason.
 */
export function sharedWords(source: string, target: string, max = 4): string[] {
  const have = new Set(
    contentTokens(source)
      .map(t => t.word)
      .filter(w => w.length >= 4 && !COMMON_WORDS.has(w))
      .map(stem)
  )
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of contentTokens(target)) {
    if (t.word.length < 4 || COMMON_WORDS.has(t.word)) continue
    const s = stem(t.word)
    if (!have.has(s) || seen.has(s)) continue
    seen.add(s)
    out.push(target.slice(t.start, t.end))
    if (out.length >= max) break
  }
  return out
}
