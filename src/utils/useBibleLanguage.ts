import { useSyncExternalStore } from 'react'
import type { BibleLanguageId } from '../bible/provider'
import { currentTranslation, setTranslation, translationForLanguage } from './useTranslation'

const STORAGE_KEY = 'berean-bible-language'

export interface BibleLanguageOption {
  id: BibleLanguageId
  // Endonym first — a Tamil reader looking for Tamil is looking for தமிழ்.
  label: string
}

export const BIBLE_LANGUAGES: BibleLanguageOption[] = [
  { id: 'eng', label: 'English' },
  { id: 'tam', label: 'தமிழ் · Tamil' }
]

/** The language control is only worth showing once there is a choice to make.
 * With a single language it is pure clutter over the passage, so every surface
 * that renders it checks this first. */
export const HAS_MULTIPLE_LANGUAGES = BIBLE_LANGUAGES.length > 1

// The language a reader reads scripture in — a SEPARATE choice from which
// translation. It scopes the translation switcher (an English reader is only
// ever offered BSB/KJV/ESV, exactly as before this existed) and picks the
// reading face via a `data-bible-lang` attribute on <html>, mirroring
// useTheme/useTextSize's pattern; 'eng' is the unmarked default, so nothing
// about English rendering changes.
//
// A global store rather than a per-component hook for the same reason
// useTranslation is one: the switcher, the reading surfaces and Settings all
// have to see the change the moment it happens, with no shared parent.
//
// localStorage-only (device-level) for v1 — deliberately NOT synced through
// BereanApi/Supabase, which keeps this out of the data layer entirely. Read is
// guarded the same way the other preferences are: a browser that denies storage
// falls back to English rather than taking the app down on a preference read.
function readStored(): BibleLanguageId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return BIBLE_LANGUAGES.some(l => l.id === stored) ? (stored as BibleLanguageId) : 'eng'
  } catch {
    return 'eng'
  }
}

function applyAttribute(language: BibleLanguageId): void {
  // Guarded for the non-DOM environment the unit tests run in.
  if (typeof document === 'undefined') return
  if (language === 'eng') {
    document.documentElement.removeAttribute('data-bible-lang')
  } else {
    document.documentElement.setAttribute('data-bible-lang', language)
  }
}

let current: BibleLanguageId = readStored()

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): BibleLanguageId {
  return current
}

function setBibleLanguage(next: BibleLanguageId): void {
  if (next === current) return
  current = next
  applyAttribute(next)
  // Notes anchor by verse number and are translation-independent, so this moves
  // only what the reader READS — every note stays anchored to its verse across
  // the switch, with no data-model change.
  setTranslation(translationForLanguage(currentTranslation(), next))
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* the choice still applies to this session, it just isn't remembered */
  }
  listeners.forEach(l => l())
}

// Boot: paint the attribute, and reconcile a stored translation that doesn't
// belong to the stored language (an older build, a hand-edited key, or a
// language whose translations changed) rather than fetching a chapter no
// switcher would offer.
applyAttribute(current)
setTranslation(translationForLanguage(currentTranslation(), current))

export function useBibleLanguage(): [BibleLanguageId, (l: BibleLanguageId) => void] {
  const language = useSyncExternalStore(subscribe, getSnapshot)
  return [language, setBibleLanguage]
}
