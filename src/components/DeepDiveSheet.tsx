/**
 * The sheet every deep-dive door opens in — docs/proposals/deep-dive-doorways.md.
 *
 * One costume for every door: a scrim, a bottom sheet on a phone (a centred
 * panel on desktop), a head carrying the reference and one close control, and
 * a scrolling body. Extracted from WordDoor.tsx unchanged, so the word door
 * looks exactly as it did and the connections door looks like it. The class
 * names stay `word-*` because the CSS is the CSS; a rename would be a diff
 * with no reader-visible change.
 *
 * `Fold` is the one quiet control between a door's glance and the rest of it
 * (rule 4): the same words on every door, never an action.
 *
 * Close plays the mirror of the open (scrim fades, sheet slides/fades away)
 * before telling the caller to unmount — the same own-the-exit shape as
 * MobileSelectionBar, self-contained here so every door gets it for free.
 * Matches --dur-3 in motion.css/main.css.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const EXIT_MS = 260

export function DeepDiveSheet({
  reference,
  label,
  onClose,
  onBack,
  children
}: {
  /** The verse the door is on — the head's eyebrow. */
  reference: string
  /** The dialog's accessible name, e.g. "The words behind Genesis 15:6". */
  label: string
  onClose: () => void
  /** Present only while a door is stacked one level deeper; climbs out. */
  onBack?: () => void
  children: React.ReactNode
}): React.ReactElement {
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      onClose()
      return
    }
    setClosing(true)
    timerRef.current = window.setTimeout(onClose, EXIT_MS)
  }, [onClose])

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    []
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (onBack) onBack()
      else requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onBack, requestClose])

  return createPortal(
    <>
      <div className={`word-scrim${closing ? ' is-closing' : ''}`} onClick={requestClose} />
      <div
        className={`word-sheet${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-label={label}
        // The sheet is portaled to <body>, but React events still bubble to
        // its React ancestors — the reading surface, whose marquee selection
        // listens for pointer events. A drag on the dive-in map would draw a
        // selection box under the sheet, change the selection, and unmount
        // the entrance (and this sheet with it). So every pointer and mouse
        // event stops here, as the click already did.
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        onPointerMove={e => e.stopPropagation()}
        onPointerUp={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onMouseUp={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        <div className="word-sheet-head">
          {onBack ? (
            <button type="button" className="word-back" onClick={onBack}>
              ← Back
            </button>
          ) : (
            <span className="word-door-ref">{reference}</span>
          )}
          <button type="button" className="word-close" onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="word-sheet-body">{children}</div>
      </div>
    </>,
    document.body
  )
}

/** The fold. `open` is what it reads when expanded, `closed` when not. */
export function Fold({
  expanded,
  onToggle,
  open,
  closed
}: {
  expanded: boolean
  onToggle: () => void
  open: string
  closed: string
}): React.ReactElement {
  return (
    <button type="button" className="word-deeper" aria-expanded={expanded} onClick={onToggle}>
      {expanded ? open : closed}
    </button>
  )
}
