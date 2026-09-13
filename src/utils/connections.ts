/**
 * The pure logic behind the connections door
 * (docs/proposals/connections-door.md).
 *
 * Three things live here, and all three are pure so they can be checked without
 * a network, a database or a browser:
 *
 *   - SALIENCE (§5). A verse has a door only when its strongest connection
 *     scores >= 30. Below that the verse has no door and nothing hints that it
 *     might — 93.5% of verses carry SOME connection, so "has one" is not a
 *     signal, only "has a strong one" is.
 *   - QUOTE vs ECHO (§4). Computed from OUR OWN verse text, in whatever
 *     translation is on screen, because the obvious dataset for this
 *     (spookylukey/bible-quotation-database) carries no licence at all and is
 *     therefore out of the build entirely (§3.2). A row is a `quote` only when
 *     a contiguous run of five or more non-trivial words stands in both
 *     verses; everything else is an `echo`. (The brief proposes four and
 *     forbids shipping that number unmeasured; QUOTE_MIN_WORDS below carries
 *     the measurement and why it landed on five.)
 *   - THE CACHE KEY (§7). Cross-references are addressed by (book, chapter)
 *     alone — the graph does not vary by translation — so one cached record
 *     serves a BSB, KJV, NET or Tamil reader alike.
 *
 * The classifier's bar is deliberately ASYMMETRIC: a false `quote` lights words
 * in a verse that never used them, which is a checkable claim about the text
 * that is simply false (§9). Precision matters more than recall, so the rule
 * requires a contiguous run rather than four words shared anywhere.
 */
import type { VerseConnection } from '../bible/provider'

/** §5's measured threshold: the top connection's score. ~5.5% of verses. */
export const SALIENCE_MIN_SCORE = 30

/**
 * FIVE, not the brief's provisional four — and this is the measurement pass §4
 * explicitly refused to ship without ("Do not ship the exact threshold above
 * without at least one such pass").
 *
 * The pass, run 2026-09-13 against live BSB text and live `open-cross-ref`
 * data: every reference scoring >= 30 in twelve chapters drawn across narrative,
 * law, psalm, prophet, gospel and epistle (Genesis 12/15/22, Deuteronomy 6,
 * Psalm 110, Isaiah 53, Matthew 4, Acts 3, Romans 4, Galatians 3, Hebrews 11,
 * Revelation 1) — 191 rows, hand-labelled.
 *
 *   at four words: 54 quotes, of which FOUR were false — runs made entirely of
 *     stock words, exactly the failure "and it came to pass" was meant to stand
 *     for. Hebrews 11:1 -> Romans 8:24 on "what we do not"; Revelation 1:3 ->
 *     Luke 11:28 on "are those who hear"; Genesis 15:1 -> Isaiah 41:10 and ->
 *     Genesis 26:24, both on "do not be afraid".
 *   at five words: 44 quotes, ZERO false.
 *   at six words: 29 quotes, zero false, but Romans 4:3 -> Genesis 15:6 — the
 *     single most famous quotation in the dataset — becomes an echo. Too strict.
 *
 * Five costs four genuine quotations (they read as echoes: Romans 4:9,
 * Galatians 3:13, Revelation 1:8 -> 22:13, Genesis 22:18), which is the right
 * trade: §9's bar is asymmetric on purpose. A missed quote is a row that reads
 * modestly; a false one lights words as a quotation that nobody quoted.
 */
export const QUOTE_MIN_WORDS = 5

/**
 * §4's list, verbatim. Small on purpose — it exists to stop stock formulae
 * scoring as quotations, not to strip a verse down to its content words.
 */
const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'that', 'is', 'was'])

/** One non-trivial word of a verse, with where it stands in the original text. */
export interface VerseToken {
  word: string
  /** Character offsets into the text this token came from. */
  start: number
  end: number
}

/**
 * The verse's non-trivial words, in order, each still pointing back at the
 * characters it came from — the offsets are what lets a matched phrase be lit
 * in the reader's own text rather than re-printed from the tokens.
 *
 * Apostrophes are dropped rather than split on, so "the LORD's" is one word;
 * both sides go through this same function, so the two always agree.
 */
export function verseTokens(text: string): VerseToken[] {
  const tokens: VerseToken[] = []
  const pattern = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu
  for (const match of text.matchAll(pattern)) {
    const raw = match[0]
    const word = raw.toLowerCase().replace(/['’]/g, '')
    if (!word || STOP_WORDS.has(word)) continue
    tokens.push({ word, start: match.index, end: match.index + raw.length })
  }
  return tokens
}

/**
 * The longest run of words standing contiguously (once the stop words are out)
 * in both verses, as a slice of the SECOND list. Classic longest-common-
 * substring dynamic programming; verses are a few dozen words, so the O(n·m)
 * table is nothing.
 */
function longestSharedRun(source: VerseToken[], target: VerseToken[]): VerseToken[] {
  let best = 0
  let endsAt = 0
  let previous = new Array<number>(target.length + 1).fill(0)
  for (let i = 1; i <= source.length; i++) {
    const row = new Array<number>(target.length + 1).fill(0)
    for (let j = 1; j <= target.length; j++) {
      if (source[i - 1].word !== target[j - 1].word) continue
      row[j] = previous[j - 1] + 1
      if (row[j] > best) {
        best = row[j]
        endsAt = j
      }
    }
    previous = row
  }
  return best === 0 ? [] : target.slice(endsAt - best, endsAt)
}

export interface ConnectionMatch {
  kind: 'quote' | 'echo'
  /**
   * The character span of the shared phrase in the TARGET text, for the one
   * row that earns a highlight. `null` on an echo — an echo has no phrase
   * anchor, and drawing one would be the fabrication §9 is about.
   */
  span: [number, number] | null
}

/**
 * §4's rule, applied to the two verses as the reader currently sees them.
 *
 * Both texts must be in the SAME translation: the connection itself is
 * translation-independent, but whether the wording visibly matches is not, and
 * never was. A row that reads "quotes" in the BSB may read "echoes" in the NET.
 * That is correct, not a bug.
 */
export function classifyConnection(sourceText: string, targetText: string): ConnectionMatch {
  const shared = longestSharedRun(verseTokens(sourceText), verseTokens(targetText))
  if (shared.length < QUOTE_MIN_WORDS) return { kind: 'echo', span: null }
  return { kind: 'quote', span: [shared[0].start, shared[shared.length - 1].end] }
}

/**
 * Does this verse have a connections door at all?
 *
 * Reads the MAXIMUM score rather than the first entry's. The API does return
 * each verse's references pre-sorted descending (0 violations across the
 * brief's 1,995-reference sample), but §2.2 records that as an observed
 * property of the data today, not a documented contract — and a door that
 * appears or vanishes on the strength of an undocumented sort order is not
 * worth the one line saved.
 */
export function hasConnectionsDoor(connections: VerseConnection[] | undefined): boolean {
  if (!connections || connections.length === 0) return false
  return connections.some(c => c.score >= SALIENCE_MIN_SCORE)
}

/**
 * The IndexedDB key for one chapter's connections. NO translation component,
 * unlike the chapter-text key beside it — see §7.
 */
export function connectionsCacheKey(bookNumber: number, chapter: number): string {
  return `connections/${bookNumber}/${chapter}`
}
