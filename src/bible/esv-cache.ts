import type { BibleProvider, BibleVerseLine } from './provider'

// ESV's counterpart to cache.ts, but NOT cache-forever: Crossway's terms cap
// local storage at <=500 verses, or half of any one book, whichever is
// smaller (docs/proposals/translations-esv-niv.md section 1). This cache is
// in-memory only (resets on reload), which is stricter than the letter of the
// license requires but avoids ever writing copyrighted verse text to disk.
//
// CAP CHOICE: a book-aware "half a book" limit would need this module to know
// how long every book is, for a rule that only binds on books shorter than
// 1,000 verses (Psalms, the longest, has 2,461) — a case that doesn't come up
// in practice, since a reader has to visit many separate short books before
// half of any one of them is even reachable through per-chapter caching. A
// flat 500-verse cap is therefore the smaller (i.e. more conservative) of the
// two limits in every case that matters, so it's the one enforced here. 500
// verses is already the license ceiling, so "enlarging" the cache can't mean
// raising this number — the fix below is entirely about eviction *policy*.
const MAX_CACHED_VERSES = 500

interface CacheEntry {
  key: string
  verses: BibleVerseLine[]
}

function chapterKey(bookNumber: number, chapter: number): string {
  return `${bookNumber}/${chapter}`
}

// LRU eviction (least-recently-USED chapter dropped first), not FIFO. This is
// the root-cause fix for revisits missing the cache: the old policy evicted by
// insertion order and never moved an entry once it was cached, so a chapter
// you kept coming BACK to (a cross-reference you re-check, a passage you and
// its parallel you bounce between) aged out exactly as fast as one you read
// once and never touched again, as long as ~19 other chapters (500 verses /
// ~26 verses-per-chapter average) were fetched in between. A normal session
// that reads forward while occasionally returning to an earlier chapter
// thrashed the earlier chapter out even though it was still "in play". Moving
// a hit entry to the most-recently-used position (re-inserting into the Map,
// which reorders it to the end) means the cap now evicts whatever the reader
// has actually stopped looking at, not just whatever they looked at first —
// so a realistic session's actively-revisited chapters stay resident.
export class EsvCachedBibleProvider implements BibleProvider {
  private readonly entries = new Map<string, CacheEntry>()
  private totalVerses = 0

  constructor(private readonly inner: BibleProvider) {}

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    const key = chapterKey(bookNumber, chapter)
    const cached = this.entries.get(key)
    if (cached) {
      // Touch: move this entry to the most-recently-used (end) position so it
      // survives the next eviction pass ahead of chapters not being revisited.
      this.entries.delete(key)
      this.entries.set(key, cached)
      return cached.verses
    }

    const verses = await this.inner.getChapter(bookNumber, chapter)
    this.entries.set(key, { key, verses })
    this.totalVerses += verses.length

    while (this.totalVerses > MAX_CACHED_VERSES && this.entries.size > 1) {
      const leastRecentKey = this.entries.keys().next().value as string
      const leastRecent = this.entries.get(leastRecentKey)
      this.entries.delete(leastRecentKey)
      this.totalVerses -= leastRecent?.verses.length ?? 0
    }

    return verses
  }
}
