import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'berean.paragraph-breaks'

// Whether the reading page leaves a little space where a new paragraph begins
// (see src/utils/paragraphs.ts for where the breaks come from). On by default.
// Shaped after useTranslation.ts: a module-level store with subscribers, so
// every mounted reader updates the moment Settings flips it, with no App.tsx
// lifting. Guarded the same way: a browser that denies storage falls back to
// the default rather than taking the app down on a preference read.
function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

let current: boolean = readStored()

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): boolean {
  return current
}

function setParagraphBreaks(on: boolean): void {
  if (on === current) return
  current = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    /* the choice still applies to this session, it just isn't remembered */
  }
  listeners.forEach(l => l())
}

export function useParagraphBreaks(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, getSnapshot)
  return [on, setParagraphBreaks]
}

/** What the store currently holds, for non-hook code. */
export function readParagraphBreaks(): boolean {
  return current
}
