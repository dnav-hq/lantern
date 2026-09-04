import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../api/context'
import type { StoredCategoryDef } from '../utils/noteCategories'
import {
  archiveCategory,
  archivedCategories,
  BUILT_IN_KEYS,
  CATEGORY_PALETTE,
  MAX_ACTIVE_CATEGORIES,
  changedFromDefaults,
  deleteCategory,
  planCategoryCreate,
  restoreCategory
} from '../utils/noteCategories'
import { publishNoteCategories, useNoteCategories } from '../utils/useNoteCategories'

/**
 * The category picker, and the only place a category is made, named or retired.
 *
 * NAMING HAPPENS WHERE THE NAME IS USED, not in Settings. That is how Notion,
 * Linear and Todoist handle editable select options, and the reason it works is
 * that NOTHING IS VISIBLE UNTIL YOU ENGAGE: the menu looks like a plain picker,
 * and every affordance beyond picking appears only on hover (or long-press on
 * touch). A reader who never wants to manage categories never meets the control.
 *
 * Everything past picking now lives behind ONE `⋯` button per row, opening a
 * small submenu — Rename, Colour, and Retire (or Delete). Three hover words on
 * a row is a toolbar, not a quiet affordance, which is why the brief asks for
 * the `⋯` (docs/proposals/custom-categories.md §4).
 *
 * COLOUR is a slot, never a hex. There is no hex field and there will not be
 * one — the contrast rule (§5.2) cannot be satisfied with a colour wheel, and a
 * picker that silently produces unreadable text in dark is worse than no picker.
 *
 * RETIRING IS NOT DELETING (§2). It writes one timestamp on the DEFINITION and
 * touches no note: the key stays on the note, the `@tag` stays in its content,
 * the colour keeps rendering. The category simply stops being offered, moves
 * under a "Retired" divider, and can be restored — with the same key, so every
 * note that was filed under it resolves again. A category with zero notes has
 * nothing to protect and is deleted outright; a BUILT-IN is never deleted,
 * because its key is what every note written before this feature resolves
 * through.
 *
 * Keyboard: Enter commits, Escape backs out one layer at a time. Committing
 * writes through to the shared store so every other surface updates at once.
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
  const retired = archivedCategories()
  // Active + retired. Memoised on the two lists it is built from so the
  // callbacks below keep a stable identity across renders.
  const all = useMemo(() => [...categories, ...retired], [categories, retired])

  const [openKey, setOpenKey] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [coloringKey, setColoringKey] = useState<string | null>(null)
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [offerRestore, setOfferRestore] = useState<StoredCategoryDef | null>(null)
  /** null until counted; see loadCounts — a FAILED count must not read as zero. */
  const [counts, setCounts] = useState<Record<string, number> | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const newRef = useRef<HTMLInputElement>(null)
  const rows = useRef(new Map<string, HTMLButtonElement>())

  const atCap = categories.length >= MAX_ACTIVE_CATEGORIES

  useEffect(() => {
    if (editingKey) inputRef.current?.select()
  }, [editingKey])

  useEffect(() => {
    if (creating) newRef.current?.focus()
  }, [creating])

  /**
   * How many notes each category holds, fetched once and only when a `⋯` is
   * opened — a whole-workspace read is not worth paying for to render a picker.
   *
   * A FAILED read leaves this null on purpose, which means "unknown", which
   * means only Retire is offered. Treating a failure as "zero notes" would
   * offer to delete a category holding a season's work.
   */
  const loadCounts = useCallback(() => {
    if (counts) return
    void api
      .getAllNotes()
      .then(notes => {
        const tally: Record<string, number> = {}
        for (const note of notes) {
          if (note.category) tally[note.category] = (tally[note.category] ?? 0) + 1
        }
        setCounts(tally)
      })
      .catch(() => {
        // Left unknown; see above.
      })
  }, [api, counts])

  const closeAll = useCallback(() => {
    setOpenKey(null)
    setEditingKey(null)
    setColoringKey(null)
    setConfirmKey(null)
    setCreating(false)
    setNewLabel('')
    setNotice(null)
    setOfferRestore(null)
  }, [])

  /**
   * Save one change. Same path the rename already used and for the same reason:
   * publish FIRST so every surface repaints at once with no reload, then write
   * through, and leave the local value in place on failure — the next read
   * reconciles, and a toast here would interrupt a capture.
   *
   * `next` is the FULL set, retired rows included, because what gets stored is
   * derived from it wholesale.
   */
  const save = useCallback(
    async (next: StoredCategoryDef[]) => {
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

  const beginRename = useCallback((cat: StoredCategoryDef) => {
    setOpenKey(null)
    setColoringKey(null)
    setEditingKey(cat.key)
    setDraft(cat.label)
  }, [])

  const pickColor = useCallback(
    (key: string, slotId: string) => {
      setColoringKey(null)
      void save(all.map(c => (c.key === key ? { ...c, color: slotId } : c)))
    },
    [all, save]
  )

  const commitRename = useCallback(async () => {
    if (!editingKey) return
    const label = draft.trim()
    setEditingKey(null)
    // An empty name is a cancel, not a way to erase a category's name.
    if (!label) return
    await save(all.map(c => (c.key === editingKey ? { ...c, label } : c)))
  }, [all, draft, editingKey, save])

  const commitCreate = useCallback(async () => {
    const plan = planCategoryCreate(all, newLabel)
    if (plan.kind === 'invalid') {
      setNotice(plan.reason)
      return
    }
    if (plan.kind === 'full') {
      setNotice(`${MAX_ACTIVE_CATEGORIES} of ${MAX_ACTIVE_CATEGORIES} — retire one first.`)
      return
    }
    if (plan.kind === 'exists') {
      // Focus what already exists rather than making a second one. The key is
      // half the primary key, so a duplicate is not even storable.
      closeAll()
      rows.current.get(plan.key)?.focus()
      return
    }
    if (plan.kind === 'restore') {
      // Creating "Typology" after retiring "Typology" derives the SAME key.
      // Silently creating it would revive every old note under a new
      // definition without saying so, so offer the restore instead (§2).
      setNotice(null)
      setOfferRestore(all.find(c => c.key === plan.key) ?? null)
      return
    }
    closeAll()
    await save([...all, plan.def])
  }, [all, closeAll, newLabel, save])

  const restore = useCallback(
    async (key: string) => {
      if (atCap) {
        setNotice(`${MAX_ACTIVE_CATEGORIES} of ${MAX_ACTIVE_CATEGORIES} — retire one first.`)
        return
      }
      closeAll()
      await save(restoreCategory(all, key))
    },
    [all, atCap, closeAll, save]
  )

  const confirmed = all.find(c => c.key === confirmKey)
  const noteCount = confirmKey && counts ? (counts[confirmKey] ?? 0) : null
  /** Deletion is only ever offered for a custom category we KNOW is empty. */
  const canDelete = (key: string): boolean =>
    !BUILT_IN_KEYS.includes(key) && counts !== null && (counts[key] ?? 0) === 0

  return (
    <div
      className="cat-menu"
      role="menu"
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        if (confirmKey || coloringKey || openKey || creating || offerRestore) {
          e.preventDefault()
          e.stopPropagation()
          closeAll()
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
              onBlur={() => void commitRename()}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void commitRename()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setEditingKey(null)
                }
              }}
            />
          </div>
        ) : (
          <React.Fragment key={cat.key}>
            <button
              className="cat-menu-row"
              role="menuitem"
              ref={el => {
                if (el) rows.current.set(cat.key, el)
                else rows.current.delete(cat.key)
              }}
              onClick={() => onPick(cat.key)}
            >
              <span className={`cat-menu-dot cat-${cat.key}`} aria-hidden="true" />
              <span className="cat-menu-label">{cat.label}</span>
              {selected === cat.key && <span className="cat-menu-check">✓</span>}
              {/* Hidden until hover/focus. A reader who only ever picks a
                  category never meets this control. */}
              <span
                className={`cat-menu-more${openKey === cat.key ? ' is-open' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Manage ${cat.label}`}
                aria-expanded={openKey === cat.key}
                onClick={e => {
                  e.stopPropagation()
                  setColoringKey(null)
                  setEditingKey(null)
                  setConfirmKey(null)
                  setOpenKey(openKey === cat.key ? null : cat.key)
                  loadCounts()
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setColoringKey(null)
                    setEditingKey(null)
                    setConfirmKey(null)
                    setOpenKey(openKey === cat.key ? null : cat.key)
                    loadCounts()
                  }
                }}
              >
                ⋯
              </span>
            </button>

            {openKey === cat.key && confirmKey !== cat.key && (
              <div className="cat-menu-sub" role="group" aria-label={`Manage ${cat.label}`}>
                <button className="cat-menu-sub-action" onClick={() => beginRename(cat)}>
                  Rename
                </button>
                <button
                  className="cat-menu-sub-action"
                  onClick={() => {
                    setOpenKey(null)
                    setColoringKey(cat.key)
                  }}
                >
                  Colour
                </button>
                <button className="cat-menu-sub-action" onClick={() => setConfirmKey(cat.key)}>
                  {canDelete(cat.key) ? 'Delete' : 'Retire'}
                </button>
              </div>
            )}
          </React.Fragment>
        )
      )}

      {/* ── Retired ──────────────────────────────────────────────────────────
          Only here when there is something in it. Restore returns the same
          key, so notes filed under it resolve again untouched. */}
      {retired.length > 0 && (
        <>
          <div className="cat-menu-divider">Retired</div>
          {retired.map(cat => (
            <div className="cat-menu-row is-retired" key={cat.key}>
              <span className={`cat-menu-dot cat-${cat.key}`} aria-hidden="true" />
              <span className="cat-menu-label">{cat.label}</span>
              <button
                className="cat-menu-sub-action"
                disabled={atCap}
                title={
                  atCap
                    ? `${MAX_ACTIVE_CATEGORIES} of ${MAX_ACTIVE_CATEGORIES} — retire one first`
                    : undefined
                }
                onClick={() => void restore(cat.key)}
              >
                Restore
              </button>
            </div>
          ))}
        </>
      )}

      {/* ── Create, at the bottom ────────────────────────────────────────────
          Out of the reading path, so it is impossible to hit by accident while
          picking a category to file a note under. At the cap it stays VISIBLE
          and says why: a control that vanishes reads as a bug and generates the
          support question the cap was supposed to avoid (§6). */}
      {creating ? (
        <div className="cat-menu-row is-editing">
          <span className="cat-menu-dot cat-menu-dot-new" aria-hidden="true" />
          <input
            ref={newRef}
            className="cat-menu-input"
            value={newLabel}
            maxLength={24}
            placeholder="Name it"
            aria-label="Name a new category"
            onChange={e => {
              setNewLabel(e.target.value)
              setNotice(null)
              setOfferRestore(null)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void commitCreate()
              }
            }}
          />
        </div>
      ) : (
        <button
          className="cat-menu-row cat-menu-create"
          disabled={atCap}
          onClick={() => {
            closeAll()
            setCreating(true)
          }}
        >
          <span className="cat-menu-plus" aria-hidden="true">
            +
          </span>
          <span className="cat-menu-label">
            {atCap
              ? `${MAX_ACTIVE_CATEGORIES} of ${MAX_ACTIVE_CATEGORIES} — retire one first`
              : 'Create'}
          </span>
        </button>
      )}

      {creating && !offerRestore && (
        <button className="cat-menu-row cat-menu-create" onClick={() => void commitCreate()}>
          <span className="cat-menu-plus" aria-hidden="true">
            +
          </span>
          <span className="cat-menu-label">
            {newLabel.trim() ? `Create “${newLabel.trim()}”` : 'Create'}
          </span>
        </button>
      )}

      {offerRestore && (
        <div className="cat-menu-confirm">
          <p>“{offerRestore.label}” is retired. Restore it rather than start again?</p>
          <div className="cat-menu-confirm-actions">
            <button
              className="cat-menu-sub-action is-strong"
              onClick={() => void restore(offerRestore.key)}
            >
              Restore
            </button>
            <button className="cat-menu-sub-action" onClick={closeAll}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Two forms, and it says the count — retiring keeps everything, deleting
          is only offered when there is nothing to keep (§2). */}
      {confirmed && (
        <div className="cat-menu-confirm">
          <p>
            {canDelete(confirmed.key)
              ? `Delete “${confirmed.label}”? Nothing is filed under it.`
              : noteCount === null
                ? `Retire “${confirmed.label}”? Notes already filed under it keep their name and colour — you just won't be able to file new ones here.`
                : `Retire “${confirmed.label}”? ${noteCount} ${noteCount === 1 ? 'note keeps' : 'notes keep'} their name and colour — you just won't be able to file new ones here.`}
          </p>
          <div className="cat-menu-confirm-actions">
            <button
              className="cat-menu-sub-action is-strong"
              onClick={() => {
                const key = confirmed.key
                const next = canDelete(key) ? deleteCategory(all, key) : archiveCategory(all, key)
                closeAll()
                void save(next)
              }}
            >
              {canDelete(confirmed.key) ? 'Delete' : 'Retire'}
            </button>
            <button className="cat-menu-sub-action" onClick={closeAll}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {notice && <div className="cat-menu-foot">{notice}</div>}
      {editingKey && <div className="cat-menu-foot">Enter to save · Esc to cancel</div>}
      {coloringKey && <div className="cat-menu-foot">Pick a colour · Esc to cancel</div>}
    </div>
  )
}
