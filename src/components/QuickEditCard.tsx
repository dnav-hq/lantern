import React from 'react'
import { NoteCategory } from '../types'

interface QuickEditCardProps {
  // Existing note's category (edit flow) — colors the left accent and the
  // hint icon. null/undefined for a fresh quick note, which reads neutral
  // (accent) until a category is actually typed.
  category?: NoteCategory | null
  // Distinguishes copy only ("Add note" vs "Save changes") — same UI either
  // way, per the "editing an existing quick note vs. starting a fresh one"
  // distinction being about framing, not a different component.
  mode: 'create' | 'edit'
  saveDisabled?: boolean
  onSave: () => void
  onCancel: () => void
  children: React.ReactNode
  // When set, this is the EPHEMERAL guest preview of the SAME card: identical
  // chrome, but nothing persists — the primary action becomes the one "sign in
  // to keep it" invite, with an ambient notice. Keeps guest on the base
  // component instead of a divergent copy.
  guest?: { onSignIn: () => void }
}

// The shared chrome around both quick-note flows — creating a brand new
// verse-anchored note (BookDetailPage/ReadingMode's "Quick note" action) and
// editing an existing one (the pencil action on a note card). Previously each
// was its own bare textarea with text-link buttons; this wraps whichever
// input the caller passes (InlineTagInput for create, RichEditInput for
// edit — their tag/pill parsing is unrelated and untouched) in one clearly
// bordered, elevated card with real labeled buttons.
export default function QuickEditCard({
  category,
  mode,
  saveDisabled,
  onSave,
  onCancel,
  children,
  guest
}: QuickEditCardProps): React.ReactElement {
  return (
    <div className={`quick-edit-card cat-${category || 'none'}`}>
      {guest && (
        <div className="quick-edit-notice" role="status">
          You&apos;re trying this out. Nothing you write here is saved.
        </div>
      )}
      <div className="quick-edit-body">{children}</div>
      <div className="quick-edit-footer">
        <span className="quick-edit-hint">
          <kbd>@</kbd> category · <kbd>v4</kbd> verse · <kbd>esc</kbd> cancel
        </span>
        <div className="quick-edit-actions">
          <button type="button" className="quick-edit-btn quick-edit-btn-cancel" onClick={onCancel}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Cancel
          </button>
          {guest ? (
            // A guest can't save — the honest primary is the one invite.
            <button
              type="button"
              className="quick-edit-btn quick-edit-btn-save"
              onClick={guest.onSignIn}
            >
              Sign in to keep it
            </button>
          ) : (
            <button
              type="button"
              className="quick-edit-btn quick-edit-btn-save"
              onClick={onSave}
              disabled={saveDisabled}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {mode === 'create' ? 'Save note' : 'Save changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
