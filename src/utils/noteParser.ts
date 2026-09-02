import { NoteSegment, NoteSegmentType, NoteCategory, ParsedNote } from '../types'
import { BibleBook, BIBLE_BOOKS, buildCrossRefRegex, findBookByAlias } from './bibleBooks'
import { CATEGORY_KEY_SOURCE } from './noteCategories'

/* ─── @tags are parsed GENERICALLY ────────────────────────────────────────────
   This regex used to be built from the four built-in keys, which made the
   parser the hard blocker on user-owned categories: every note stores its
   category as an @tag inside its own content (`v4 @personal`), so a key the
   regex did not know did not exist as far as any surface was concerned.

   It now matches ANY key-shaped word and reports what it saw; whether that key
   is one the workspace owns is decided at the render and filter layer, which
   already has the definitions (useNoteCategories). That keeps parseNoteLine
   PURE — no key list threaded through every caller, no module-level registry to
   seed — and it is the only option that is also more CORRECT today, because it
   fixes a live bug: an unrecognised tag used to fall through as prose, so the
   wordless mark `v4 @typology` read as a written note whose entire text was
   "@typology". See src/utils/noteKind.ts and
   docs/proposals/custom-categories.md §3 (option C).

   THE LEADING (^|[^A-Za-z0-9_]) IS A CORRECTION TO THAT BRIEF, which claimed
   the `[a-z]` first character and the trailing `\b` were enough to leave email
   addresses alone. They are not: `paul@corinth.org` would have parsed
   `@corinth` as the note's category. A tag has to START a word. This also keeps
   the one behaviour change slice A does make — a bare `@word` in prose now
   renders as a neutral pill instead of plain text — down to the case the brief
   actually argued for.

   The key grammar itself lives in noteCategories.ts, so the pattern here and
   the validator there cannot drift.
   ──────────────────────────────────────────────────────────────────────────── */
const TAG_PATTERN = new RegExp(`(^|[^A-Za-z0-9_])@(${CATEGORY_KEY_SOURCE})\\b`, 'gi')

const VERSE_ANCHOR_PATTERN = /\bv(\d+)(?:-(\d+))?\b/g

/* Shorthand a reader may have typed by hand under the old parser, which
   accepted `@obs`/`@hist`/`@app`/`@per` as prefixes of the four keys. Retained
   so that content keeps resolving to the same category it always did.

   A Map, not an object literal, on purpose: an object lookup would resolve
   `@constructor` and `@toString` off Object.prototype and hand back a function.

   PREFIX MATCHING IS GONE and does not come back. `@pro` cannot mean both
   `prophecy` and `promises` once keys are the reader's; completion is the `@`
   dropdown's job, and it already inserts the full key. */
const LEGACY_ALIASES = new Map<string, string>([
  ['obs', 'observation'],
  ['hist', 'historical'],
  ['app', 'application'],
  ['per', 'personal']
])

/**
 * The key an @tag refers to. Lowercased, with the legacy shorthand resolved.
 *
 * There is deliberately NO default any more. The old version returned
 * 'observation' for anything it did not recognise, which could only ever
 * mis-file a note; an unknown tag is now that unknown key, and the render layer
 * decides what to do with it.
 */
function normalizeCategory(raw: string): NoteCategory {
  const lower = raw.toLowerCase()
  return LEGACY_ALIASES.get(lower) ?? lower
}

interface TokenMatch {
  type: NoteSegmentType
  index: number
  length: number
  raw: string
  display: string
  data?: NoteSegment['data']
}

