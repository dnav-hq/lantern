import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../api/context'
import type { NoteCategoryDef } from '../types'
import { CATEGORY_PALETTE, changedFromDefaults } from '../utils/noteCategories'
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
 * COLOUR works the same way and sits beside Rename: hidden at rest, revealed on
 * hover or keyboard focus, and opening it swaps the row for a single line of ten
 * swatches. There is no hex field and there will not be one — the contrast rule
 * (docs/proposals/custom-categories.md §5.2) cannot be satisfied with a colour
 * wheel, and a picker that silently produces unreadable text in dark is worse
 * than no picker. What is stored is the SLOT ID, never a colour.
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
  const [coloringKey, setColoringKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingKey) inputRef.current?.select()
  }, [editingKey])

  const beginRename = useCallback((cat: NoteCategoryDef) => {
    setColoringKey(null)
    setEditingKey(cat.key)
    setDraft(cat.label)
  }, [])

  /**
   * Save one category's changes. Same path the rename already uses and for the
   * same reason: publish FIRST so every surface repaints at once with no
   * reload, then write through, and leave the local value in place on failure —
   * the next read reconciles, and a toast here would interrupt a capture.
   */
  const save = useCallback(
    async (next: NoteCategoryDef[]) => {
      const stored = changedFromDefaults(next)
      publishNoteCategories(stored)
      try {
        await api.saveNoteCategories(stored)
      } catch {
        // Left in place; see above.
      }
    },
    [api]
  )

  const pickColor = useCallback(
    (key: string, slotId: string) => {
      setColoringKey(null)
      void save(categories.map(c => (c.key === key ? { ...c, color: slotId } : c)))
    },
    [categories, save]
  )

  const commit = useCallback(async () => {
    if (!editingKey) return
    const label = draft.trim()
    setEditingKey(null)
    // An empty name is a cancel, not a way to erase a category's name.
    if (!label) return
    await save(categories.map(c => (c.key === editingKey ? { ...c, label } : c)))
  }, [categories, draft, editingKey, save])

  return (
    <div
      className="cat-menu"
      role="menu"
      onKeyDown={e => {
        if (e.key === 'Escape' && coloringKey) {
          e.preventDefault()
          e.stopPropagation()
          setColoringKey(null)
        }
      }}
    >
      {title && <div className="cat-menu-title">{title}</div>}

      {noneLabel && onPickNone && (
        <button className="cat-menu-row" role="menuitem" onClick={onPickNone}>
          <span className="cat-menu-dot cat-menu-dot-none" aria-hidden="true" />
          <span className="cat-menu-label">{noneLabel}</span>
          {selected === null && <span className="cat-menu-check">✓</span>}
        </button>
      )}

      {categories.map(cat =>
        coloringKey === cat.key ? (
          <div className="cat-menu-row is-picking" key={cat.key}>
            <div
              className="cat-menu-colors"
              role="radiogroup"
              aria-label={`Colour for ${cat.label}`}
            >
              {CATEGORY_PALETTE.map(slot => (
                <button
                  key={slot.id}
                  type="button"
                  role="radio"
                  aria-checked={cat.color === slot.id}
                  aria-label={slot.label}
                  title={slot.label}
                  className={`cat-swatch${cat.color === slot.id ? ' is-current' : ''}`}
                  // The swatch shows the slot's FIELD value for the theme in
                  // force, so what you see in the row is what you will get.
                  style={{ background: `var(--slot-${slot.id})` }}
                  onClick={e => {
                    e.stopPropagation()
                    pickColor(cat.key, slot.id)
                  }}
                />
              ))}
            </div>
          </div>
        ) : editingKey === cat.key ? (
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
            <span
              className="cat-menu-rename"
              role="button"
              tabIndex={0}
              aria-label={`Colour ${cat.label}`}
              onClick={e => {
                e.stopPropagation()
                setEditingKey(null)
                setColoringKey(cat.key)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  setEditingKey(null)
                  setColoringKey(cat.key)
                }
              }}
            >
              Colour
            </span>
          </button>
        )
      )}

      {editingKey && <div className="cat-menu-foot">Enter to save · Esc to cancel</div>}
      {coloringKey && <div className="cat-menu-foot">Pick a colour · Esc to cancel</div>}
    </div>
  )
}
