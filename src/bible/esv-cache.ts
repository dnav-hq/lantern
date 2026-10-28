import type { BibleProvider, BibleVerseLine, PassageRef } from './provider'
import { indexedDbEsvStore, type EsvStore } from './esv-store'
import { EsvRefsUnsupportedError } from './esv'

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
  // Only some of the chapter's verses (see getPassages). Never served by
  // getChapter, which needs the whole chapter; replaced by the whole chapter
  // the first time the reader opens it.
  partial?: true
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
    if (cached && !cached.partial) {
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
    this.put({ key, verses })
    return verses
  }

  /** Insert or replace an entry at the most-recently-used position, under the cap. */
  private put(entry: CacheEntry): void {
    const previous = this.entries.get(entry.key)
    if (previous) {
      this.entries.delete(entry.key)
      this.totalVerses -= previous.verses.length
    }
    this.entries.set(entry.key, entry)
    this.totalVerses += entry.verses.length
    this.evict()
    this.persist()
  }

  /**
   * The verses of several short ranges, keyed `${book}/${chapter}`. A chapter
   * already cached whole (or a partial entry that already holds every verse
   * asked for) is served from the cache; the rest go to the proxy in ONE
   * call, and what comes back is written into the cache as a partial entry
   * — counted against the same 500-verse cap, evicted by the same LRU — so a
   * dive costs the licence ceiling nothing it did not already allow.
   *
   * An older proxy without ?refs= (EsvRefsUnsupportedError, remembered by
   * the inner provider for the session) degrades to one getChapter per
   * chapter, which caches whole chapters as it always has.
   */
  async getPassages(refs: PassageRef[]): Promise<Map<string, BibleVerseLine[]>> {
    await this.hydrate()
    const out = new Map<string, BibleVerseLine[]>()
    const wanted = new Map<string, { book: number; chapter: number; verses: Set<number> }>()
    for (const r of refs) {
      const key = chapterKey(r.book, r.chapter)
      let w = wanted.get(key)
      if (!w) {
        w = { book: r.book, chapter: r.chapter, verses: new Set() }
        wanted.set(key, w)
      }
      const last = r.endVerse !== undefined && r.endVerse > r.verse ? r.endVerse : r.verse
      for (let v = r.verse; v <= last; v++) w.verses.add(v)
    }

    const missing: PassageRef[] = []
    for (const [key, w] of wanted) {
      const cached = this.entries.get(key)
      const covered =
        cached &&
        (!cached.partial || [...w.verses].every(v => cached.verses.some(l => l.verse === v)))
      if (cached && covered) {
        this.entries.delete(key)
        this.entries.set(key, cached)
        out.set(
          key,
          cached.verses.filter(l => w.verses.has(l.verse))
        )
        continue
      }
      for (const r of refs) {
        if (chapterKey(r.book, r.chapter) === key) missing.push(r)
      }
    }
    if (missing.length === 0) {
      if (out.size > 0) this.persist()
      return out
    }

    let fetched: Map<string, BibleVerseLine[]>
    try {
      if (!this.inner.getPassages) throw new EsvRefsUnsupportedError()
      fetched = await this.inner.getPassages(missing)
    } catch (err) {
      if (!(err instanceof EsvRefsUnsupportedError)) throw err
      fetched = new Map()
      const chapters = new Map<string, PassageRef>()
      for (const r of missing) chapters.set(chapterKey(r.book, r.chapter), r)
      for (const [key, r] of chapters) {
        // Whole chapters, through getChapter, so they cache as whole chapters.
        fetched.set(key, await this.getChapter(r.book, r.chapter))
      }
      for (const [key, lines] of fetched) {
        const w = wanted.get(key)
        if (w)
          out.set(
            key,
            lines.filter(l => w.verses.has(l.verse))
          )
      }
      return out
    }

    for (const [key, lines] of fetched) {
      const w = wanted.get(key)
      if (!w) continue
      const previous = this.entries.get(key)
      const merged = previous?.partial ? [...previous.verses] : []
      for (const line of lines) {
        if (!merged.some(m => m.verse === line.verse)) merged.push(line)
      }
      merged.sort((a, b) => a.verse - b.verse)
      if (merged.length > 0) this.put({ key, verses: merged, partial: true })
      out.set(
        key,
        merged.filter(l => w.verses.has(l.verse))
      )
    }
    return out
  }
}
