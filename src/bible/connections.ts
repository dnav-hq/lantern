import type { ChapterConnections, ConnectionsProvider, RawConnection } from './provider'
import { CodedError } from '../errors'
import { bookNumberForUsfm, usfmForBookNumber } from './helloao'

// Cross-references via helloao's open-cross-ref dataset — OpenBible.info's
// Bible Cross References (built on the Treasury of Scripture Knowledge),
// CC BY 4.0, attributed on the door itself. docs/proposals/connections-door.md
// §2 documents the endpoint and shape, verified live 2026-09-12:
//
//   GET https://bible.helloao.org/api/d/open-cross-ref/{USFM}/{chapter}.json
//   → { chapter: { number, content: [ { verse, references: [
//         { book: 'JAS', chapter: 2, verse: 23, endVerse?: 25, score: 85 }, … ] } ] } }
//
// One entry per verse in the chapter, whether or not it has references; the
// source side is always a single verse and the target may be a range. Scores
// are OpenBible's own weighting — unbounded, occasionally negative, pre-sorted
// descending — and are never shown to a reader (§6.1).
//
// Nothing here is translation-specific: the data is addressed by book and
// chapter alone, which is why cache.ts keys it without a translation.

const BASE_URL = 'https://bible.helloao.org/api/d/open-cross-ref'

interface HelloaoReference {
  book: string
  chapter: number
  verse: number
  endVerse?: number
  score: number
}

interface HelloaoCrossRefResponse {
  chapter: {
    number: number
    content: { verse: number; references: HelloaoReference[] }[]
  }
}

export class HelloaoConnectionsProvider implements ConnectionsProvider {
  async getConnections(bookNumber: number, chapter: number): Promise<ChapterConnections> {
    const usfm = usfmForBookNumber(bookNumber)
    if (!usfm) throw new CodedError('BIBLE_UNKNOWN_BOOK', `book_number ${bookNumber}`)

    const res = await fetch(`${BASE_URL}/${usfm}/${chapter}.json`)
    if (!res.ok) {
      throw new CodedError(
        'BIBLE_FETCH_FAILED',
        `${res.status} ${res.statusText} (open-cross-ref ${usfm} ${chapter})`
      )
    }
    const data = (await res.json()) as HelloaoCrossRefResponse

    const out: ChapterConnections = {}
    for (const entry of data.chapter.content) {
      const refs: RawConnection[] = []
      for (const r of entry.references) {
        const book = bookNumberForUsfm(r.book)
        // A code outside the 66 (none seen; the dataset covers exactly 66
        // books) is dropped rather than shown as "Book undefined".
        if (book === undefined) continue
        refs.push(
          r.endVerse !== undefined
            ? { book, chapter: r.chapter, verse: r.verse, endVerse: r.endVerse, score: r.score }
            : { book, chapter: r.chapter, verse: r.verse, score: r.score }
        )
      }
      // Observed pre-sorted; sorted here anyway, since that was an observation
      // about today's data rather than a documented contract (§2.2).
      refs.sort((a, b) => b.score - a.score)
      if (refs.length > 0) out[entry.verse] = refs
    }
    return out
  }
}
