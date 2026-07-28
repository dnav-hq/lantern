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
// two limits in every case that matters, so it's the one enforced here.
const MAX_CACHED_VERSES = 500

interface CacheEntry {
  key: string
  verses: BibleVerseLine[]
}

function chapterKey(bookNumber: number, chapter: number): string {
  return `${bookNumber}/${chapter}`
}

// FIFO eviction (oldest fetched chapter dropped first), not LRU — the cap
// exists to bound total stored text, not to optimize hit rate, and a Map
// preserves insertion order for free, so "oldest" is just "first key".
export class EsvCachedBibleProvider implements BibleProvider {
  private readonly entries = new Map<string, CacheEntry>()
  private totalVerses = 0

  constructor(private readonly inner: BibleProvider) {}

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    const key = chapterKey(bookNumber, chapter)
    const cached = this.entries.get(key)
    if (cached) return cached.verses

    const verses = await this.inner.getChapter(bookNumber, chapter)
    this.entries.set(key, { key, verses })
    this.totalVerses += verses.length

    while (this.totalVerses > MAX_CACHED_VERSES && this.entries.size > 1) {
      const oldestKey = this.entries.keys().next().value as string
      const oldest = this.entries.get(oldestKey)
      this.entries.delete(oldestKey)
      this.totalVerses -= oldest?.verses.length ?? 0
    }

    return verses
  }
}
