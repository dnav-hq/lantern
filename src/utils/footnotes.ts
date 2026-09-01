import { BIBLE_BOOKS } from './bibleBooks'

// Classifying the BSB's own footnotes, per docs/proposals/footnotes-door.md §3.
//
// A footnote is a translator saying "I had a choice here". Some of those
// choices are about ENGLISH — "Or *futile*", "Literally *the temple*" — and
// they are the cheapest honest reason a reader has to look closer. Others are
// about the MANUSCRIPTS — "Some manuscripts omit this question" — and the brief
// (§6) holds those back entirely: not gated behind a tap, not shown greyed,
// simply absent, because a gate controls when a reader meets a claim they still
// cannot evaluate, and the framing sentence that would fix that is a conclusion
// about textual transmission this app has no business authoring.
//
// So this module's whole job is one line: which notes may a reader see. Only
// `rendering` ships.
//
// MEASURED, not asserted. The classes below are what the BSB's 4,853 notes
// actually are (read in bulk, then hand-audited twice — brief §3.3/§3.5), and
// the counts in the table are reproduced exactly by this implementation against
// a live fetch of GET /api/BSB/complete.json (re-run 2026-09-01):
//
//   rendering 2,099 · variant 880 · gloss 700 · citation 591 · measure 350
//   · supplied 13 · other 220
//
// The first two, plus `supplied` and `measure`, match the brief to the note.
// The citation/gloss/other split lands slightly differently (brief: 592/666/253)
// because §3.2 prints those three leads as sketches rather than regexes; all
// three are HOLD classes, so the difference cannot reach a reader. See the
// brief's §11 note for the re-run.
//
// BSB-SHAPED, AND NOT REUSABLE BLIND. Run against the KJV's 6,959 helloao
// footnotes, every single one falls into `other` — the KJV's apparatus is a
// different format ("1.4 the light from…: Heb. between the light and…") and
// needs its own parser and its own audit (brief §3.6). Tamil (533 + 892 notes)
// is not English at all. helloao.ts gates footnote reading on the translation
// for exactly this reason.
export type FootnoteClass =
  | 'rendering' // an alternate ENGLISH rendering — the only class that ships
  | 'variant' // a manuscript reads differently — held, per §6
  | 'supplied' // the source text lacks a word the translators supplied — held
  | 'citation' // a cross-reference to another passage
  | 'measure' // a units conversion ("15 cubits is approximately 22.5 feet")
  | 'gloss' // an explanation of a name or term ("That is, Babylonia")
  | 'other'

// Manuscript witnesses and text families, EXPLICIT rather than "any all-caps
// token" — because the BSB's all-caps tokens include LORD (97), YAH (16),
// YHWH (7) and GOD (3), and an all-caps heuristic would read the divine name
// as a manuscript witness (brief §3.2).
const SIGLA = [
  'MT',
  'LXX',
  'DSS',
  'SP',
  'BYZ',
  'TR',
  'WH',
  'NA',
  'NE',
  'SBL',
  'ECM',
  'GOC',
  'Syriac',
  'Vulgate',
  'Targum',
  'Tischendorf',
  'Samaritan Pentateuch',
  'Masoretic'
]
const SIGLA_ALT = SIGLA.join('|')

// A siglum LEADING a clause — at the start, or after ". ", "; ", ") " — is
// introducing alternative text. A siglum cited mid-clause in SUPPORT of the
// printed reading ("Or *not a nation*; see also LXX", 49 of the 1,336 "Or …"
// notes) is not, and must stay shippable.
const VARIANT_LEAD = new RegExp(`(^|[;.]\\s+|\\)\\s+)(?!see|cited|compare)(${SIGLA_ALT})\\b`)
const SIGLUM_ANYWHERE = new RegExp(`\\b(${SIGLA_ALT})\\b`)
const OMISSION = /\b(does not include|do not include|does not contain|lacks?|omits?)\b/i
const SUPPLIED_LEAD =
  /\b(Hebrew|Greek|Aramaic|Latin)\s+(does not include|lacks|does not contain)\b/i

// "Cited in 2 Corinthians 4:6", "See Galatians 3:8", "Psalms 118:26". Book
// names come from the existing table rather than a second hand-written list.
const BOOK_ALT = BIBLE_BOOKS.map(b => b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length)
  .join('|')
const REFERENCE_ANYWHERE = new RegExp(`\\b(${BOOK_ALT})\\s+\\d`)
const REFERENCE_LEAD = new RegExp(`^(${BOOK_ALT})\\s+\\d+:\\d`)

// "Or …", "Literally …", "Hebrew *El-Shaddai*", "Forms of the Hebrew *chesed*…".
// Note "Hebrew " with a SPACE: "Hebrew; …" means the opposite thing and is
// caught two tests earlier.
const RENDERING_LEAD =
  /^(Or\b|Literally\b|Hebrew |Greek |Aramaic |Possibly\b|Probably\b|Perhaps\b|Forms of the\b|The (Hebrew|Greek|Aramaic)\b)/
const NAME = "[A-Z][\\w’'\\-]*"
const GLOSS_LEAD = new RegExp(
  `^That is,|^${NAME} means\\b|^${NAME} (is|was) (a|an|the|probably|another)\\b`
)

/**
 * Which kind of note this is. Ordered tests, first match wins — and the ORDER
 * is the safety property: every test that can produce a hold runs before every
 * test that can produce a ship, so a note that is both "Or …" and "Some
 * manuscripts …" is held.
 */
export function classifyFootnote(text: string): FootnoteClass {
  const t = text.trim()
  // 1. HOLD — any mention of manuscripts at all.
  if (/\bmanuscripts?\b/i.test(t)) return 'variant'
  // 2. HOLD — "Hebrew; …" / "Aramaic, …": the BSB followed the source text and
  //    something else reads differently. The punctuation is the whole signal —
  //    "Hebrew *El-Shaddai*" (324 notes) reports the word behind the English and
  //    ships; "Hebrew; LXX *west, and the Jordan*" (84) does not.
  if (/^(Hebrew|Aramaic|Greek)[;,]/.test(t)) return 'variant'
  // 3. HOLD — a siglum introducing a clause.
  if (VARIANT_LEAD.test(t)) return 'variant'
  // 4. HOLD — omission language plus a siglum anywhere.
  if (OMISSION.test(t) && SIGLUM_ANYWHERE.test(t)) return 'variant'
  // 5. HOLD — omission against the source text with no siglum. This class only
  //    exists because the first audit found it: four of these were missed, and
  //    two would have SHIPPED. Reading them, most are the translators supplying
  //    a clarifying word the Hebrew lacks — arguably ideal material — but they
  //    are indistinguishable by prose shape from "the Hebrew lacks this clause",
  //    they are 0.3% of the corpus, and holding them costs the reader nothing.
  if (SUPPLIED_LEAD.test(t)) return 'supplied'
  // 6-9. SHIP or ignore.
  if (/^Cited in\b/.test(t) || (/^See\b/.test(t) && REFERENCE_ANYWHERE.test(t))) return 'citation'
  if (REFERENCE_LEAD.test(t)) return 'citation'
  if (/\bapproximately\b/.test(t)) return 'measure'
  if (RENDERING_LEAD.test(t)) return 'rendering'
  if (GLOSS_LEAD.test(t)) return 'gloss'
  return 'other'
}

/** True only for the alternate-rendering class — the one a reader may see. */
export function footnoteShips(text: string): boolean {
  return classifyFootnote(text) === 'rendering'
}
