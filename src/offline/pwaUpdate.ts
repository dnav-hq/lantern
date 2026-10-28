import { registerSW } from 'virtual:pwa-register'

// Silent service-worker update.
//
// Originally registerType was 'autoUpdate', which activated a new worker and
// force-reloaded the page a few seconds into a session — a jarring white
// flash, mid-read. Then a 'prompt' pill asked the reader to reload, which was
// a chore nobody should have to think about. Now (registerType stays 'prompt'
// in vite.config, so the new worker installs and WAITS) the update applies
// itself at a moment the reader is not looking:
//   - the page has been hidden for at least HIDDEN_APPLY_MS (a backgrounded
//     tab, a phone in a pocket) — applied while still hidden if the browser
//     runs our timer, otherwise the instant it comes back; or
//   - naturally on the next full launch, as before.
// It never reloads while the tab is visible and in use. The 'pwa:need-refresh'
// event is still raised for anything that wants to know, but nothing in the
// UI shows it any more (PwaUpdatePrompt is headless).

const NEED_REFRESH_EVENT = 'pwa:need-refresh'
const HIDDEN_APPLY_MS = 5 * 60 * 1000

// The reload-and-activate function, captured once the new worker is waiting.
let applyUpdate: (() => Promise<void>) | null = null
let watching = false

export function initServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  const updateSW = registerSW({
    // Register as soon as possible; this does NOT reload (that's the old
    // autoUpdate behaviour we're deliberately dropping).
    immediate: true,
    onNeedRefresh() {
      applyUpdate = () => updateSW(true)
      watchForQuietMoment()
      window.dispatchEvent(new Event(NEED_REFRESH_EVENT))
    }
  })
}

// Apply the waiting update once the page has been hidden long enough.
// Idempotent: one listener however many workers queue up behind each other.
function watchForQuietMoment(): void {
  if (watching || typeof document === 'undefined') return
  watching = true
  let hiddenAt: number | null = document.hidden ? Date.now() : null
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const arm = (): void => {
    clear()
    timer = setTimeout(() => {
      // Still hidden after the wait: reload now, so the reader returns to the
      // new build with no visible reload at all.
      if (document.hidden) applyPwaUpdate()
    }, HIDDEN_APPLY_MS)
  }
  if (hiddenAt !== null) arm()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now()
      arm()
      return
    }
    clear()
    // Back after a long absence (timers are throttled or frozen in the
    // background, so the timer above often never fired): apply before the
    // reader has started anything.
    if (hiddenAt !== null && Date.now() - hiddenAt >= HIDDEN_APPLY_MS) applyPwaUpdate()
    hiddenAt = null
  })
}

// Subscribe to "a new version is ready". Returns an unsubscribe.
export function onPwaNeedRefresh(cb: () => void): () => void {
  window.addEventListener(NEED_REFRESH_EVENT, cb)
  return () => window.removeEventListener(NEED_REFRESH_EVENT, cb)
}

// Activate the waiting worker and reload.
export function applyPwaUpdate(): void {
  void applyUpdate?.()
}
