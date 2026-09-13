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
 */
import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (onBack) onBack()
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, onBack])

  return createPortal(
    <>
      <div className="word-scrim" onClick={onClose} />
      <div
        className="word-sheet"
        role="dialog"
        aria-label={label}
        onClick={e => e.stopPropagation()}
      >
        <div className="word-sheet-head">
          {onBack ? (
            <button type="button" className="word-back" onClick={onBack}>
              ← Back
            </button>
          ) : (
            <span className="word-door-ref">{reference}</span>
          )}
          <button type="button" className="word-close" onClick={onClose} aria-label="Close">
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
