import type { BibleVerseLine } from './provider'

/* ─── ESV cache persistence ───────────────────────────────────────────────────
   The disk half of esv-cache.ts. Kept in its own module, and in its own
   IndexedDB database, for one reason that matters: if the ESV licence ever
   changes or is withdrawn, every byte of copyrighted text Lantern has stored
   must be removable in one call. `purgeEsvStore()` below is that call. Mixing
   it into the shared `berean-bible-cache` DB (which holds public-domain BSB and
   KJV chapters) would make that impossible to do cleanly.

   WHY THIS EXISTS AT ALL. The cache was previously in-memory only, which its
   own comment described as "stricter than the letter of the license requires"
   — a deliberate conservatism, and a defensible one. The cost was that every
   page reload refetched, which is both a worse reading experience and, more
   importantly, a heavier draw on Crossway's quota, which is PER APPLICATION and
   therefore shared across every Lantern user (5,000/day, 1,000/hour,
   60/minute — see supabase/functions/esv-proxy/handler.ts). Persisting within
   the existing cap makes the app both faster AND a lighter consumer of a shared
   ceiling. Dennis approved the change on 2026-08-31.

   THE CAP IS A LICENCE TERM, NOT A TUNING KNOB. Crossway permit storing at most
   500 verses (or half of any one book, whichever is smaller). The disk copy is
   written from the in-memory state, which is capped, so it inherits the cap
   rather than enforcing a second one. Raising MAX_CACHED_VERSES in esv-cache.ts
   would breach the terms, not merely use more disk.
   ──────────────────────────────────────────────────────────────────────────── */

const DB_NAME = 'berean-esv-cache'
const DB_VERSION = 1
const STORE_NAME = 'state'
// One record holds the whole ordered cache. At the 500-verse ceiling that is
// tens of kilobytes, so rewriting it wholesale on change is cheaper and far
// simpler than maintaining per-chapter rows plus a separate LRU order record.
const STATE_KEY = 'esv-lru'

export interface PersistedEntry {
  key: string
  verses: BibleVerseLine[]
}

/** Least-recently-used FIRST, matching the in-memory Map's iteration order. */
export interface PersistedState {
  entries: PersistedEntry[]
}

/** The seam esv-cache.ts depends on, so its tests need no IndexedDB. */
export interface EsvStore {
  load(): Promise<PersistedState | null>
  save(state: PersistedState): Promise<void>
}

/** A store that does nothing — used where IndexedDB is unavailable, and in tests. */
export const noopEsvStore: EsvStore = {
  load: async () => null,
  save: async () => {}
}

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export const indexedDbEsvStore: EsvStore = {
  async load() {
    if (!idbAvailable()) return null
    try {
      const db = await openDb()
      return await new Promise<PersistedState | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(STATE_KEY)
        req.onsuccess = () => resolve((req.result as PersistedState | undefined) ?? null)
        req.onerror = () => reject(req.error)
      })
    } catch {
      // Private browsing, blocked storage, a corrupt DB — all just mean "no
      // cache on disk", which is exactly the pre-2026-08-31 behaviour.
      return null
    }
  },

  async save(state) {
    if (!idbAvailable()) return
    try {
      const db = await openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(state, STATE_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      // Best-effort: a failed write just means the next reload refetches.
    }
  }
}

/**
 * Remove every stored ESV verse from this device.
 *
 * Exists so that "we no longer have the right to hold this text" is a one-line
 * operation rather than an archaeology exercise. Call it if the ESV integration
 * is ever removed or its licence changes. Deliberately deletes the whole
 * database rather than clearing the store, so nothing is left behind.
 */
export async function purgeEsvStore(): Promise<void> {
  if (!idbAvailable()) return
  try {
    if (dbPromise) {
      const db = await dbPromise
      db.close()
      dbPromise = null
    }
    await new Promise<void>(resolve => {
      const req = indexedDB.deleteDatabase(DB_NAME)
      // Resolve on every outcome: a purge that cannot complete must not throw
      // into a caller that is probably already tearing something down.
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    })
  } catch {
    // Nothing further we can do from here.
  }
}
