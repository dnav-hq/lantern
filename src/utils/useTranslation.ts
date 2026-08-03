import { useSyncExternalStore } from 'react'
import type { TranslationId } from '../bible/provider'

const STORAGE_KEY = 'berean-translation'

export const TRANSLATIONS: { id: TranslationId; label: string }[] = [
  { id: 'BSB', label: 'Berean Standard Bible (BSB)' },
  { id: 'KJV', label: 'King James Version (KJV)' },
  { id: 'ESV', label: 'English Standard Version (ESV)' }
]

function isTranslationId(value: string | null): value is TranslationId {
  return value === 'BSB' || value === 'KJV' || value === 'ESV'
}

// Global, not per-passage (see docs/proposals/translations-esv-niv.md section
// 3) — a single preference shared by every reading surface. Unlike
// useDarkMode/useTheme, switching this has to trigger an actual data refetch
// in components that don't share a parent render (BookDetailPage, ReadingMode,
// StudyMode, SettingsModal each call this hook independently, with no
// App.tsx-level lifting), so plain per-component useState isn't enough — every
// call site needs to observe the SAME value the moment it changes anywhere.
// useSyncExternalStore gives that without a Context provider.
// Guarded the same way App's hideAllNotes preference is: a browser that denies
// storage (hardened profile, private-mode quota) must fall back to the default
// translation, never take the app down on a preference read.
function readStored(): TranslationId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isTranslationId(stored) ? stored : 'BSB'
  } catch {
    return 'BSB'
  }
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
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* the choice still applies to this session, it just isn't remembered */
  }
  listeners.forEach(l => l())
}

export function useTranslation(): [TranslationId, (t: TranslationId) => void] {
  const translation = useSyncExternalStore(subscribe, getSnapshot)
  return [translation, setTranslation]
}

// ─── Guest reading ───────────────────────────────────────────────────────────
// A signed-out visitor gets BSB/KJV only. ESV is deliberately excluded: it is a
// key-proxied, quota-limited path shared across every Lantern user (see
// docs/proposals/guest-preview-mode.md §8 and the esv-proxy rate limit), so it
// stays signed-in-only. BSB/KJV are also the only public-domain, self-hostable
// — i.e. offline-capable — shape, which is why the two decisions reinforce
// rather than fight each other.
export const GUEST_TRANSLATIONS = TRANSLATIONS.filter(t => t.id !== 'ESV')

/**
 * The translation a guest actually reads in. The store is shared with the
 * signed-in app, so a browser that already chose ESV would otherwise hand a
 * guest a translation they are not allowed to fetch — coerce, rather than
 * rewriting the stored preference, so signing in later still lands back on ESV.
 */
export function toGuestTranslation(translation: TranslationId): TranslationId {
  return translation === 'ESV' ? 'BSB' : translation
}

export function useGuestTranslation(): [TranslationId, (t: TranslationId) => void] {
  const [translation, set] = useTranslation()
  return [toGuestTranslation(translation), set]
}