export function parseNoteLine(text: string): ParsedNote {
  const tokens: TokenMatch[] = []

  // Find all verse anchors
  const verseRe = new RegExp(VERSE_ANCHOR_PATTERN.source, 'g')
  let m: RegExpExecArray | null
  while ((m = verseRe.exec(text)) !== null) {
    const startVerse = parseInt(m[1], 10)
    const endVerse = m[2] ? parseInt(m[2], 10) : undefined
    tokens.push({
      type: 'verse-anchor',
      index: m.index,
      length: m[0].length,
      raw: m[0],
      display: m[0],
      data: { startVerse, endVerse }
    })
  }

  // Find all tags. m[1] is the character before the '@' (empty at the start of
  // the line), consumed only to prove the tag starts a word — it is not part of
  // the token, so index and length step past it.
  const tagRe = new RegExp(TAG_PATTERN.source, 'gi')
  while ((m = tagRe.exec(text)) !== null) {
    const category = normalizeCategory(m[2])
    const index = m.index + m[1].length
    tokens.push({
      type: 'tag',
      index,
      length: m[0].length - m[1].length,
      raw: text.slice(index, index + m[0].length - m[1].length),
      display: `@${category}`,
      data: { category }
    })
  }

  // Find all cross-references
  const crossRefRe = buildCrossRefRegex()
  while ((m = crossRefRe.exec(text)) !== null) {
    tokens.push({
      type: 'cross-ref',
      index: m.index,
      length: m[0].length,
      raw: m[0],
      display: m[0],
      data: { reference: m[0] }
    })
  }

  // Sort by position, remove overlapping tokens (keep first match)
  tokens.sort((a, b) => a.index - b.index)
  const deduped: TokenMatch[] = []
  let cursor = 0
  for (const tok of tokens) {
    if (tok.index >= cursor) {
      deduped.push(tok)
      cursor = tok.index + tok.length
    }
  }

  // Build segments
  const segments: NoteSegment[] = []
  let pos = 0
  for (const tok of deduped) {
    if (tok.index > pos) {
      segments.push({
        type: 'text',
        raw: text.slice(pos, tok.index),
        display: text.slice(pos, tok.index)
      })
    }
    segments.push({
      type: tok.type,
      raw: tok.raw,
      display: tok.display,
      data: tok.data
    })
    pos = tok.index + tok.length
  }
  if (pos < text.length) {
    segments.push({ type: 'text', raw: text.slice(pos), display: text.slice(pos) })
  }

  // Extract metadata from the parsed line
  let anchorStart: number | null = null
  let anchorEnd: number | null = null
  let category: NoteCategory | null = null
  const crossRefs: string[] = []

  for (const seg of segments) {
    if (seg.type === 'verse-anchor' && seg.data?.startVerse != null) {
      if (anchorStart === null) {
        anchorStart = seg.data.startVerse
        anchorEnd = seg.data.endVerse ?? seg.data.startVerse
      }
    } else if (seg.type === 'tag' && seg.data?.category) {
      if (!category) category = seg.data.category
    } else if (seg.type === 'cross-ref' && seg.data?.reference) {
      crossRefs.push(seg.data.reference)
    }
  }

  return { segments, anchorStart, anchorEnd, category, crossRefs }
}

export function parseReferenceLabel(label: string): {
  chapter_start: number
  verse_start: number
  chapter_end: number
  verse_end: number
} | null {
  // Handle "Book ch:v-v" or "Book ch:v - ch:v"
  const simple = /(\d+):(\d+)(?:\s*-\s*(?:(\d+):)?(\d+))?/.exec(label)
  if (!simple) return null
  const chapter_start = parseInt(simple[1], 10)
  const verse_start = parseInt(simple[2], 10)
  const chapter_end = simple[3] ? parseInt(simple[3], 10) : chapter_start
  const verse_end = simple[4] ? parseInt(simple[4], 10) : verse_start
  return { chapter_start, verse_start, chapter_end, verse_end }
}

export interface ScriptureQuery {
  bookNumber: number
  bookName: string
  chapter: number
  // Optional target verse (e.g. the ":13" in "mat 2:13"); null when only a
  // book (chapter defaults to 1) or a book+chapter was typed.
  verse: number | null
  // 'book' = bare book name/prefix, chapter is always 1 (no chapter typed).
  // 'chapter' = book + chapter, no verse.
  // 'verse' = book + chapter:verse.
  kind: 'book' | 'chapter' | 'verse'
}

