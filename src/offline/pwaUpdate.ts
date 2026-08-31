import { registerSW } from 'virtual:pwa-register'

// Silent service-worker update — no visible prompt, ever.
//
// registerType is 'prompt' in vite.config (not 'autoUpdate'), so a new worker
// installs and WAITS rather than activating and force-reloading mid-session
// (that was the old jarring white flash). We never call the reload-and-activate
// function the plugin would otherwise hand us, so the waiting worker takes
// over the way the standard service-worker lifecycle already does on its own:
// the next time the reader fully closes and relaunches (no old tab left open).
// Scripture and notes are not version-sensitive, so that quiet delay is fine —
// there is nothing here for the reader to be interrupted about.
export function initServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  registerSW({ immediate: true })
}
