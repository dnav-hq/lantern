import { useState, useEffect } from 'react'

const STORAGE_KEY = 'berean-theme'

// Mirrors tokens.css's body.dark --bg / :root --bg (the app canvas). Kept as
// literals rather than read from the DOM because the meta tags below must
// update on the same tick body.dark does — see the effect.
// Per visual theme, [light canvas, dark canvas] — the same table index.html's
// boot script carries, and it must stay in step with it and with tokens.css.
// This used to be a single berean-only pair, so a reader on Scholarly, Paper or
// Modern got berean's near-black in the browser chrome while the app canvas was
// a different near-black. Only visible as a seam at the very top of the screen,
// which is exactly the kind of thing nobody reports and everybody notices.
const CANVAS: Record<string, [string, string]> = {
  berean: ['#f4f0e8', '#17140f'],
  scholarly: ['#fbfaf8', '#17161a'],
  paper: ['#f3efe7', '#1c1915'],
  modern: ['#f7f8fa', '#0f1115']
}
// Pure black (OLED) drops the canvas to true black (tokens.css
// `html[data-pure-black] body.dark { --bg: #000000 }`), so the browser chrome
// and iOS status bar should follow it to true black too rather than the theme's
// ordinary dark canvas.
const PURE_BLACK_BG = '#000000'

// Point the browser chrome / iOS status-bar meta tags at the current canvas.
// Reads the live DOM flags both theme hooks set (body.dark, data-pure-black),
// so it produces the same answer whether dark mode OR pure-black just changed —
// which is why usePureBlack calls it too, not only useDarkMode.
export function syncBrowserChrome(): void {
  const isDark = document.body.classList.contains('dark')
  const pureBlack = document.documentElement.hasAttribute('data-pure-black')
  const visual = document.documentElement.getAttribute('data-theme') ?? 'berean'
  const pair = CANVAS[visual] ?? CANVAS.berean
  const bg = isDark ? (pureBlack ? PURE_BLACK_BG : pair[1]) : pair[0]
  // ALL of them, and strip `media`: index.html ships a media-scoped pair so the
  // installed Android PWA has a dark answer before any script runs, and a tag
  // still carrying `media` could out-vote the choice the reader actually made.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta, i) => {
    if (i > 0) {
      meta.remove()
      return
    }
    meta.removeAttribute('media')
    meta.setAttribute('content', bg)
  })
  // iOS standalone/installed-PWA status bar. "black"/"default" is the full range
  // this meta accepts (no arbitrary hex) — "black" is the closest match to any
  // dark canvas, pure-black included.
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', isDark ? 'black' : 'default')
}

/** The reader's dark preference: their explicit choice, else the OS. */
export function prefersDark(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored !== null) return stored === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Apply that preference to `body` WITHOUT the hook.
 *
 * `useDarkMode` lives inside `App`, and the signed-out route renders `Landing`
 * INSTEAD of `App` — so `body.dark` was never set there, and landing.css's own
 * `body.dark` rules (whose header claims dark mode "comes for free") never
 * applied. A dark-mode visitor got a dark boot splash and then a fully light
 * landing page. Root calls this on that route; it reads the same storage key
 * the hook does, so the two cannot disagree when App later mounts.
 */
export function applyStoredDarkMode(): void {
  document.body.classList.toggle('dark', prefersDark())
  syncBrowserChrome()
}

// Third element is a direct setter (bypassing toggle), used only by the
// account-settings sync in App.tsx to hydrate from an account value on
// sign-in — every other caller keeps using the toggle.
export function useDarkMode(): [boolean, () => void, (value: boolean) => void] {
  const [isDark, setIsDark] = useState<boolean>(prefersDark)

  useEffect(() => {
    document.body.classList.toggle('dark', isDark)
    localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')

    // Browser chrome / status-bar color: static in index.html for the first
    // paint, then kept live here since Lantern's dark mode is an explicit
    // toggle, not just prefers-color-scheme. Reads pure-black off the DOM too.
    syncBrowserChrome()
  }, [isDark])

  const toggle = (): void => setIsDark(prev => !prev)

  return [isDark, toggle, setIsDark]
}
