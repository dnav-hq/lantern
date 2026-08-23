import { useSyncExternalStore } from 'react'
import type { BibleLanguageId, TranslationId } from '../bible/provider'

const STORAGE_KEY = 'berean-translation'

export interface TranslationOption {
  id: TranslationId
  label: string
  // Which Bible LANGUAGE this translation belongs to. The switcher only ever
  // offers one language's translations at a time (see translationsForLanguage),
  // so an English reader never meets a Tamil option and vice versa — the list
  // is never flattened or grouped across languages.
  language: BibleLanguageId
}

// Order matters twice: it is the order the switcher renders, and the FIRST
// entry of a language is that language's primary — what a reader lands on when
// they switch language (see translationForLanguage).
export const TRANSLATIONS: TranslationOption[] = [
  { id: 'BSB', label: 'Berean Standard Bible (BSB)', language: 'eng' },
  { id: 'KJV', label: 'King James Version (KJV)', language: 'eng' },
  { id: 'ESV', label: 'English Standard Version (ESV)', language: 'eng' },
  { id: 'IRV', label: 'Indian Revised Version (IRV)', language: 'tam' },
  { id: 'TCV', label: 'Tamil Contemporary Version (TCV)', language: 'tam' }
]

function isTranslationId(value: string | null): value is TranslationId {
  return TRANSLATIONS.some(t => t.id === value)
}

/** The translations offered in one language — the whole of the switcher's list. */
export function translationsForLanguage(language: BibleLanguageId): TranslationOption[] {
  return TRANSLATIONS.filter(t => t.language === language)
}

/**
 * The translation to read in after a language switch: keep the current one when
 * it already belongs to the chosen language, otherwise fall back to that
 * language's primary (the first entry above — BSB for English, IRV for Tamil).
 * Pure, so the fallback rule is unit-testable without a store or a DOM.
 */
export function translationForLanguage(
  current: TranslationId,
  language: BibleLanguageId
): TranslationId {
  const options = translationsForLanguage(language)
  if (options.some(t => t.id === current)) return current
  return options[0].id
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

/** The store's setter, for the language store — which has to move the reader to
 * a translation in the new language without being a React component. */
export { setTranslation }

/** What the store currently holds, same reason. */
export function currentTranslation(): TranslationId {
  return current
}

// ─── Guest reading ───────────────────────────────────────────────────────────
// A signed-out visitor gets BSB/KJV only. ESV is deliberately excluded: it is a
// key-proxied, quota-limited path shared across every Lantern user (see
// docs/proposals/guest-preview-mode.md §8 and the esv-proxy rate limit), so it
// stays signed-in-only. BSB/KJV are also the only public-domain, self-hostable
// — i.e. offline-capable — shape, which is why the two decisions reinforce
// rather than fight each other.
// English-only as well as ESV-free: the language control lives in the signed-in
// app's reading preferences, so a guest has no way to choose a language and
// must never be handed a translation the guest picker doesn't offer.
export const GUEST_TRANSLATIONS = TRANSLATIONS.filter(t => t.language === 'eng' && t.id !== 'ESV')

/**
 * The translation a guest actually reads in. The store is shared with the
 * signed-in app, so a browser that already chose ESV would otherwise hand a
 * guest a translation they are not allowed to fetch — coerce, rather than
 * rewriting the stored preference, so signing in later still lands back on ESV.
 */
export function toGuestTranslation(translation: TranslationId): TranslationId {
  return GUEST_TRANSLATIONS.some(t => t.id === translation) ? translation : 'BSB'
}

export function useGuestTranslation(): [TranslationId, (t: TranslationId) => void] {
  const [translation, set] = useTranslation()
  return [toGuestTranslation(translation), set]
}
