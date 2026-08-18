import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import Root from './Root'
import { installGlobalErrorHandlers } from './telemetry/globalHandlers'
// Scripture reading faces, self-hosted (see tokens.css --scripture-font per
// [data-theme]; Georgia is still the fallback if a woff2 fails to load).
// Only the weights actually referenced by tokens.css are pulled in.
import '@fontsource/source-serif-4/400.css'
import '@fontsource/source-serif-4/500.css'
import '@fontsource/source-serif-4/600.css'
import '@fontsource/newsreader/400.css'
import '@fontsource/newsreader/500.css'
import './assets/tokens.css'
import './assets/main.css'
import './assets/dark.css'
import './assets/motion.css'

// Error capture for what the React boundaries can't see (event handlers, timers,
// unhandled rejections). Installed before render so a throw during the very
// first mount is still caught. Content-free by construction — see src/errors.ts.
// No-ops entirely when Supabase isn't configured.
installGlobalErrorHandlers()

// Service worker: precache the app shell, auto-update in the background with
// no user prompt (registerType: 'autoUpdate' in vite.config.ts). Supabase API
// traffic is excluded from the SW cache (NetworkOnly) so this never masks
// staleness for reads/writes — only the shell (JS/CSS/HTML/icons) is cached.
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true })
}

// Tag the body with the current platform so CSS can target it precisely.
// navigator.platform is 'MacIntel' / 'MacM1' on macOS, 'Win32' on Windows, etc.
if (navigator.platform.toLowerCase().includes('mac')) {
  document.body.classList.add('platform-mac')
}

// Pointer mode: mouse-only affordances (the verse-row hover tint, the verse
// number recolour, and the mouse text-selection escape hatch) must key off the
// ACTUAL input device, not a media query. Samsung/S-Pen phones report BOTH
// `hover: hover` AND `pointer: fine`, so `@media (hover) and (pointer: fine)`
// still matched a finger and leaked a grey highlight + blue number onto a plain
// hold. PointerEvent.pointerType is reliable where those media features aren't
// (it's the same signal useVerseMarquee trusts to tell touch from mouse).
// Default OFF (touch-first): a real mouse turns `pointer-mouse` on; any touch or
// pen press turns it back off, so a hold shows nothing on a phone.
{
  const root = document.documentElement
  const setMouse = (on: boolean): void => {
    root.classList.toggle('pointer-mouse', on)
  }
  window.addEventListener('pointerdown', e => setMouse(e.pointerType === 'mouse'), true)
  window.addEventListener(
    'pointermove',
    e => {
      if (e.pointerType === 'mouse' && !root.classList.contains('pointer-mouse')) setMouse(true)
    },
    { capture: true, passive: true }
  )
}

// Root chooses the backend: Supabase (auth-gated) when configured, otherwise the
// in-memory stub for local dev.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
