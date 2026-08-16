import { useState, useEffect } from 'react'

const STORAGE_KEY = 'berean-visual-theme'
// Sibling of the keys above — hyphenated to match berean-theme /
// berean-visual-theme / berean-text-size, the other appearance prefs.
const PURE_BLACK_KEY = 'berean-pure-black'

export type ThemeId = 'berean' | 'scholarly' | 'paper' | 'modern'

export const THEMES: { id: ThemeId; label: string; blurb: string }[] = [
  // NOTE: the id stays 'berean' deliberately — it is the persisted value in
  // localStorage and the [data-theme] hook in tokens.css. Renaming it would
  // silently reset every existing user's theme. Only the visible label moved.
  { id: 'berean', label: 'Lantern', blurb: 'Warm cream + indigo (default)' },
  { id: 'scholarly', label: 'Scholarly Serif', blurb: 'Paper-white, quiet' },
  { id: 'paper', label: 'Warm Paper', blurb: 'Cream + amber warmth' },
  { id: 'modern', label: 'Quiet Modern', blurb: 'Cool, crisp sans reading' }
]

// Independent of light/dark mode (useDarkMode) — this picks the color/type
// direction; body.dark still layers on top of whichever theme is active.
export function useTheme(): [ThemeId, (t: ThemeId) => void] {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (stored as ThemeId) || 'berean'
  })

  useEffect(() => {
    if (theme === 'berean') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = (t: ThemeId): void => setThemeState(t)

  return [theme, setTheme]
}

// Pure black (OLED) — a MODIFIER on dark mode, deliberately NOT a fifth theme.
// It sets `data-pure-black` on <html>; tokens.css then deepens the canvas and
// surfaces of whichever theme's dark variant is active, so it composes with all
// four instead of duplicating them, and there is nothing extra to maintain when
// a fifth theme lands. Scoped to `body.dark` in CSS, so it is a no-op in light
// mode by construction — no JS coupling to useDarkMode is needed.
//
// Storage is wrapped, unlike its siblings above: this pref is read on first
// render, and a denied localStorage (Safari private mode, some embedded
// webviews) must fall back to OFF rather than throw on the way up.
function readPureBlack(): boolean {
  try {
    return localStorage.getItem(PURE_BLACK_KEY) === 'on'
  } catch {
    return false
  }
}

export function usePureBlack(): [boolean, (value: boolean) => void] {
  const [pureBlack, setPureBlackState] = useState<boolean>(readPureBlack)

  useEffect(() => {
    if (pureBlack) {
      document.documentElement.setAttribute('data-pure-black', '')
    } else {
      document.documentElement.removeAttribute('data-pure-black')
    }
    try {
      localStorage.setItem(PURE_BLACK_KEY, pureBlack ? 'on' : 'off')
    } catch {
      // Storage denied — the choice still applies for this session, it just
      // won't survive a reload. Never worth breaking the app over.
    }
  }, [pureBlack])

  const setPureBlack = (value: boolean): void => setPureBlackState(value)

  return [pureBlack, setPureBlack]
}
