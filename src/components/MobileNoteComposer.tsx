import React, { useEffect, useRef, useState } from 'react'
import { NoteCategory } from '../types'
import { autoGrow, useKeyboardCompose } from '../utils/useKeyboardCompose'

const CATEGORIES: Array<[NoteCategory, string]> = [
  ['observation', 'Observation'],
  ['historical', 'Historical'],
  ['application', 'Application'],
  ['personal', 'Personal']
]

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  observation: 'Observation',
  historical: 'Historical',
  application: 'Application',
  personal: 'Personal'
}

interface MobileNoteComposerProps {
  // Full human reference for the verses being noted, e.g. "John 15:9–10".
  referenceLabel: string
  // Prose only — the anchor and category are metadata, not part of the text.
  initialText?: string
  initialCategory?: NoteCategory | null
  mode: 'create' | 'edit'
  saving?: boolean
  onSave: (text: string, category: NoteCategory | null) => void
  onCancel: () => void
  // Edit mode only. Confirmed inside the composer before it fires.
  onDelete?: () => void
  // Viewport y (px) where usable space starts — the bottom of the sticky
  // reading chrome. The composer centres itself between this and the keyboard.
  headerBottom?: number
}

// The phone capture surface: one composer for both "note these verses" and
// "edit this note", opened from the selection bar in the reading view.
//
// Ported from design/mobile-note-capture.html. The feel is the point:
//   - it appears in the SAME place every time (centred in the band above the
//     keyboard), because a composer that lands wherever the verse happened to be
//     makes writing feel like chasing the field
//   - it never flashes at the wrong spot — see useKeyboardCompose for the
//     hidden-snap-focus-breathe sequence and why each step is needed
//   - category is ONE optional choice that colour-brands the note's rail; no
//     category is a legitimate, unlabelled state (never the string "null")
export default function MobileNoteComposer({
  referenceLabel,
  initialText = '',
  initialCategory = null,
  mode,
  saving = false,
  onSave,
  onCancel,
  onDelete,
  headerBottom = 0
}: MobileNoteComposerProps): React.ReactElement {
  const [text, setText] = useState(initialText)
  const [category, setCategory] = useState<NoteCategory | null>(initialCategory)
  const [menuOpen, setMenuOpen] = useState(false)
  // 'discard' guards an unsaved draft; 'delete' guards an existing note.
  const [confirming, setConfirming] = useState<'discard' | 'delete' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const { reveal } = useKeyboardCompose()

  // One deterministic reveal per mount — see useKeyboardCompose.reveal.
  useEffect(() => {
    const el = rootRef.current
    const field = fieldRef.current
    if (el && field) reveal(el, field, headerBottom)
    // Deliberately mount-only: re-running this mid-edit would re-snap the scroll
    // position out from under the writer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const close = (): void => setMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  const dirty = text.trim() !== initialText.trim() || category !== initialCategory

  const handleCancel = (): void => {
    // An empty/untouched draft discards cleanly; a dirty one asks first, because
    // a mis-tap on a phone is one pixel away from losing what you just wrote.
    if (dirty) setConfirming('discard')
    else onCancel()
  }

  const handleSave = (): void => {
    if (saving) return
    const value = text.trim()
    // Saving nothing is a discard, not an error state.
    if (!value) return onCancel()
    onSave(value, category)
  }

  const catAttr = category ?? 'none'

  return (
    <div className="mnc" data-c={catAttr} ref={rootRef} data-no-drag>
      <div className="mnc-head">
        <span className="mnc-ref">{referenceLabel}</span>
        {mode === 'edit' && onDelete && (
          <button type="button" className="mnc-del" onClick={() => setConfirming('delete')}>
            Delete
          </button>
        )}
        <button type="button" className="mnc-cancel" onClick={handleCancel}>
          Cancel
        </button>
      </div>

      <textarea
        ref={fieldRef}
        className="mnc-field"
        value={text}
        placeholder="Jot a thought…"
        onChange={e => {
          setText(e.target.value)
          autoGrow(e.target)
        }}
      />

      {confirming ? (
        <div className="mnc-confirm" role="alertdialog" aria-label="Confirm">
          <span className="mnc-confirm-q">
            {confirming === 'delete' ? 'Delete this note?' : 'Discard this note?'}
          </span>
          <button type="button" className="mnc-confirm-keep" onClick={() => setConfirming(null)}>
            Keep
          </button>
          <button
            type="button"
            className="mnc-confirm-go"
            onClick={() => (confirming === 'delete' ? onDelete?.() : onCancel())}
          >
            {confirming === 'delete' ? 'Delete' : 'Discard'}
          </button>
        </div>
      ) : (
        <div className="mnc-foot">
          <div className="mnc-tag">
            <button
              type="button"
              className={`mnc-tag-trigger${category ? ' has-cat' : ''}`}
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              onClick={e => {
                e.stopPropagation()
                setMenuOpen(o => !o)
              }}
            >
              <span className="mnc-dot" />
              {category ? CATEGORY_LABELS[category] : 'Add tag'}
              <span className="mnc-chev" aria-hidden="true">
                ▾
              </span>
            </button>
            {menuOpen && (
              <div className="mnc-tag-menu" role="listbox" onClick={e => e.stopPropagation()}>
                {([[null, 'No tag'] as [NoteCategory | null, string]] as Array<
                  [NoteCategory | null, string]
                >)
                  .concat(CATEGORIES)
                  .map(([c, label]) => (
                    <button
                      type="button"
                      key={c ?? 'none'}
                      className="mnc-tag-opt"
                      data-c={c ?? 'none'}
                      role="option"
                      aria-selected={category === c}
                      onClick={() => {
                        setCategory(c)
                        setMenuOpen(false)
                      }}
                    >
                      <span className="mnc-dot" />
                      {label}
                      <span className="mnc-check" aria-hidden="true">
                        ✓
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="mnc-save"
            onClick={handleSave}
            disabled={saving || !text.trim()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
