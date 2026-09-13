/**
 * The one place a chapter's cross-references are fetched
 * (docs/proposals/connections-door.md §7).
 *
 * Shaped after `wordIndexLoader.ts` and for the same reasons:
 *
 *   - NOTHING is fetched until a reader deliberately chooses a verse. A reader
 *     who only reads downloads not a byte of this. No shard is bundled and
 *     nothing is precached.
 *   - ONE request per chapter, memoized as a PROMISE so two verses chosen in
 *     the same chapter share one download rather than racing two, and cached
 *     forever in IndexedDB underneath (cache.ts) so a second session costs
 *     nothing at all.
 *   - ONE instance for every translation. The graph is addressed by
 *     (book, chapter) alone, so a BSB reader and a KJV reader are asking the
 *     identical question — which is why this does NOT go through service.ts's
 *     per-translation provider map. Only §4's quote/echo typing varies by
 *     translation, and that is computed at render time from text the surface
 *     already has.
 *   - A FAILURE IS NO DOOR, never an error. Offline, or helloao down, on a
 *     chapter never visited: the verse simply has nothing to say, exactly the
 *     degradation the footnote door already sets the precedent for. A failed
 *     chapter is not memoized, so a reader who comes back online gets another
 *     try.
 */
import { CachedBibleProvider } from '../bible/cache'
import { HelloaoBibleProvider } from '../bible/helloao'
import type { BibleProvider, ChapterConnections, VerseConnection } from '../bible/provider'

export interface ConnectionsLoader {
  /** One chapter's connections. `{}` where there are none, or none reachable. */
  chapter(bookNumber: number, chapter: number): Promise<ChapterConnections>
  /** One verse's own outgoing list, in the order the source data gives it. */
  verse(bookNumber: number, chapter: number, verse: number): Promise<VerseConnection[]>
}

export function createConnectionsLoader(provider: BibleProvider): ConnectionsLoader {
  const inFlight = new Map<string, Promise<ChapterConnections>>()

  const chapter = (bookNumber: number, chapterNumber: number): Promise<ChapterConnections> => {
    const key = `${bookNumber}/${chapterNumber}`
    let pending = inFlight.get(key)
    if (!pending) {
      pending = (provider.getConnections?.(bookNumber, chapterNumber) ?? Promise.resolve({})).catch(
        () => {
          // Not memoized as a failure: drop it so the next choice re-tries.
          inFlight.delete(key)
          return {} as ChapterConnections
        }
      )
      inFlight.set(key, pending)
    }
    return pending
  }

  return {
    chapter,
    async verse(bookNumber, chapterNumber, verse) {
      return (await chapter(bookNumber, chapterNumber))[verse] ?? []
    }
  }
}

/** The app's one loader. A module singleton, so its memoization is app-wide. */
export const connectionsLoader = createConnectionsLoader(
  new CachedBibleProvider(new HelloaoBibleProvider())
)
