// platform/install.ts — "add this app to the home screen".
//
// A `platform/` module for the same reason export.ts is one: a Capacitor/Tauri
// shell has no install step at all, and a browser's install step is a
// browser-specific capability, not app logic. Components never touch
// `beforeinstallprompt`, `navigator.standalone` or the user agent — they ask
// this module what (if anything) is possible and call `promptInstall()`.
//
// Two worlds, and the difference is not cosmetic:
//   - Chromium (Android, desktop Chrome/Edge) fires `beforeinstallprompt`. We
//     preventDefault() it — that is what suppresses Chrome's own mini-infobar,
//     the popup that lands on a first-time visitor before they know what
//     Lantern is and gets swiped away forever — and stash the event so OUR
//     calm suggestion can replay it later, at a moment the user has earned.
//   - iOS Safari has no programmatic install at all. The only honest thing to
//     offer is a hint: Share, then "Add to Home Screen".
// Everywhere else (desktop Firefox, an in-app webview) there is nothing to
// offer and the capability is 'none', so the UI renders nothing.

/** The subset of the non-standard BeforeInstallPromptEvent we actually use. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * What, if anything, this browser can do about installing:
 *   'prompt'   — a stashed beforeinstallprompt is ready to replay.
 *   'ios-hint' — iOS Safari: no API, show the Share → Add to Home Screen hint.
 *   'none'     — already installed, or a browser with no install path. Render
 *                nothing at all rather than a button that can't work.
 */
export type InstallCapability = 'prompt' | 'ios-hint' | 'none'

// ─── Already installed ───────────────────────────────────────────────────────

/**
 * Pure so the gate is testable without a browser. BOTH signals are required by
 * spec and they are genuinely different browsers: Chromium/Android reports the
 * display mode, iOS Safari only ever sets the legacy `navigator.standalone`.
 * Checking one would show a "install me" suggestion to someone reading these
 * words inside the installed app.
 */
export function computeStandalone(input: {
  displayModeStandalone: boolean
  navigatorStandalone: boolean
}): boolean {
  return input.displayModeStandalone || input.navigatorStandalone
}

/** True when this session is running as an installed app. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  let displayMode = false
  try {
    displayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  } catch {
    // matchMedia exists everywhere we ship, but an odd webview throwing here
    // must not take the app down over a nudge.
  }
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return computeStandalone({
    displayModeStandalone: displayMode,
    navigatorStandalone: nav?.standalone === true
  })
}

// ─── iOS Safari ──────────────────────────────────────────────────────────────

/**
 * Pure iOS-Safari test, kept separate from the UA read so it can be tested.
 *
 * Deliberately UA-based, which is normally the wrong tool — but the thing being
 * detected is the ABSENCE of an API (`beforeinstallprompt`), and an absence
 * can't be feature-detected: "no event yet" is indistinguishable from "event
 * hasn't fired yet". Chrome/Firefox/Edge ON iOS are excluded because they can't
 * add to the home screen either; only Safari's share sheet has that item.
 *
 * iPadOS 13+ reports a desktop-Macintosh UA, hence the touch-points clause.
 */
export function computeIsIosSafari(input: { userAgent: string; maxTouchPoints: number }): boolean {
  const ua = input.userAgent
  const iosDevice = /iPhone|iPad|iPod/.test(ua)
  // iPadOS 13+ masquerading as macOS: a Mac with a touchscreen is an iPad.
  const iPadDesktopUa = /Macintosh/.test(ua) && input.maxTouchPoints > 1
  if (!iosDevice && !iPadDesktopUa) return false
  // Every iOS browser embeds Safari's UA; the wrappers add their own token.
  if (/CriOS|FxiOS|EdgiOS|OPiOS|Chrome\//.test(ua)) return false
  return /Safari/.test(ua)
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  return computeIsIosSafari({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0
  })
}

// ─── beforeinstallprompt capture ─────────────────────────────────────────────
//
// Registered at MODULE LOAD, not from a React effect, because Chromium fires
// this event once, early, and often before the first paint. A listener attached
// in an effect can miss it entirely — and a missed event is unrecoverable: the
// browser does not re-fire it on request.

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<(capability: InstallCapability) => void>()

function notify(): void {
  const capability = getInstallCapability()
  for (const l of listeners) l(capability)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    // Suppresses Chrome's own mini-infobar. This is the whole point: the
    // browser's popup is what a first-time visitor swipes away.
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    notify()
  })
  // Installed in another tab, or via the browser's own menu: drop the stashed
  // event so nothing keeps offering an install that already happened.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

/**
 * Pure capability resolution — the shape every gate in the app reasons about.
 * Already-installed always wins: an installed user is offered nothing.
 */
export function computeInstallCapability(input: {
  standalone: boolean
  hasDeferredPrompt: boolean
  iosSafari: boolean
}): InstallCapability {
  if (input.standalone) return 'none'
  if (input.hasDeferredPrompt) return 'prompt'
  if (input.iosSafari) return 'ios-hint'
  return 'none'
}

/** What this browser can offer right now. Re-read on every subscriber ping. */
export function getInstallCapability(): InstallCapability {
  return computeInstallCapability({
    standalone: isStandalone(),
    hasDeferredPrompt: deferredPrompt !== null,
    iosSafari: isIosSafari()
  })
}

/** Subscribe to capability changes (the event arriving, or an install). */
export function subscribeInstallCapability(
  listener: (capability: InstallCapability) => void
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Replay the stashed prompt. Returns the user's answer, or 'unavailable' when
 * there was nothing to replay (iOS, or a browser that never fired the event).
 *
 * The event is single-use by spec: once prompted it is dropped either way, so a
 * second tap can't fire a dead prompt.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredPrompt
  if (!event) return 'unavailable'
  deferredPrompt = null
  notify()
  try {
    await event.prompt()
    const choice = await event.userChoice
    return choice.outcome
  } catch {
    // A prompt that throws (already consumed, or a browser quirk) is reported
    // as unavailable rather than crashing a menu tap.
    return 'unavailable'
  }
}
