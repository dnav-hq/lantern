// The install nudge's timing gate — when (if ever) Lantern quietly suggests
// adding itself to the home screen.
//
// ─── THE THRESHOLD, AND WHY IT IS THIS CONSERVATIVE ──────────────────────────
//
// The failure this exists to fix is the browser's OWN install popup: it appears
// on a first-ever visit, before the visitor knows what Lantern is, so it gets
// swiped away and never comes back. Re-creating that mistake in our own colours
// would be worse, not better. So the nudge requires BOTH conditions, not either:
//
//   1. NOT the first session — this is the 2nd or later time the app was
//      opened in this browser profile, and
//   2. a real engagement action has happened — a note was actually saved.
//
// Both, deliberately. A second visit alone can be an accident (a reload, a
// stray link); a saved note in the very first session is real interest but not
// yet a habit. Someone who has come back AND written something is a reader, and
// that is the only person we say anything to. It is shown AT MOST ONCE per
// browser profile, ever, whatever they do with it.
//
// Keys are `berean.*` and every read/write is try/caught, exactly like
// `berean.onboarded` — storage being unavailable (private mode, an embedded
// webview) must degrade to "no nudge", never to a crash.

import type { InstallCapability } from '../platform/install'

const SESSIONS_KEY = 'berean.install-sessions'
const ENGAGED_KEY = 'berean.install-engaged'
const SHOWN_KEY = 'berean.install-nudge-shown'
const DISMISSED_KEY = 'berean.install-nudge-dismissed'
// sessionStorage, not localStorage: it is what defines "a session" here — one
// tab/app open. Its whole job is to make the counter below increment once per
// open instead of once per re-render.
const SESSION_MARK_KEY = 'berean.install-session-counted'

/** The 2nd-or-later session. Session 1 is the visit that mints the counter. */
export const SESSION_THRESHOLD = 2

export interface InstallNudgeState {
  capability: InstallCapability
  /**
   * Phone/tablet viewport, matching the same breakpoint `useIsMobile` (in
   * BookDetailPage.tsx) already uses for the touch layout — the nudge and the
   * rest of the app must never disagree about what "mobile" means.
   */
  isMobile: boolean
  sessionCount: number
  engaged: boolean
  shown: boolean
  dismissed: boolean
}

/**
 * The whole decision, pure. Every clause is a "never":
 *  - never where there is nothing to install (already standalone → 'none'),
 *  - never on a desktop viewport — there is no home screen to add to there,
 *  - never on a first visit or first paint,
 *  - never before a real engagement action,
 *  - never twice: once seen, or once dismissed, it is done for good.
 */
export function shouldShowInstallNudge(state: InstallNudgeState): boolean {
  if (state.capability === 'none') return false
  if (!state.isMobile) return false
  if (state.dismissed || state.shown) return false
  if (state.sessionCount < SESSION_THRESHOLD) return false
  if (!state.engaged) return false
  return true
}

// ─── Storage (guarded exactly like berean.onboarded) ─────────────────────────

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1')
  } catch {
    /* storage unavailable — the gate simply stays closed */
  }
}

function readSessionCount(): number {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    const n = raw === null ? 0 : Number.parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/**
 * Count this app-open, once. Called from App's mount effect; the sessionStorage
 * mark makes a re-render, a remount or a route change free — only a genuinely
 * new tab/launch increments. Returns the count for this session.
 */
export function countInstallSession(): number {
  try {
    if (sessionStorage.getItem(SESSION_MARK_KEY) === '1') return readSessionCount()
    sessionStorage.setItem(SESSION_MARK_KEY, '1')
  } catch {
    // No sessionStorage → don't count at all rather than count every render.
    return readSessionCount()
  }
  const next = readSessionCount() + 1
  try {
    localStorage.setItem(SESSIONS_KEY, String(next))
  } catch {
    /* ignore */
  }
  return next
}

// Engagement is written from deep in the save paths and read by the App-level
// gate, so the gate needs to hear about it without polling. One tiny
// subscription, the same shape offline/status.ts uses.
const engagementListeners = new Set<() => void>()

export function subscribeInstallEngagement(listener: () => void): () => void {
  engagementListeners.add(listener)
  return () => {
    engagementListeners.delete(listener)
  }
}

/**
 * "This person actually uses Lantern." Called where a note is genuinely saved
 * (the three save paths: study, chapter reading, passage reading) — not on
 * opening a screen, and never on a first paint.
 */
export function markInstallEngagement(): void {
  writeFlag(ENGAGED_KEY)
  for (const l of engagementListeners) l()
}

export function hasInstallEngagement(): boolean {
  return readFlag(ENGAGED_KEY)
}

/** Written the first time the nudge renders — "at most once" is durable. */
export function markInstallNudgeShown(): void {
  writeFlag(SHOWN_KEY)
}

export function wasInstallNudgeShown(): boolean {
  return readFlag(SHOWN_KEY)
}

/** "Not now" is final. */
export function dismissInstallNudge(): void {
  writeFlag(DISMISSED_KEY)
}

export function wasInstallNudgeDismissed(): boolean {
  return readFlag(DISMISSED_KEY)
}
