import { useSyncExternalStore } from 'react'
import type { TranslationId } from '../bible/provider'

const STORAGE_KEY = 'berean-translation'

export const TRANSLATIONS: { id: TranslationId; label: string }[] = [
  { id: 'BSB', label: 'Berean Standard Bible (BSB)' },
  { id: 'KJV', label: 'King James Version (KJV)' }
]

function isTranslationId(value: string | null): value is TranslationId {
  return value === 'BSB' || value === 'KJV'
}

// Global, not per-passage (see docs/proposals/translations-esv-niv.md section
// 3) — a single preference shared by every reading surface. Unlike
// useDarkMode/useTheme, switching this has to trigger an actual data refetch
// in components that don't share a parent render (BookDetailPage, ReadingMode,
// StudyMode, SettingsModal each call this hook independently, with no
// App.tsx-level lifting), so plain per-component useState isn't enough — every
// call site needs to observe the SAME value the moment it changes anywhere.
// useSyncExternalStore gives that without a Context provider.
function readStored(): TranslationId {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isTranslationId(stored) ? stored : 'BSB'
}

let current: TranslationId = readStored()

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): TranslationId {
  return current
}

function setTranslation(next: TranslationId): void {
  if (next === current) return
  current = next
  localStorage.setItem(STORAGE_KEY, next)
  listeners.forEach(l => l())
}

export function useTranslation(): [TranslationId, (t: TranslationId) => void] {
  const translation = useSyncExternalStore(subscribe, getSnapshot)
  return [translation, setTranslation]
}
