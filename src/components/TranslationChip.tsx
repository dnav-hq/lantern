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

/**
 * The YouVersion-style corner chip: always shows the active translation
 * abbreviation, and doubles as a picker so switching never requires a trip
 * to Settings. Reads and writes the same useTranslation store Settings does
 * (TRANSLATIONS), so there is exactly one list and one persisted choice.
 */
export default function TranslationChip(): React.ReactElement {
  const [translation, setTranslation] = useTranslation()
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

  useClickOutside(
    hostRef,
    useCallback(() => setOpen(false), []),
    open
  )

  const current = TRANSLATIONS.find(t => t.id === translation)

  return (
    <div className="translation-chip-host" ref={hostRef}>
      <button
        type="button"
        className="translation-chip-btn"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current ? `Switch translation (now ${current.label})` : 'Switch translation'}
      >
        {translation}
      </button>
      {open && (
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
