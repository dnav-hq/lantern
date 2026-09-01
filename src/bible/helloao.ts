import type { BibleProvider, BibleVerseLine, VerseNote } from './provider'
import { CodedError } from '../errors'
import { footnoteShips } from '../utils/footnotes'

// Scripture via the free, keyless bible.helloao.org API, for any translation
// helloao serves. Endpoint: GET
// https://bible.helloao.org/api/{translation}/{USFM}/{chapter}.json
// Verified against a live fetch (2026-07-05): the response is
//   { translation, book, chapter: { number, content: [...] }, footnotes?, ... }
// `chapter.content` is a flat array of typed nodes:
//   { type: 'heading', content: string[] }
//   { type: 'line_break' }
//   { type: 'hebrew_subtitle', content: string[] }
//   { type: 'verse', number: number, content: VerseContentItem[] }
// A verse's `content` array mixes plain strings with inline objects:
//   string                          -- plain text run
//   { noteId: number }               -- footnote marker, no visible text
//   { lineBreak: true }               -- poetic line break, becomes a space
//   { text: string, poem?: number }   -- poetry line (Psalms etc.)
// We flatten all of that down to a single plain-text string per verse. The
// poem-line structure is still dropped; the footnote markers are NOT any more
// — see verseNotesFor below and docs/proposals/footnotes-door.md §5.5.

const BASE_URL = 'https://bible.helloao.org/api'

// USFM 3-letter book codes used by helloao, indexed by book_number (1-66).
// Verified against GET /api/BSB/books.json — a handful (EZK, JOL, NAM, SNG)
// differ from this repo's internal `BibleBook.id` in src/utils/bibleBooks.ts,
// so this table is kept independent rather than derived from it. Re-verified
// against GET /api/tam_irv/books.json (2026-08-21): the Tamil translations use
// the SAME 66 codes in the same order, and a sample chapter (tam_irv JHN 1)
// returns the same node shape with the same 51 verse numbers — so this table
// and the flattener below are translation-independent, and note anchoring by
// verse number survives a language switch untouched.
const USFM_BY_BOOK_NUMBER: Record<number, string> = {
  1: 'GEN',
  2: 'EXO',
  3: 'LEV',
  4: 'NUM',
  5: 'DEU',
  6: 'JOS',
  7: 'JDG',
  8: 'RUT',
  9: '1SA',
  10: '2SA',
  11: '1KI',
  12: '2KI',
  13: '1CH',
  14: '2CH',
  15: 'EZR',
  16: 'NEH',
  17: 'EST',
  18: 'JOB',
  19: 'PSA',
  20: 'PRO',
  21: 'ECC',
  22: 'SNG',
  23: 'ISA',
  24: 'JER',
  25: 'LAM',
  26: 'EZK',
  27: 'DAN',
  28: 'HOS',
  29: 'JOL',
  30: 'AMO',
  31: 'OBA',
  32: 'JON',
  33: 'MIC',
  34: 'NAM',
  35: 'HAB',
  36: 'ZEP',
  37: 'HAG',
  38: 'ZEC',
  39: 'MAL',
  40: 'MAT',
  41: 'MRK',
  42: 'LUK',
  43: 'JHN',
  44: 'ACT',
  45: 'ROM',
  46: '1CO',
  47: '2CO',
  48: 'GAL',
  49: 'EPH',
  50: 'PHP',
  51: 'COL',
  52: '1TH',
  53: '2TH',
  54: '1TI',
  55: '2TI',
  56: 'TIT',
  57: 'PHM',
  58: 'HEB',
  59: 'JAS',
  60: '1PE',
  61: '2PE',
  62: '1JN',
  63: '2JN',
  64: '3JN',
  65: 'JUD',
  66: 'REV'
}

export function usfmForBookNumber(bookNumber: number): string | undefined {
  return USFM_BY_BOOK_NUMBER[bookNumber]
}

type VerseContentItem =
  string | { noteId: number } | { lineBreak: true } | { text: string; poem?: number }

interface ChapterContentNode {
  type: 'heading' | 'verse' | 'line_break' | 'hebrew_subtitle'
  content?: VerseContentItem[]
  number?: number
}

interface HelloaoFootnote {
  noteId: number
  text: string
  reference?: { chapter: number; verse: number }
}

interface HelloaoChapterResponse {
  chapter: {
    number: number
    content: ChapterContentNode[]
    footnotes?: HelloaoFootnote[]
  }
}

// WHICH TRANSLATIONS' FOOTNOTES WE MAY READ AT ALL. Structural, not a filter,
// and deliberately a hard-coded allow-list rather than a deny-list:
//
//  - `eng_net`: the NET licence grants the TEXT ONLY — its ~60,000 translator
//    notes are excluded and are not ours. helloao's eng_net nonetheless leaks
//    39 of them (measured 2026-08-31; 19 begin "Translator's Note"), which is
//    precisely the material we may not render. So the NET provider must never
//    READ the array, rather than read it and filter (brief §8).
//  - `eng_kjv` uses this file only for its USFM table; kjv.ts has its own
//    flattener. Its apparatus is a different format entirely (brief §3.6).
//  - `tam_irv` / `tam_tcv`: real notes, but the classifier keys on English
//    leading phrases and would call every one of them `other`. Tamil footnotes
//    need a Tamil reader to design for, not a regex.
const FOOTNOTE_TRANSLATIONS = new Set(['BSB'])

