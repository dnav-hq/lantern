import React, { useCallback, useEffect, useRef, useState } from 'react'
import { TRANSLATIONS, useTranslation } from '../utils/useTranslation'

/** Closes the picker when a click lands outside `ref`. Mirrors NavBar's own click-outside helper. */
function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  active: boolean
): void {
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onOutside, active])
}

interface TranslationChipProps {
  // Kept mounted with a constant layout footprint even when logically
  // hidden (visibility, not a conditional unmount) — the desktop top bar's
  // search box measures its own "rest" position once on mount and never
  // re-measures on navigation, so a chip that mounts/unmounts as the route
  // changes would shift that measurement out from under it and end up
  // hidden beneath the search box's now-stale fixed overlay. Reserving the
  // space unconditionally sidesteps that instead of chasing it.
  visible?: boolean
}

/**
 * The YouVersion-style corner chip: always shows the active translation
 * abbreviation, and doubles as a picker so switching never requires a trip
 * to Settings. Reads and writes the same useTranslation store Settings does
 * (TRANSLATIONS), so there is exactly one list and one persisted choice.
 */
export default function TranslationChip({
  visible = true
}: TranslationChipProps): React.ReactElement {
  const [translation, setTranslation] = useTranslation()
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

  useClickOutside(
    hostRef,
    useCallback(() => setOpen(false), []),
    open && visible
  )

  const current = TRANSLATIONS.find(t => t.id === translation)

  return (
    <div
      className={`translation-chip-host${visible ? '' : ' translation-chip-host--hidden'}`}
      ref={hostRef}
    >
      <button
        type="button"
        className="translation-chip-btn"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-hidden={!visible}
        tabIndex={visible ? 0 : -1}
        title={current ? `Switch translation (now ${current.label})` : 'Switch translation'}
      >
        {translation}
        <svg
          className="translation-chip-caret"
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && visible && (
        <div className="nav-menu translation-chip-menu" role="menu">
          {TRANSLATIONS.map(t => (
            <button
              key={t.id}
              className={`nav-menu-item${t.id === translation ? ' active' : ''}`}
              role="menuitem"
              onClick={() => {
                setTranslation(t.id)
                setOpen(false)
              }}
            >
              <span className="translation-chip-menu-abbr">{t.id}</span>
              {t.label}
              {t.id === translation && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginLeft: 'auto', flexShrink: 0 }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
