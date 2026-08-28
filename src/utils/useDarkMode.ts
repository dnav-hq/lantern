import { useState, useEffect } from 'react'

const STORAGE_KEY = 'berean-theme'

// Mirrors tokens.css's body.dark --bg / :root --bg (the app canvas). Kept as
// literals rather than read from the DOM because the meta tags below must
// update on the same tick body.dark does — see the effect.
const DARK_BG = '#17140f'
const LIGHT_BG = '#f4f0e8'
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
  const bg = isDark ? (pureBlack ? PURE_BLACK_BG : DARK_BG) : LIGHT_BG
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  // iOS standalone/installed-PWA status bar. "black"/"default" is the full range
  // this meta accepts (no arbitrary hex) — "black" is the closest match to any
  // dark canvas, pure-black included.
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', isDark ? 'black' : 'default')
}

// Third element is a direct setter (bypassing toggle), used only by the
// account-settings sync in App.tsx to hydrate from an account value on
// sign-in — every other caller keeps using the toggle.
export function useDarkMode(): [boolean, () => void, (value: boolean) => void] {
  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === 'dark'
    // Default: follow the OS preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

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
