import React from 'react'

// The one calm suggestion, and the iOS instructions it opens into.
//
// Both are the note-hint-popover's visual language — a small surface card with
// a hairline border and quiet muted text — not a banner and not a modal.
// Nothing here blocks the app, nothing dims the screen, and "Not now" is a
// single tap that ends this for good (see utils/installNudge.ts). Copy is plain
// and unhurried, like the rest of Lantern: no exclamation marks, no "Get the
// app!", no benefit list.

interface InstallNudgeProps {
  // 'nudge' is the once-ever suggestion (Add / Not now). 'hint' is the iOS
  // Share → Add to Home Screen instruction, reachable deliberately from the
  // menu as well as from the nudge, so it gets a plain acknowledge button.
  variant: 'nudge' | 'hint'
  onAccept?: () => void
  onDismiss: () => void
}

/** iOS's share glyph, so the instruction points at something recognisable. */
const shareIcon = (
  <svg
    className="install-nudge-icon"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 16V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
  </svg>
)

export default function InstallNudge({
  variant,
  onAccept,
  onDismiss
}: InstallNudgeProps): React.ReactElement {
  if (variant === 'hint') {
    return (
      <div className="install-nudge" role="dialog" aria-label="Add Lantern to your home screen">
        <p className="install-nudge-text">
          To keep Lantern on your home screen: tap {shareIcon}
          <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
        </p>
        <div className="install-nudge-actions">
          <button className="install-nudge-btn install-nudge-btn-quiet" onClick={onDismiss}>
            Got it
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="install-nudge" role="status">
      <p className="install-nudge-text">
        You can keep Lantern on your home screen. It opens straight to your reading, without the
        browser around it.
      </p>
      <div className="install-nudge-actions">
        <button className="install-nudge-btn install-nudge-btn-quiet" onClick={onDismiss}>
          Not now
        </button>
        <button className="install-nudge-btn install-nudge-btn-accept" onClick={onAccept}>
          Add to home screen
        </button>
      </div>
    </div>
  )
}
