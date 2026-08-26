import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// The mobile verse-selection bar: the small floating toolbar that rises when you
// select verses, offering "Note". It lives here (rather than inline in
// BookDetailPage) so it can own its own enter/exit animation — it stays mounted
// through a reverse slide-out on dismiss instead of vanishing.
//
// Portaled to <body> on purpose: it is position:fixed, and the chapter deck it
// would otherwise sit inside carries a transform (for the swipe), which would
// trap a fixed element in that containing block and pin it off-screen.

// Matches --dur-3 (the entrance/exit duration in main.css).
const EXIT_MS = 260

interface MobileSelectionBarProps {
  shown: boolean
  reference: string
  onClear: () => void
  onNote: () => void
}

export default function MobileSelectionBar({
  shown,
  reference,
  onClear,
  onNote
}: MobileSelectionBarProps): React.ReactElement | null {
  const [mounted, setMounted] = useState(shown)
  const [leaving, setLeaving] = useState(false)
  // The selection (and so the reference) clears the instant `shown` goes false,
  // but the bar is still sliding out — freeze the last content so it reads right
  // for the length of that exit.
  const last = useRef({ reference })
  if (shown) last.current = { reference }

  useEffect(() => {
    if (shown) {
      setMounted(true)
      setLeaving(false)
      return
    }
    if (!mounted) return
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setMounted(false)
      return
    }
    setLeaving(true)
    const t = window.setTimeout(() => {
      setMounted(false)
      setLeaving(false)
    }, EXIT_MS)
    return () => window.clearTimeout(t)
  }, [shown, mounted])

  if (!mounted) return null
  const content = shown ? { reference } : last.current

  return createPortal(
    <div
      className={`mobile-selbar${leaving ? ' is-leaving' : ''}`}
      role="toolbar"
      aria-label="Selection actions"
    >
      <span className="mobile-selbar-ref">{content.reference}</span>
      <span className="mobile-selbar-spacer" />
      <button
        type="button"
        className="mobile-selbar-clear"
        onClick={onClear}
        aria-label="Clear selection"
      >
        ✕
      </button>
      <button type="button" className="mobile-selbar-note" onClick={onNote}>
        Note
      </button>
    </div>,
    document.body
  )
}
