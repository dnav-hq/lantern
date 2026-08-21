import type { BibleProvider, BibleVerseLine } from './provider'
import { CodedError } from '../errors'

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
// We flatten all of that down to a single plain-text string per verse — no
// component needs footnote markers or poem-line structure today.

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

interface HelloaoChapterResponse {
  chapter: {
    number: number
    content: ChapterContentNode[]
  }
}

function flattenVerseContent(content: VerseContentItem[]): string {
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

    const verses: BibleVerseLine[] = []
    for (const node of data.chapter.content) {
      if (node.type !== 'verse' || node.number === undefined || !node.content) continue
      verses.push({ verse: node.number, text: flattenVerseContent(node.content) })
    }
    return verses
  }
}
