import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../api/context'
import type { NoteCategoryDef } from '../types'
import { changedFromDefaults } from '../utils/noteCategories'
import { publishNoteCategories, useNoteCategories } from '../utils/useNoteCategories'

/**
 * The category picker, and the only place a category is renamed.
 *
 * NAMING HAPPENS WHERE THE NAME IS USED, not in Settings. That is how Notion,
 * Linear and Todoist handle editable select options, and the reason it works is
 * that NOTHING IS VISIBLE UNTIL YOU ENGAGE: the menu looks like a plain picker,
 * and the rename affordance appears only on hover (or long-press on touch). A
 * reader who never wants to rename anything never meets the control.
 *
 * Keyboard: Enter commits, Escape cancels. Committing writes through to the
 * shared store so every other surface updates at once.
 */
export interface CategoryMenuProps {
  /** Called with the chosen category key. */
  onPick: (key: string) => void
  /** Rendered above the rows, e.g. "Highlight as…". */
  title?: string
  /** Currently applied key, if this menu is showing a selection. */
  selected?: string | null
  /** Offered before the categories, for a note with no category. */
  noneLabel?: string
  onPickNone?: () => void
}

export default function CategoryMenu({
  onPick,
  title,
  selected = null,
  noneLabel,
  onPickNone
}: CategoryMenuProps): React.ReactElement {
  const api = useApi()
  const categories = useNoteCategories()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingKey) inputRef.current?.select()
  }, [editingKey])

  const beginRename = useCallback((cat: NoteCategoryDef) => {
    setEditingKey(cat.key)
    setDraft(cat.label)
  }, [])

  const commit = useCallback(async () => {
    if (!editingKey) return
    const label = draft.trim()
    setEditingKey(null)
    // An empty name is a cancel, not a way to erase a category's name.
    if (!label) return
    const next = categories.map(c => (c.key === editingKey ? { ...c, label } : c))
    const stored = changedFromDefaults(next)
    // Publish first so the rename lands instantly everywhere; a failed write is
    // corrected on the next load rather than by making the reader wait.
    publishNoteCategories(stored)
    try {
      await api.saveNoteCategories(stored)
    } catch {
      // Left in place: the name is still correct locally, and the next read
      // will reconcile. Surfacing a toast here would interrupt a capture.
    }
  }, [api, categories, draft, editingKey])

  return (
    <div className="cat-menu" role="menu">
      {title && <div className="cat-menu-title">{title}</div>}

      {noneLabel && onPickNone && (
        <button className="cat-menu-row" role="menuitem" onClick={onPickNone}>
          <span className="cat-menu-dot cat-menu-dot-none" aria-hidden="true" />
          <span className="cat-menu-label">{noneLabel}</span>
          {selected === null && <span className="cat-menu-check">✓</span>}
        </button>
      )}

      {categories.map(cat =>
        editingKey === cat.key ? (
          <div className="cat-menu-row is-editing" key={cat.key}>
            <span className={`cat-menu-dot cat-${cat.key}`} aria-hidden="true" />
            <input
              ref={inputRef}
              className="cat-menu-input"
              value={draft}
              maxLength={24}
              aria-label={`Rename ${cat.label}`}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => void commit()}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void commit()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setEditingKey(null)
                }
              }}
            />
          </div>
        ) : (
          <button
            className="cat-menu-row"
            role="menuitem"
            key={cat.key}
            onClick={() => onPick(cat.key)}
          >
            <span className={`cat-menu-dot cat-${cat.key}`} aria-hidden="true" />
            <span className="cat-menu-label">{cat.label}</span>
            {selected === cat.key && <span className="cat-menu-check">✓</span>}
            {/* Hidden until hover/focus. A reader who never renames anything
                never meets this control. */}
            <span
              className="cat-menu-rename"
              role="button"
              tabIndex={0}
              aria-label={`Rename ${cat.label}`}
              onClick={e => {
                e.stopPropagation()
                beginRename(cat)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  beginRename(cat)
                }
              }}
            >
              Rename
            </span>
          </button>
        )
      )}

      {editingKey && <div className="cat-menu-foot">Enter to save · Esc to cancel</div>}
    </div>
  )
}
