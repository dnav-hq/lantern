import type {
  BibleProvider,
  BibleVerseLine,
  ChapterConnections,
  ConnectionsProvider
} from './provider'
import { connectionsCacheKey } from '../utils/connections'

// Wraps any BibleProvider with a cache-forever IndexedDB layer, keyed by
// translation/book/chapter. Scripture chapters are immutable text, so once a
// chapter is fetched it never needs to be re-fetched — this is what makes the
// helloao dependency safe to have on the read path (provider downtime doesn't
// matter once a chapter has been seen).

const DB_NAME = 'berean-bible-cache'
const DB_VERSION = 1
const STORE_NAME = 'chapters'
const TRANSLATION = 'BSB' // the only translation phase 2 supports

// Bump when the SHAPE of a cached record changes. Records written under an
// older schema are still real scripture and still perfectly good to read — they
// just lack whatever the newer shape carries.
const SCHEMA = 2 // 2: verses may carry `notes` (docs/proposals/footnotes-door.md §5.5)

interface CachedChapter {
  key: string
  verses: BibleVerseLine[]
  schema?: number // absent on every record written before footnotes existed
}

function chapterKey(translation: string, bookNumber: number, chapter: number): string {
  return `${translation}/${bookNumber}/${chapter}`
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

// Any record in the store: a chapter of scripture, or (below) a chapter's
// cross-references. They share the one object store, told apart by key prefix.
async function readRecord<T extends { key: string }>(key: string): Promise<T | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    // IndexedDB unavailable (private browsing, etc.) — treat as a cache miss.
    return null
  }
}

async function writeRecord<T extends { key: string }>(record: T): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Best-effort cache; a write failure just means we re-fetch next time.
  }
}

const readCached = (key: string): Promise<CachedChapter | null> => readRecord<CachedChapter>(key)

const writeCached = (key: string, verses: BibleVerseLine[]): Promise<void> =>
  writeRecord({ key, verses, schema: SCHEMA } satisfies CachedChapter)

// Keys currently being refreshed, so a reader who flicks back and forth across
// a stale chapter starts one background fetch rather than one per read.
const refreshing = new Set<string>()

export class CachedBibleProvider implements BibleProvider {
  constructor(
    private readonly inner: BibleProvider,
    private readonly translation: string = TRANSLATION
  ) {}

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    const key = chapterKey(this.translation, bookNumber, chapter)
    const cached = await readCached(key)
    if (cached) {
      // SERVE FIRST, then refresh. A record written before footnotes existed
      // carries none, and this cache is cache-forever — so a chapter the reader
      // had already read would never gain its doors. Re-fetching INSTEAD of
      // serving would be worse than the missing notes: it would turn a warm
      // cache into a network dependency, and take scripture away from an
      // offline reader to add an underline. So the stale text is returned
      // immediately and the fresh copy overwrites it in the background, for
      // the next read.
      if (cached.schema !== SCHEMA) void this.refresh(key, bookNumber, chapter)
      return cached.verses
    }

    const verses = await this.inner.getChapter(bookNumber, chapter)
    void writeCached(key, verses)
    return verses
  }

  private async refresh(key: string, bookNumber: number, chapter: number): Promise<void> {
    if (refreshing.has(key)) return
    refreshing.add(key)
    try {
      await writeCached(key, await this.inner.getChapter(bookNumber, chapter))
    } catch {
      // Offline, or the provider is down. The stale record was already served
      // and stays exactly as it was; we try again on the next read.
    } finally {
      refreshing.delete(key)
    }
  }
}

// A chapter's cross-references, cached forever in the same store. The key
// carries NO translation (docs/proposals/connections-door.md §7): the data is
// addressed by book and chapter alone, so one record serves a reader in any
// translation. Offline, a chapter already visited keeps its doors; one never
// visited throws through to the loader, which shows nothing rather than an
// error — the same degradation footnotes chose.
interface CachedConnections {
  key: string
  connections: ChapterConnections
}

export class CachedConnectionsProvider implements ConnectionsProvider {
  constructor(private readonly inner: ConnectionsProvider) {}

  async getConnections(bookNumber: number, chapter: number): Promise<ChapterConnections> {
    const key = connectionsCacheKey(bookNumber, chapter)
    const cached = await readRecord<CachedConnections>(key)
    if (cached) return cached.connections
    const connections = await this.inner.getConnections(bookNumber, chapter)
    void writeRecord({ key, connections } satisfies CachedConnections)
    return connections
  }
}
