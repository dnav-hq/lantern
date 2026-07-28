import type { BibleProvider, BibleVerseLine } from './provider'
import { CodedError } from '../errors'
import { usfmForBookNumber } from './helloao'

// KJV scripture via the same free, keyless bible.helloao.org API that serves
// BSB — confirmed live (2026-07-22) against /api/available_translations.json:
// `eng_kjv` ("King James (Authorized) Version", shortName KJAV) is the plain
// 66-book KJV with no Apocrypha, distinct from `eng_kja` (KJV + Apocrypha).
// Endpoint: GET https://bible.helloao.org/api/eng_kjv/{USFM}/{chapter}.json
// Same USFM book codes and response shape as helloao.ts's BSB endpoint (see
// that file's comment for the full node/content shape), so USFM lookup is
// reused from there rather than duplicated.
//
// One KJV-specific wrinkle BSB's source doesn't have: a verse that opens a new
// paragraph leads with a pilcrow ("¶ "), always as the very first content item
// of that verse and never elsewhere in it (confirmed against the full
// eng_kjv/complete.json — 2,970 occurrences, 100% verse-leading). Stripped
// after flattening rather than touching helloao.ts's shared logic, since BSB
// never carries one.
const BASE_URL = 'https://bible.helloao.org/api/eng_kjv'

type VerseContentItem =
  | string
  | { noteId: number }
  | { lineBreak: true }
  | { text: string; poem?: number; wordsOfJesus?: boolean }

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
    .replace(/^¶\s*/, '') // paragraph marker — not part of the verse text
    .replace(/\s+([,.;:!?”’])/g, '$1') // no space before closing punctuation
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export class KjvBibleProvider implements BibleProvider {
  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    const usfm = usfmForBookNumber(bookNumber)
    if (!usfm) throw new CodedError('BIBLE_UNKNOWN_BOOK', `book_number ${bookNumber}`)

    const res = await fetch(`${BASE_URL}/${usfm}/${chapter}.json`)
    if (!res.ok) {
      // The book and chapter are what the reader was reading, so they go in
      // the detail, which never leaves the device. See src/errors.ts.
      throw new CodedError(
        'BIBLE_FETCH_FAILED',
        `${res.status} ${res.statusText} (KJV ${usfm} ${chapter})`
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
