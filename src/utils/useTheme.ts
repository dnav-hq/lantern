import { useState, useEffect } from 'react'
import { syncBrowserChrome } from './useDarkMode'

const STORAGE_KEY = 'berean-visual-theme'
// Sibling of the keys above — hyphenated to match berean-theme /
// berean-visual-theme / berean-text-size, the other appearance prefs.
const PURE_BLACK_KEY = 'berean-pure-black'

export type ThemeId = 'berean' | 'scholarly' | 'paper' | 'modern'

// ── The curated Appearance list ──────────────────────────────────────────────
// Settings shows ONE flat list of complete "looks" instead of three independent
// controls (theme picker + a separate light/dark toggle + a pure-black
// checkbox). That matrix was the confusing part: switching themes never touched
// light/dark, so every theme looked dark and the light option was easy to miss.
//
// A Look just bundles the three underlying axes — theme / dark / pureBlack — so
// the user picks an OUTCOME and one click sets all three. The engine below
// (data-theme, body.dark, data-pure-black + tokens.css) is completely unchanged;
// this is only how the axes are presented, so no stored preference resets.
//
// Deliberately curated, NOT the full 4×2 (+OLED) matrix, which would be 8–9
// rows — more complex, not less. The four LIGHT themes are distinct reading
// voices worth keeping; the dark variants were near-duplicates, so dark
// collapses to one warm near-black plus true black. The ids below stay tied to
// their theme ('berean' → 'lantern' for the visible name only) so nothing in
// storage moves.
export type LookId = 'lantern' | 'scholarly' | 'paper' | 'modern' | 'lantern-dark' | 'pure-black'

export interface Look {
  id: LookId
  label: string
  blurb: string
  // Section heading the row sits under in Settings.
  group: 'Light' | 'Dark' | 'Pure black'
  // The three underlying axes this look sets when chosen.
  theme: ThemeId
  dark: boolean
  pureBlack: boolean
}

export const LOOKS: Look[] = [
  {
    id: 'lantern',
    label: 'Lantern',
    blurb: 'Warm cream + indigo · the default',
    group: 'Light',
    theme: 'berean',
    dark: false,
    pureBlack: false
  },
  {
    id: 'scholarly',
    label: 'Scholarly',
    blurb: 'Paper-white, quiet',
    group: 'Light',
    theme: 'scholarly',
    dark: false,
    pureBlack: false
  },
  {
    id: 'paper',
    label: 'Warm Paper',
    blurb: 'Cream + amber warmth',
    group: 'Light',
    theme: 'paper',
    dark: false,
    pureBlack: false
  },
  {
    id: 'modern',
    label: 'Quiet Modern',
    blurb: 'Cool, crisp sans',
    group: 'Light',
    theme: 'modern',
    dark: false,
    pureBlack: false
  },
  {
    id: 'lantern-dark',
    label: 'Lantern Dark',
    blurb: 'Warm near-black',
    group: 'Dark',
    theme: 'berean',
    dark: true,
    pureBlack: false
  },
  {
    id: 'pure-black',
    label: 'Pure Black',
    blurb: 'True black · saves power on OLED',
    group: 'Pure black',
    theme: 'berean',
    dark: true,
    pureBlack: true
  }
]

// Which curated row best matches the current axes, for HIGHLIGHTING only — it
// never writes state. Dark collapses to the single warm row (or the OLED row
// when pure-black is on); light maps each theme to its own row. A returning
// user on a combo with no dedicated row (e.g. Warm Paper + dark) keeps
// rendering exactly as before and simply highlights the nearest row until they
// pick a different one.
export function lookIdFor(theme: ThemeId, isDark: boolean, pureBlack: boolean): LookId {
  if (isDark) return pureBlack ? 'pure-black' : 'lantern-dark'
  return theme === 'berean' ? 'lantern' : theme
}

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
    // Browser chrome / iOS status bar follow the canvas to true black (and back)
    // — the same meta tags useDarkMode owns, kept in sync when pure-black alone
    // toggles (dark mode itself hasn't changed, so useDarkMode's effect won't run).
    syncBrowserChrome()
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
