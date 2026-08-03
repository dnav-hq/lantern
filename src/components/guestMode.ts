// Guest mode's one bit of persisted state: "this browser chose to read without
// an account". Deliberately a flag and nothing else — a guest has no data model
// (docs/proposals/guest-preview-mode.md §2), so there is nothing else to
// remember. It exists purely so a reload or a PWA relaunch drops the reader
// back into scripture instead of the landing wall.
//
// A plain .ts module (not a hook, not part of GuestReader.tsx) so Root can read
// it to pick a phase without eagerly pulling the whole guest tree into the
// signed-in bundle, and so the logic is testable without a DOM.

export const GUEST_FLAG_KEY = 'berean.guest'

/** The slice of localStorage this module needs — injectable so it can be tested. */
export interface GuestFlagStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * localStorage, or null where it is unavailable (SSR, a hardened browser
 * profile, private-mode quota errors). Guest mode degrades to "not
 * remembered" rather than throwing — same defensive shape as App's
 * hideAllNotes preference.
 */
export function defaultGuestStore(): GuestFlagStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function isGuestMode(store: GuestFlagStore | null = defaultGuestStore()): boolean {
  try {
    return store?.getItem(GUEST_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function enterGuestMode(store: GuestFlagStore | null = defaultGuestStore()): void {
  try {
    store?.setItem(GUEST_FLAG_KEY, '1')
  } catch {
    /* ignore — guest mode still works for this session, just isn't remembered */
  }
}

export function exitGuestMode(store: GuestFlagStore | null = defaultGuestStore()): void {
  try {
    store?.removeItem(GUEST_FLAG_KEY)
  } catch {
    /* ignore */
  }
}
