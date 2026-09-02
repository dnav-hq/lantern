// The word index — shapes and pure logic for the original-language word door.
//
// Slice 1 of the word door (docs/proposals/word-door-guardrails.md). NOTHING in
// here renders; it is the vocabulary the build script and a later door share, so
// that the numbers baked into the shipped data and the numbers a component would
// compute can never drift apart.
//
// The build script (scripts/build-word-index.mjs) imports these same functions
// via tsx, deliberately: `groupRenderings` is an EDITORIAL transformation whose
// output ships as data, so it has to be one implementation with one test, not a
// copy in a .mjs and a copy here.
//
// Nothing below may import a Node API — this file lives under src/ and obeys the
// pure-web rule in CLAUDE.md.

/** "H1892" / "G0026" — the letter plus a zero-padded four-digit Strong's number. */
export type StrongsKey = string

/** A verse reference packed into one integer: book * 1e6 + chapter * 1e3 + verse. */
export type PackedRef = number

/** A distinct BSB rendering and how many times it is used. */
export type RenderingCount = [form: string, count: number]

/**
 * One occurrence as it sits on disk: where it stands, an INDEX into the entry's
 * own `w` table of distinct English renderings, and an index into the parsing
 * table. The indirection is redundancy removal, not obfuscation — renderings
 * repeat heavily. `decodeOccurrence` puts the strings back.
 */
export type RawOccurrence = [ref: PackedRef, form: number, parsing: number]

/** A lemma exactly as it is stored in public/bible/words/lemmas/<shard>.json.gz. */
export interface RawLemmaEntry {
  /** Lemma (lexicon), or the first attested form where no lexicon covers it. */
  l: string
  /** Transliteration. */
  t: string
  /** STEPBible morph class ("H:N-M"), or '' where the lexicon does not cover it. */
  m: string
  /** Tyndale glosses (CC BY). EMPTY for the 542 lemmas no lexicon covers. */
  g: string[]
  /**
   * Sense text. GREEK ONLY — TBESG's Meaning column is Abbott-Smith / Middle
   * Liddell, both public domain. Hebrew is deliberately absent: TBESH's Meaning
   * column is Abridged BDB (c) Online Bible and needs a permission this project
   * does not hold. See the brief, section 4.2.
   */
  s: string[]
  /** Total occurrences in the BSB Translation Tables. */
  n: number
  /** Distinct BSB renderings, case-folded, most-used first. The RAW figure. */
  r: RenderingCount[]
  /** The same renderings collapsed by head word. An EDITORIAL grouping, never a fact. */
  rg: RenderingCount[]
  /** Distinct English renderings, case as the BSB prints it, in first-seen order. */
  w: string[]
  /** Every occurrence, in canonical order. */
  o: RawOccurrence[]
}

/** One occurrence with its strings restored. */
export interface Occurrence {
  ref: PackedRef
  book: number
  chapter: number
  verse: number
  /** The English word or words the BSB uses here. */
  english: string
  /** Morphology in full English — the EXPANDED column, per brief section 9a. */
  morphology: string
  /** The terse code the tables also ship ("Prep-b | N-mpc | 3mp"). Rides along. */
  morphologyCode: string
}

/** The parsing table: id -> [expanded English, terse code]. Expanded is primary. */
export type ParsingEntry = [expanded: string, terse: string]

/** One word of a verse as stored in public/bible/words/verses/<book>.json.gz. */
export type VerseWord = [english: string, strongs: StrongsKey, translit: string, parsing: number]

export function packRef(book: number, chapter: number, verse: number): PackedRef {
  return book * 1_000_000 + chapter * 1_000 + verse
}

export function unpackRef(ref: PackedRef): { book: number; chapter: number; verse: number } {
  return {
    book: Math.floor(ref / 1_000_000),
    chapter: Math.floor(ref / 1_000) % 1_000,
    verse: ref % 1_000
  }
}

/** "H" + 1892 -> "H1892". Four digits, matching the STEPBible eStrong# spelling. */
export function strongsKey(language: 'H' | 'G', number: number | string): StrongsKey {
  return language + String(number).padStart(4, '0')
}

