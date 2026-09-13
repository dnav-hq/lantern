/**
 * The shell every deep-dive door wears.
 *
 * Extracted from `WordDoor.tsx` when the connections door arrived, rather than
 * copied: the sheet, the scrim, the close and the ONE fold are the deep dive's
 * furniture, not any one door's, and `docs/proposals/deep-dive-doorways.md`
 * rule 4 is that the quiet fold reads "in the same words on every door". Two
 * copies of this drift, and the drift is visible to the reader.
 *
 * Deliberately NOT in here: anything about a door's content, its data, or how
 * many rows it shows. A door hands this its body and its heading, and gets back
 * a bottom sheet on a phone, a centred panel on a desktop, Escape to close, and
 * a scrim that closes on tap.
 */
import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function DeepDiveSheet({
  reference,
  ariaLabel,
  onClose,
  children
}: {
  /** The eyebrow — the verse the reader is standing on. */
  reference: React.ReactNode
  ariaLabel: string
  onClose: () => void
  children: React.ReactNode
}): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <>
      <div className="word-scrim" onClick={onClose} />
      <div
        className="word-sheet"
        role="dialog"
        aria-label={ariaLabel}
        onClick={e => e.stopPropagation()}
      >
        <div className="word-sheet-head">
          <span className="word-door-ref">{reference}</span>
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

/**
 * The single quiet control between a door's glance and everything else. One
 * per door, never two — the moment a door needs a second fold it has stopped
 * answering one question.
 */
export function DeepDiveFold({
  open,
  onToggle,
  children
}: {
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button type="button" className="word-deeper" aria-expanded={open} onClick={onToggle}>
      {children}
    </button>
  )
}
