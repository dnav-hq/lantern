import React from 'react'

interface ReadingControlsProps {
  // Reading Mode — an environment toggle that recedes/restructures the chrome
  // so scripture owns the screen. Chrome only; it does NOT hide notes.
  focusReading?: boolean
  onToggleFocusReading?: () => void
  // Hide notes — a content filter (show/hide your own notes), independent of
  // Reading Mode and backed by the same persisted preference Settings uses.
  hideNotes?: boolean
  onToggleHideNotes?: () => void
}

// The two reading-context TOGGLES, grouped as one quiet, muted cluster: an eye
// that shows/hides your notes, and Reading Mode that clears the chrome away.
// The translation indicator is deliberately NOT here — it lives in the quiet
// footer at the foot of the reading surface (see TranslationFooter), because it
// is something you glance at once or twice, not an action you take. Keeping it
// out of this cluster is what stops the header reading as a busy toolbar.
export default function ReadingControls({
  focusReading,
  onToggleFocusReading,
  hideNotes,
  onToggleHideNotes
}: ReadingControlsProps): React.ReactElement {
  const showReadingMode = onToggleFocusReading !== undefined
  const showHideNotes = onToggleHideNotes !== undefined
  return (
    <div className="reading-controls">
      {showHideNotes && (
        <button
          type="button"
          className={`reading-ctl-btn${hideNotes ? ' active' : ''}`}
          onClick={onToggleHideNotes}
          aria-pressed={hideNotes}
          title={hideNotes ? 'Show your notes' : 'Hide your notes and read only scripture'}
        >
          {/* Eye / eye-off: the plain, universal "show / hide" glyph — reads as
              "hide my notes" far more directly than an abstract mark. */}
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {hideNotes ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      )}
      {showReadingMode && (
        <button
          type="button"
          className={`reading-ctl-btn${focusReading ? ' active' : ''}`}
          onClick={onToggleFocusReading}
          aria-pressed={focusReading}
          title={
            focusReading
              ? 'Leave reading mode'
              : 'Reading mode. Clears the menus away so scripture fills the screen.'
          }
        >
          {/* Corner-frame glyph: points outward at rest ("give scripture the
              screen"), inward when active ("you are in the mode; tap to leave").
              This is the environment toggle, not a notes control. */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {focusReading ? (
              <>
                <polyline points="9 3 9 9 3 9" />
                <polyline points="15 3 15 9 21 9" />
                <polyline points="9 21 9 15 3 15" />
                <polyline points="15 21 15 15 21 15" />
              </>
            ) : (
              <>
                <polyline points="4 9 4 4 9 4" />
                <polyline points="20 9 20 4 15 4" />
                <polyline points="4 15 4 20 9 20" />
                <polyline points="20 15 20 20 15 20" />
              </>
            )}
          </svg>
        </button>
      )}
    </div>
  )
}