/**
 * Which lemma shard a Strong's number lives in. Range buckets, so the key is
 * derivable from the number alone — no manifest lookup on the hot path.
 * "H1892" -> "H07" (1892 / 250 = 7).
 *
 * 250 rather than 500 because the shard is what a single word tap fetches: at
 * 500 the median shard measured 144 KB, at 250 it is roughly half that, which
 * puts a door in the same weight class as the median per-book shard the brief
 * budgeted for (section 5.3).
 */
export const LEMMA_SHARD_SIZE = 250

export function lemmaShard(key: StrongsKey): string {
  const language = key[0]
  const number = Number(key.slice(1))
  return language + String(Math.floor(number / LEMMA_SHARD_SIZE)).padStart(2, '0')
}

/**
 * Words stripped from the FRONT of a BSB rendering to find its head word.
 *
 * Articles, prepositions, conjunctions and copulas: the words English needs to
 * make a phrase but which say nothing about the lemma. "is futile", "to be
 * futile" and "are futile" are the same rendering wearing different grammar.
 *
 * Deliberately does NOT include possessives ("my", "their", "his"): "with their
 * worthless idols" and "worthless idols" collapse on the preposition alone, and
 * stripping possessives too starts merging renderings that differ in substance.
 */
const LEADING_FUNCTION_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'of',
  'in',
  'on',
  'at',
  'to',
  'into',
  'unto',
  'upon',
  'for',
  'from',
  'with',
  'by',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'am'
])

/**
 * The head word of one BSB rendering.
 *
 * This is an editorial transformation and the UI must label it as one (brief
 * section 9a, decision 1): it lowercases, drops the translators' bracketed
 * supplied words, then strips leading function words. "[is] but a vapor" ->
 * "vapor". A rendering that is nothing but function words keeps its case-folded
 * self rather than collapsing to the empty string.
 */
export function headWord(form: string): string {
  const debracketed = form
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!debracketed) return form.toLowerCase().trim()
  const words = debracketed.split(' ')
  let i = 0
  while (i < words.length - 1 && LEADING_FUNCTION_WORDS.has(stripPunctuation(words[i]))) i++
  return words.slice(i).join(' ')
}

function stripPunctuation(word: string): string {
  return word.replace(/[^a-z']/g, '')
}

/** Case-fold a raw BSB rendering. The RAW distinct-forms figure counts these. */
export function normalizeRendering(form: string): string {
  return form.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Count distinct renderings, most-used first, ties broken alphabetically. */
export function countRenderings(forms: Iterable<string>): RenderingCount[] {
  const counts = new Map<string, number>()
  for (const form of forms) {
    const key = normalizeRendering(form)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return sortCounts(counts)
}

/**
 * The head-word grouping of a set of renderings. Takes the RAW counts so the
 * caller keeps both numbers — the brief requires the honest pair, not a
 * replacement (brief section 9a, decision 1).
 */
export function groupRenderings(renderings: RenderingCount[]): RenderingCount[] {
  const counts = new Map<string, number>()
  for (const [form, count] of renderings) {
    const head = headWord(form)
    counts.set(head, (counts.get(head) ?? 0) + count)
  }
  return sortCounts(counts)
}

// Ties break on code-point order, NOT localeCompare. This ordering is baked into
// the shipped data by the build script, so it must not depend on the locale of
// whichever machine ran the build.
function sortCounts(counts: Map<string, number>): RenderingCount[] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
}

/** Restore one occurrence's strings from the entry's own tables. */
export function decodeOccurrence(
  entry: Pick<RawLemmaEntry, 'w'>,
  occurrence: RawOccurrence,
  parsingTable: ParsingEntry[]
): Occurrence {
  const [ref, form, parsing] = occurrence
  const [expanded, terse] = parsingTable[parsing] ?? ['', '']
  return {
    ref,
    ...unpackRef(ref),
    english: entry.w[form] ?? '',
    morphology: expanded,
    morphologyCode: terse
  }
}

/**
 * A lemma no lexicon covers is an honest door, not an error (brief section 4.3):
 * form, transliteration, morphology and occurrences with no gloss. Callers must
 * render the door anyway rather than filtering it out.
 */
export function hasGloss(entry: Pick<RawLemmaEntry, 'g'>): boolean {
  return entry.g.length > 0
}
