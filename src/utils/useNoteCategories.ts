import { useEffect, useSyncExternalStore } from 'react'
import { useApi } from '../api/context'
import type { BereanApi } from '../api/types'
import type { NoteCategoryDef } from '../types'
import { resolveCategories } from './noteCategories'

/* ─── Category definitions, shared ────────────────────────────────────────────
   A SHARED STORE, not a per-component fetch. The same reasoning
   useTranslation.ts gives: several surfaces render category labels (the
   Journal's filter, the composer's tag menu, Settings' editor) and they do not
   share a parent render, so per-component state means renaming a category in
   Settings leaves every already-mounted surface showing the old name until it
   happens to remount. That was a real bug, caught by actually renaming one and
   looking at the Journal.

   useSyncExternalStore gives every call site the SAME value the moment it
   changes anywhere, without a Context provider.

   The store holds RESOLVED definitions, so no consumer can forget to resolve
   and end up rendering an empty picker — a composer with no categories cannot
   capture a note.
   ──────────────────────────────────────────────────────────────────────────── */

let categories: NoteCategoryDef[] = resolveCategories([])
let loadedFor: BereanApi | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): NoteCategoryDef[] {
  return categories
}

/** Apply a fresh set everywhere at once. Call after saving. */
export function publishNoteCategories(stored: NoteCategoryDef[]): void {
  categories = resolveCategories(stored)
  emit()
}

/**
 * Load once per api instance. A failed read is not an error state for the
 * reader: the built-ins are already showing, and they are exactly what an
 * uncustomised workspace uses.
 */
async function loadOnce(api: BereanApi): Promise<void> {
  if (loadedFor === api) return
  loadedFor = api
  try {
    publishNoteCategories(await api.getNoteCategories())
  } catch {
    // Keep whatever is showing.
  }
}

/** The categories to render with. Always non-empty. */
export function useNoteCategories(): NoteCategoryDef[] {
  const api = useApi()
  useEffect(() => {
    void loadOnce(api)
  }, [api])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Test seam: forget what was loaded so a later mount fetches again. */
export function resetNoteCategoriesForTest(): void {
  categories = resolveCategories([])
  loadedFor = null
  emit()
}
