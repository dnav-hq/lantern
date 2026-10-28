import { describe, it, expect } from 'vitest'
import {
  createMemoryApi,
  snapshotGuestStore,
  clearGuestStore,
  restoreGuestStore,
  type KeyValueStore
} from './memory'

// The guest store: a persisted memory api must put every mutation into
// storage and come back from it intact, and a storage that throws (quota,
// private window) must never reach the caller.

function fakeStorage(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: k => void data.delete(k)
  }
}

const KEY = 'test.guest-store'

async function writeOnePassage(api: ReturnType<typeof createMemoryApi>) {
  const passage = await api.createPassage({
    book_number: 43,
    chapter_start: 1,
    verse_start: 1,
    chapter_end: 1,
    verse_end: 5,
    reference_label: 'John 1:1-5'
  })
  const session = await api.createSession(passage.id)
  const note = await api.createNote({
    session_id: session.id,
    content: 'In the beginning was the Word',
    anchor_start_verse: 1,
    anchor_end_verse: 1,
    anchor_book_override: null,
    anchor_chapter_override: null,
    category: 'observation',
    indent_level: 0,
    highlighted_text: 'the Word'
  })
  return { passage, session, note }
}

describe('createMemoryApi({ persistKey })', () => {
  it('round-trips passages, sessions, notes and categories through storage', async () => {
    const storage = fakeStorage()
    const api = createMemoryApi({ persistKey: KEY, storage })
    const { passage, note } = await writeOnePassage(api)
    await api.saveNoteCategories([
      { key: 'observation', label: 'Seen', color: '#6b62d6', sort_order: 0 }
    ])

    const snap = snapshotGuestStore(storage, KEY)
    expect(snap).not.toBeNull()
    expect(snap!.passages.map(p => p.id)).toEqual([passage.id])
    expect(snap!.sessions).toHaveLength(1)
    expect(snap!.notes[0]).toMatchObject({ id: note.id, highlighted_text: 'the Word' })
    expect(snap!.categories).toHaveLength(1)

    // A fresh api over the same storage — a reload — sees the same data.
    const reloaded = createMemoryApi({ persistKey: KEY, storage })
    const all = await reloaded.getAllNotes()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      content: 'In the beginning was the Word',
      reference_label: 'John 1:1-5'
    })
    expect(await reloaded.getNoteCategories()).toHaveLength(1)
  })

  it('persists deletes too, and the cascade leaves the store empty', async () => {
    const storage = fakeStorage()
    const api = createMemoryApi({ persistKey: KEY, storage })
    const { note } = await writeOnePassage(api)
    await api.deleteNoteAndCascade(note.id)
    const snap = snapshotGuestStore(storage, KEY)
    expect(snap).toEqual({ passages: [], sessions: [], notes: [], categories: [] })
  })

  it('keeps two persisted apis apart from the module-level dev stub', async () => {
    const storage = fakeStorage()
    const persisted = createMemoryApi({ persistKey: KEY, storage })
    const stub = createMemoryApi()
    await writeOnePassage(persisted)
    expect(await stub.getAllNotes()).toHaveLength(0)
  })

  it('never throws when storage does', async () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('denied')
      }
    }
    const api = createMemoryApi({ persistKey: KEY, storage: broken })
    await expect(writeOnePassage(api)).resolves.toBeTruthy()
    expect(await api.getAllNotes()).toHaveLength(1)
    expect(snapshotGuestStore(broken, KEY)).toBeNull()
    expect(() => clearGuestStore(broken, KEY)).not.toThrow()
  })

  it('treats garbage in storage as empty', async () => {
    const storage = fakeStorage()
    storage.setItem(KEY, '{not json')
    const api = createMemoryApi({ persistKey: KEY, storage })
    expect(await api.getAllNotes()).toHaveLength(0)
    expect(snapshotGuestStore(storage, KEY)).toBeNull()
  })

  it('clear forgets and restore brings a snapshot back', async () => {
    const storage = fakeStorage()
    const api = createMemoryApi({ persistKey: KEY, storage })
    await writeOnePassage(api)
    const snap = snapshotGuestStore(storage, KEY)!
    clearGuestStore(storage, KEY)
    expect(snapshotGuestStore(storage, KEY)).toBeNull()
    restoreGuestStore(snap, storage, KEY)
    expect(snapshotGuestStore(storage, KEY)).toEqual(snap)
  })
})
