import React, { useEffect, useState } from 'react'
import { NoteCategory } from '../types'
import CategoryMenu from './CategoryMenu'
import { useNoteCategories } from '../utils/useNoteCategories'

interface QuickEditCardProps {
  // Human reference for the verses this note is anchored to ("John 15:9-10"),
  // shown in the head exactly as the mobile composer shows it.
  reference?: string
  // Existing note's category (edit flow), or the one parsed out of what has
  // been typed so far (create flow) — colours the rail and the tag pill.
  category?: NoteCategory | null
  // Distinguishes copy only ("Save note" vs "Save changes") — same UI either
  // way, per the "editing an existing quick note vs. starting a fresh one"
  // distinction being about framing, not a different component.
  mode: 'create' | 'edit'
  saveDisabled?: boolean
  onSave: () => void
  onCancel: () => void
  // Supplied where the host can write a category back into the note's text.
  // The picker is a SHORTCUT for typing "@observation", never a second model:
  // the host rewrites the token, so what you type and what you pick are the
  // same thing. Omitted (ReadingMode) simply means no pill is offered.
  onPickCategory?: (key: NoteCategory | null) => void
  children: React.ReactNode
  // When set, this is the EPHEMERAL guest preview of the SAME card: identical
  // chrome, but nothing persists — the primary action becomes the one "sign in
  // to keep it" invite, with an ambient notice. Keeps guest on the base
  // component instead of a divergent copy.
  guest?: { onSignIn: () => void }
}

// The desktop note-writing surface — creating a brand new verse-anchored note
// (BookDetailPage/ReadingMode's "Quick note" action) and editing an existing
// one (the pencil action on a note card).
//
// It wears the MOBILE COMPOSER'S design (MobileNoteComposer.tsx): the
// category-coloured rail on a tinted ground, a head carrying the reference and
// the way out, the writing itself, then a foot of tag-pill and Save. Both
// surfaces are driven by ONE set of `.composer-*` rules in main.css, so the
// two read as one product rather than two eras of one.
//
// What stays desktop is deliberately desktop: this card is INLINE in the
// reading column (never a keyboard-aware sheet — no useKeyboardCompose here),
// the writing model is free-form (whichever input the caller passes —
// InlineTagInput for create, RichEditInput for edit — with "@category" and
// "v4" parsed out of the prose by noteParser), and Escape still cancels.
export default function QuickEditCard({
  reference,
  category,
  mode,
  saveDisabled,
  onSave,
  onCancel,
  onPickCategory,
  children,
  guest
}: QuickEditCardProps): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)
  const categories = useNoteCategories()
  const label = category ? (categories.find(c => c.key === category)?.label ?? category) : 'Add tag'

  // Any click outside the pill closes it (the menu itself stops propagation).
  useEffect(() => {
    if (!menuOpen) return
    const close = (): void => setMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  const pick = (key: NoteCategory | null): void => {
    setMenuOpen(false)
    onPickCategory?.(key)
  }

  return (
    <div className="composer composer-inline" data-cat={category || 'none'}>
      <div className="composer-head">
        <span className="composer-ref">
          {reference ?? (mode === 'create' ? 'New note' : 'Editing note')}
        </span>
        <button type="button" className="composer-quiet is-alone" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {guest && (
        <div className="composer-notice" role="status">
          You&apos;re trying this out. Nothing you write here is saved.
        </div>
      )}

      <div className="composer-body">{children}</div>

      <div className="composer-foot">
        {onPickCategory && (
          <div className="composer-tag">
            <button
              type="button"
              className="composer-tag-trigger"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              data-cat={category || 'none'}
              onClick={e => {
                e.stopPropagation()
                setMenuOpen(open => !open)
              }}
            >
              <span className="composer-dot" />
              {label}
              <span className="composer-chev" aria-hidden="true">
                ▾
              </span>
            </button>
            {menuOpen && (
              // One picker implementation, so renaming a category works from
              // here too — the same menu the highlight action opens.
              <div className="composer-tag-menu" onClick={e => e.stopPropagation()}>
                <CategoryMenu
                  selected={category ?? null}
                  noneLabel="No tag"
                  onPickNone={() => pick(null)}
                  onPick={key => pick(key as NoteCategory)}
                />
              </div>
            )}
          </div>
        )}
        {/* Desktop-only: the free-form typing model is the fast path here, so
            it stays announced. */}
        <span className="composer-hint">
          <kbd>@</kbd> category · <kbd>v4</kbd> verse · <kbd>esc</kbd> cancel
        </span>
        {guest ? (
          // A guest can't save — the honest primary is the one invite.
          <button type="button" className="composer-save" onClick={guest.onSignIn}>
            Sign in to keep it
          </button>
        ) : (
          <button type="button" className="composer-save" onClick={onSave} disabled={saveDisabled}>
            {mode === 'create' ? 'Save note' : 'Save changes'}
          </button>
        )}
      </div>
    </div>
  )
}
