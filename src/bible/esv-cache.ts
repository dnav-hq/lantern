import type { BibleProvider, BibleVerseLine } from './provider'
import { indexedDbEsvStore, type EsvStore } from './esv-store'

// ESV's counterpart to cache.ts, but NOT cache-forever: Crossway's terms cap
// local storage at <=500 verses, or half of any one book, whichever is
// smaller (docs/proposals/translations-esv-niv.md section 1).
//
// PERSISTENCE (2026-08-31, Dennis's call). This cache used to be in-memory
// only, which its own comment called "stricter than the letter of the license
// requires" — deliberate conservatism about writing copyrighted text to disk.
// It now persists, still strictly inside the same 500-verse cap, because the
// old behaviour refetched on every reload and that draws down Crossway's quota,
// which is PER APPLICATION and shared across every Lantern user. Persisting
// makes reading faster AND makes Lantern a lighter consumer of a shared
// ceiling. The disk half lives in esv-store.ts, in its own IndexedDB database,
// so `purgeEsvStore()` can remove every stored verse in one call if the licence
// ever changes.
//
// CAP CHOICE: a book-aware "half a book" limit would need this module to know
// how long every book is, for a rule that only binds on books shorter than
// 1,000 verses (Psalms, the longest, has 2,461) — a case that doesn't come up
// in practice, since a reader has to visit many separate short books before
// half of any one of them is even reachable through per-chapter caching. A
// flat 500-verse cap is therefore the smaller (i.e. more conservative) of the
// two limits in every case that matters, so it's the one enforced here. 500
// verses is already the license ceiling, so "enlarging" the cache can't mean
// raising this number — this is a LICENCE TERM, not a performance tuning knob,
// and raising it would breach Crossway's terms rather than merely use more
// memory. The persisted copy is written from this capped state, so it inherits
// the ceiling rather than enforcing a second one.
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
  // Hydration runs at most once per instance, lazily on the first read, so
  // constructing the provider costs nothing at module load.
  private hydrated: Promise<void> | null = null

  constructor(
    private readonly inner: BibleProvider,
    private readonly store: EsvStore = indexedDbEsvStore
  ) {}

  private hydrate(): Promise<void> {
    if (!this.hydrated) {
      this.hydrated = this.store.load().then(state => {
        if (!state) return
        for (const entry of state.entries) {
          // Trust the cap that wrote this, but re-derive the running total
          // rather than persisting it: a stale count is how a cache silently
          // grows past a limit that happens to be a licence term.
          if (this.entries.has(entry.key)) continue
          this.entries.set(entry.key, entry)
          this.totalVerses += entry.verses.length
        }
        this.evict()
      })
    }
    return this.hydrated
  }

  /** Drop least-recently-used entries until the cap holds. */
  private evict(): void {
    while (this.totalVerses > MAX_CACHED_VERSES && this.entries.size > 1) {
      const leastRecentKey = this.entries.keys().next().value as string
      const leastRecent = this.entries.get(leastRecentKey)
      this.entries.delete(leastRecentKey)
      this.totalVerses -= leastRecent?.verses.length ?? 0
    }
  }

  /** Fire-and-forget: a failed write only costs a refetch next session. */
  private persist(): void {
    void this.store.save({ entries: [...this.entries.values()] })
  }

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    await this.hydrate()
    const key = chapterKey(bookNumber, chapter)
    const cached = this.entries.get(key)
    if (cached) {
      // Touch: move this entry to the most-recently-used (end) position so it
      // survives the next eviction pass ahead of chapters not being revisited.
      this.entries.delete(key)
      this.entries.set(key, cached)
      // Persist the reordering too, not just insertions: otherwise the LRU
      // order on disk reflects only what was FETCHED, and a chapter the reader
      // keeps returning to would be evicted first after a reload — which is
      // exactly the thrashing the LRU policy exists to prevent.
      this.persist()
      return cached.verses
    }

    const verses = await this.inner.getChapter(bookNumber, chapter)
    this.entries.set(key, { key, verses })
    this.totalVerses += verses.length
    this.evict()
    this.persist()

    return verses
  }
}
