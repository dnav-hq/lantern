import { registerSW } from 'virtual:pwa-register'

// Prompt-style service-worker update.
//
// Previously registerType was 'autoUpdate', which activated a new worker and
// force-reloaded the page a few seconds into a session — a jarring white flash,
// mid-read. Now (registerType: 'prompt' in vite.config) the new worker installs
// and WAITS. We raise a 'pwa:need-refresh' event the UI turns into a quiet,
// dismissible prompt (see PwaUpdatePrompt). The update applies only when the
// reader taps Refresh, or naturally on the next full launch — never unbidden in
// the middle of reading.

const NEED_REFRESH_EVENT = 'pwa:need-refresh'

// The reload-and-activate function, captured once the new worker is waiting.
let applyUpdate: (() => Promise<void>) | null = null

export function initServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  const updateSW = registerSW({
    // Register as soon as possible; this does NOT reload (that's the old
    // autoUpdate behaviour we're deliberately dropping).
    immediate: true,
    onNeedRefresh() {
      applyUpdate = () => updateSW(true)
      window.dispatchEvent(new Event(NEED_REFRESH_EVENT))
    }
  })
}

// Subscribe to "a new version is ready". Returns an unsubscribe.
export function onPwaNeedRefresh(cb: () => void): () => void {
  window.addEventListener(NEED_REFRESH_EVENT, cb)
  return () => window.removeEventListener(NEED_REFRESH_EVENT, cb)
}

// Activate the waiting worker and reload — called from the prompt's Refresh.
export function applyPwaUpdate(): void {
  void applyUpdate?.()
}