// Exported for the offset tests (src/utils/footnotes.test.ts), which assert the
// anchored SUBSTRING against real fetched chapters — an offset assertion alone
// is a test you can make pass by copying the current wrong answer.
export function flattenVerseContent(content: VerseContentItem[]): string {
  const parts: string[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item)
    } else if ('text' in item) {
      parts.push(item.text)
    }
    // { noteId } and { lineBreak: true } contribute no visible text; a space
    // is enough to keep words from running together across a line break.
  }
  return parts
    .join(' ')
    .replace(/\s+([,.;:!?”’])/g, '$1') // no space before closing punctuation
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// The anchors: turn each `{ noteId }` marker sitting in a verse's content into
// a character offset into that verse's flattened text.
//
// THIS IS THE FIDDLIEST CORRECTNESS DETAIL IN THE FEATURE, and it fails
// silently and beautifully — a wrong offset does not throw, does not fail a
// type check, and shows up only as an underline under the wrong word, which
// tells the reader that Lantern thinks the translators flagged a word they did
// not. So it is computed rather than estimated, and then CHECKED:
//
//   offset = flattenVerseContent(everything before the marker).length
//
// which is exact because the flattener is deterministic and its joining rules
// are local — it collapses runs of whitespace and eats the space before closing
// punctuation, and both of those only ever shorten text at or after the
// boundary, never inside the prefix. The guard is the second half: unless the
// prefix flattens to a genuine prefix OF the verse text, we cannot say where
// the phrase ends, so the note is DROPPED rather than anchored somewhere
// plausible. Same for a marker with nothing before it. Dropping is safe in
// exactly the way §6 requires — a dropped note leaves no marker, no count and
// no placeholder, so the verse reads as one with nothing to say.
// (Measured across all 1,189 BSB chapters on 2026-09-01: 2,099 ship-set notes,
// 0 dropped for either reason.)
function verseNotesFor(
  content: VerseContentItem[],
  text: string,
  footnotes: Map<number, HelloaoFootnote>
): VerseNote[] {
  const notes: VerseNote[] = []
  for (let i = 0; i < content.length; i++) {
    const item = content[i]
    if (typeof item !== 'object' || !('noteId' in item)) continue
    const footnote = footnotes.get(item.noteId)
    // A dangling marker (0 in the BSB, exhaustively checked) is not a reason to
    // fail a chapter; it is a reason to have no door there.
    if (!footnote) continue
    // reference.verse === 0 is a psalm superscription (36 notes). The reading
    // surface renders verse rows and has no superscription row, so they have
    // nowhere to hang — brief §2.3.
    if (footnote.reference?.verse === 0) continue
    // §6: only the alternate-rendering class reaches a reader.
    if (!footnoteShips(footnote.text)) continue
    const anchored = flattenVerseContent(content.slice(0, i))
    if (anchored.length === 0 || !text.startsWith(anchored)) continue
    notes.push({ offset: anchored.length, text: footnote.text })
  }
  return notes
}

export class HelloaoBibleProvider implements BibleProvider {
  // helloao's own translation code — 'BSB', 'tam_irv', 'tam_tcv'. One instance
  // serves exactly one translation (see provider.ts's TranslationId comment).
  constructor(private readonly translation: string = 'BSB') {}

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    const usfm = usfmForBookNumber(bookNumber)
    if (!usfm) throw new CodedError('BIBLE_UNKNOWN_BOOK', `book_number ${bookNumber}`)

    const res = await fetch(`${BASE_URL}/${this.translation}/${usfm}/${chapter}.json`)
    if (!res.ok) {
      // The book and chapter are what the reader was reading, so they go in the
      // detail, which never leaves the device. See src/errors.ts.
      throw new CodedError(
        'BIBLE_FETCH_FAILED',
        `${res.status} ${res.statusText} (${usfm} ${chapter})`
      )
    }
    const data = (await res.json()) as HelloaoChapterResponse

    // Only walk `footnotes` for a translation whose notes are both ours to show
    // and shaped the way the classifier expects. An empty map means every
    // marker resolves to nothing, so `notes` is simply absent from every verse.
    const footnotes = new Map<number, HelloaoFootnote>(
      FOOTNOTE_TRANSLATIONS.has(this.translation)
        ? (data.chapter.footnotes ?? []).map(f => [f.noteId, f])
        : []
    )

    const verses: BibleVerseLine[] = []
    for (const node of data.chapter.content) {
      if (node.type !== 'verse' || node.number === undefined || !node.content) continue
      const text = flattenVerseContent(node.content)
      const notes = verseNotesFor(node.content, text, footnotes)
      // Absent rather than empty: a verse with no doors carries no `notes` key
      // at all, so nothing downstream can render "0 notes".
      verses.push(
        notes.length > 0 ? { verse: node.number, text, notes } : { verse: node.number, text }
      )
    }
    return verses
  }
}
