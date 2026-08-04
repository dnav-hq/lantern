import React from 'react'
import TranslationChip from './TranslationChip'

interface ReadingControlsProps {
  focusReading: boolean
  onToggleFocusReading: () => void
}

// The two reading-context controls — the translation indicator and the Focus
// toggle — live in the reading surface's own header, not the global top bar,
// because they only mean anything while reading a passage. Kept deliberately
// quiet: a subtle translation label and an icon-only Focus, sitting with the
// text rather than competing for the global chrome (which stays wordmark +
// workspace + search).
export default function ReadingControls({
  focusReading,
  onToggleFocusReading
}: ReadingControlsProps): React.ReactElement {
  return (
    <div className="reading-controls">
      <TranslationChip />
      <button
        type="button"
        className={`reading-focus-btn${focusReading ? ' active' : ''}`}
        onClick={onToggleFocusReading}
        aria-pressed={focusReading}
        title={
          focusReading
            ? 'Leave distraction-free reading'
            : 'Distraction-free reading — hides your notes and widens the text'
        }
      >
        {/* Corner-frame glyph: points outward at rest ("give scripture the
            screen"), inward when active ("you are in the mode; tap to leave").
            The swap plus the notes animating back is what carries the state
            now that the text label is gone. */}
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
    </div>
  )
}
