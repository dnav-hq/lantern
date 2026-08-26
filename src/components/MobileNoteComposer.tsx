import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NoteCategory } from '../types'
import { useKeyboardCompose } from '../utils/useKeyboardCompose'

// The mobile note composer: the calm space that eases up when you tap "Note"
// on a verse selection. Ported from design/mobile-note-capture.html — see
// useKeyboardCompose for why the open sequence is shaped the way it is.
//
// Deliberately NOT a modal. It grows in the reading flow, right under the
// verses it is about, so writing a note never costs you your place.

const CATEGORY_OPTIONS: { value: NoteCategory; label: string }[] = [
  { value: 'observation', label: 'Observation' },
  { value: 'historical', label: 'Historical' },
  { value: 'application', label: 'Application' },
  { value: 'personal', label: 'Personal' }
]

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  observation: 'Observation',
  historical: 'Historical',
  application: 'Application',
  personal: 'Personal'
}

// The sticky reading chrome the composer must never ride up underneath.
const HEADER_SELECTOR = '.book-detail-chrome'

interface MobileNoteComposerProps {
  // Human reference for the verses this note is anchored to ("John 15:9-10").
  reference: string
  mode: 'create' | 'edit'
  initialText?: string
  initialCategory?: NoteCategory | null
  saving?: boolean
  onSave: (text: string, category: NoteCategory | null) => void
  onCancel: () => void
  // Only supplied in edit mode — a saved note can be deleted from here.
  onDelete?: () => void
}

export default function MobileNoteComposer({
  reference,
  mode,
  initialText = '',
  initialCategory = null,
  saving = false,
  onSave,
  onCancel,
  onDelete
}: MobileNoteComposerProps): React.ReactElement {
  const [text, setText] = useState(initialText)
  const [category, setCategory] = useState<NoteCategory | null>(initialCategory)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState<'discard' | 'delete' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const { reveal } = useKeyboardCompose(HEADER_SELECTOR)

  const dirty = text.trim() !== initialText.trim() || category !== initialCategory

  // One deterministic open: position, focus, breathe in. Layout effect so it
  // runs before the browser has painted the composer anywhere.
  useLayoutEffect(() => {
    const root = rootRef.current
    const field = fieldRef.current
    if (root && field) reveal(root, field)
    // Intentionally once per mount — re-running would re-scroll mid-write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Grow the textarea to its content: a note is prose, never an inner scrollbar.
  const autoGrow = useCallback(() => {
    const field = fieldRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
  }, [])

  // Any tap outside the tag menu closes it (the menu itself stops propagation).
  useEffect(() => {
    if (!menuOpen) return
    const close = (): void => setMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  const handleCancel = (): void => {
    // An empty draft is not worth a question — it just goes away. A draft with
    // words in it is; losing a written thought silently is the one thing this
    // surface must never do.
    if (dirty && text.trim()) setConfirming('discard')
    else onCancel()
  }

  const handleSave = (): void => {
    if (saving) return
    const value = text.trim()
    // Saving nothing is the same as cancelling — no empty note is ever created.
    if (!value) {
      onCancel()
      return
    }
    onSave(value, category)
  }

  return (
    <div className="mobile-composer" data-cat={category || 'none'} ref={rootRef}>
      {confirming && (
        // Rendered INSIDE the composer (never in place of it) so the draft, the
        // grown textarea and the reveal's resting position all survive a
        // "keep writing" — a confirmation must not itself cost you the note.
        <div className="mobile-composer-confirm" role="alertdialog">
          <span className="mobile-composer-confirm-message">
            {confirming === 'delete'
              ? "Delete this note? This can't be undone."
              : 'Discard this note?'}
          </span>
          <div className="mobile-composer-confirm-actions">
            <button
              type="button"
              className="mobile-composer-quiet"
              onClick={() => {
                setConfirming(null)
                fieldRef.current?.focus({ preventScroll: true })
              }}
            >
              Keep writing
            </button>
            <button
              type="button"
              className="mobile-composer-danger-btn"
              onClick={() => {
                if (confirming === 'delete') onDelete?.()
                else onCancel()
              }}
            >
              {confirming === 'delete' ? 'Delete' : 'Discard'}
            </button>
          </div>
        </div>
      )}
      <div className="mobile-composer-head">
        <span className="mobile-composer-ref">{reference}</span>
        {mode === 'edit' && onDelete && (
          <button
            type="button"
            className="mobile-composer-danger"
            onClick={() => setConfirming('delete')}
          >
            Delete
          </button>
        )}
        <button
          type="button"
          className={`mobile-composer-quiet${mode === 'edit' ? '' : ' is-alone'}`}
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>

      <textarea
        ref={fieldRef}
        className="mobile-composer-field"
        placeholder="Jot a thought…"
        value={text}
        onChange={e => {
          setText(e.target.value)
          autoGrow()
        }}
        aria-label={`Note on ${reference}`}
      />

      <div className="mobile-composer-foot">
        <div className="mobile-composer-tag">
          <button
            type="button"
            className="mobile-composer-tag-trigger"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            data-cat={category || 'none'}
            onClick={e => {
              e.stopPropagation()
              setMenuOpen(open => !open)
            }}
          >
            <span className="mobile-composer-dot" />
            {category ? CATEGORY_LABELS[category] : 'Add tag'}
            <span className="mobile-composer-chev" aria-hidden="true">
              ▾
            </span>
          </button>
          {menuOpen && (
            <div
              className="mobile-composer-tag-menu"
              role="listbox"
              onClick={e => e.stopPropagation()}
            >
              {[{ value: null, label: 'No tag' }, ...CATEGORY_OPTIONS].map(opt => (
                <button
                  key={opt.value ?? 'none'}
                  type="button"
                  role="option"
                  className="mobile-composer-tag-opt"
                  data-cat={opt.value ?? 'none'}
                  aria-selected={category === opt.value}
                  onClick={() => {
                    setCategory(opt.value)
                    setMenuOpen(false)
                  }}
                >
                  <span className="mobile-composer-dot" />
                  {opt.label}
                  <span className="mobile-composer-check" aria-hidden="true">
                    ✓
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="mobile-composer-save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