const MAX_SCRIPTURE_RESULTS = 5

// Rank candidate books for a bare (chapterless) book token so ambiguous
// prefixes ("j", "jo") surface a short, sensibly-ordered list instead of
// nothing or an arbitrary single pick. Order: exact alias match first, then
// startsWith matches, then contains matches; ties broken by canonical book
// order (shorter/earlier books first, matching BIBLE_BOOKS/USFM order).
function rankBookCandidates(token: string): BibleBook[] {
  const needle = token.toLowerCase().trim()
  if (!needle) return []

  const exact: BibleBook[] = []
  const startsWith: BibleBook[] = []
  const contains: BibleBook[] = []
  const seen = new Set<number>()

  for (const book of BIBLE_BOOKS) {
    if (seen.has(book.number)) continue
    const candidates = [...book.aliases, book.name.toLowerCase(), book.abbreviation.toLowerCase()]
    if (candidates.some(a => a === needle)) {
      exact.push(book)
      seen.add(book.number)
    } else if (candidates.some(a => a.startsWith(needle))) {
      startsWith.push(book)
      seen.add(book.number)
    } else if (candidates.some(a => a.includes(needle))) {
      contains.push(book)
      seen.add(book.number)
    }
  }

  return [...exact, ...startsWith, ...contains].slice(0, MAX_SCRIPTURE_RESULTS)
}

/**
 * Smart-parse a free-text search query into scripture reference jump targets
 * (e.g. "mat 2:13", "john 1", "1 cor 13:4", "matthew", "j"). Reuses the
 * book-alias table so abbreviations resolve exactly as the reference input
 * does. Returns an empty array when nothing plausible matches.
 *
 * Shapes handled:
 *   - "<book>"                 -> book jump(s) (kind: 'book', chapter 1).
 *       An unambiguous alias/prefix yields exactly one result; an ambiguous
 *       prefix (e.g. "j", "jo") yields a ranked, capped list — see
 *       rankBookCandidates for the ordering/cap rule.
 *   - "<book> <chapter>"       -> single chapter jump (kind: 'chapter').
 *   - "<book> <chapter>:<verse>" -> single verse jump (kind: 'verse').
 *
 * This is reference PARSING only — it never searches verse text (that's a
 * separate, backlogged feature). Chapter is clamped to the book's real
 * chapter count so a jump target is always valid. Pure function.
 */
export function parseScriptureQuery(query: string): ScriptureQuery[] {
  const trimmed = query.trim().replace(/\s+/g, ' ')
  if (!trimmed) return []

  // "<book> <chapter>[:<verse>]" — book + a trailing chapter[:verse].
  const withChapter = /^(.+?)\s+(\d+)(?::(\d+))?\s*$/.exec(trimmed)
  if (withChapter) {
    const book = findBookByAlias(withChapter[1])
    if (book) {
      let chapter = parseInt(withChapter[2], 10)
      if (chapter < 1) chapter = 1
      if (chapter > book.chapters) chapter = book.chapters

      const verse = withChapter[3] ? parseInt(withChapter[3], 10) : null

      return [
        {
          bookNumber: book.number,
          bookName: book.name,
          chapter,
          verse,
          kind: verse != null ? 'verse' : 'chapter'
        }
      ]
    }
    // Falls through to bare-book matching below (e.g. a book name that
    // happens to be followed by a non-book, non-numeric token won't match
    // here anyway since the regex requires a trailing number).
  }

  // Bare book name/prefix — no chapter typed. Rank candidates so ambiguous
  // prefixes surface multiple results.
  const candidates = rankBookCandidates(trimmed)
  return candidates.map(book => ({
    bookNumber: book.number,
    bookName: book.name,
    chapter: 1,
    verse: null,
    kind: 'book' as const
  }))
}
