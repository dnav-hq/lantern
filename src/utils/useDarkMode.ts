import { useState, useEffect } from 'react'

const STORAGE_KEY = 'berean-theme'

// Mirrors tokens.css's body.dark --bg / :root --bg (the app canvas). Kept as
// literals rather than read from the DOM because the meta tags below must
// update on the same tick body.dark does — see the effect.
const DARK_BG = '#17140f'
const LIGHT_BG = '#f4f0e8'

export function useDarkMode(): [boolean, () => void] {
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
    // toggle, not just prefers-color-scheme.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDark ? DARK_BG : LIGHT_BG)
    // iOS standalone/installed-PWA status bar. "black"/"default" is the full
    // range this meta accepts (no arbitrary hex) — "black" is the closest
    // match to the dark canvas.
    document
      .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute('content', isDark ? 'black' : 'default')
  }, [isDark])

  const toggle = (): void => setIsDark(prev => !prev)

  return [isDark, toggle]
}
