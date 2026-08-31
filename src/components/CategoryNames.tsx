import React, { useCallback, useEffect, useState } from 'react'
import { useApi } from '../api/context'
import type { NoteCategoryDef } from '../types'
import { changedFromDefaults, resolveCategories } from '../utils/noteCategories'
import { publishNoteCategories, useNoteCategories } from '../utils/useNoteCategories'

/**
 * Rename the four note categories.
 *
 * WHY IT EXISTS. The category set is the retrieval index. A reader who studies
 * mostly typology, or prophecy, or prayer has no word for it, so everything
 * lands in "Observation" and the Journal stops discriminating exactly when it
 * starts mattering. See docs/proposals/note-object.md §3.
 *
 * WHY RENAME AND NOT RECOLOUR. Category colours have separately tuned light and
 * dark values (tokens.css), because a hue that carries on cream fails on a
 * near-black canvas. A free hex picker would let a reader choose something that
 * looks right in one theme and is unreadable in the other, which is the exact
 * contrast invariant this project already guards. Colour customisation wants a
 * curated palette of light/dark PAIRS, which is a taste and accessibility
 * decision, not a control to bolt on here.
 *
 * WHY NOT ADD OR REMOVE CATEGORIES. The keys are what the note parser's @tag
 * regex is built from, and what every stored note carries. Adding a reader's
 * own key is a separate slice with real parser work behind it.
 *
 * The KEY never changes when a label does, so renaming can never orphan a note.
 */
export default function CategoryNames(): React.ReactElement {
  const api = useApi()
  // The shared, already-loaded set. Seeds the editor's own draft so opening
  // Settings never shows different names than the rest of the app.
  const live = useNoteCategories()
  const [categories, setCategories] = useState<NoteCategoryDef[]>(live)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Adopt the shared set whenever it changes underneath (first load, or another
  // surface saving), but never clobber an edit in progress.
  useEffect(() => {
    setCategories(prev => (changedFromDefaults(prev).length === 0 ? live : prev))
  }, [live])

  const rename = useCallback((key: string, label: string) => {
    setSavedAt(null)
    setCategories(prev => prev.map(c => (c.key === key ? { ...c, label } : c)))
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    setError(false)
    try {
      // Store only what differs, so resetting everything to the defaults
      // stores nothing at all rather than four redundant rows.
      const stored = changedFromDefaults(categories)
      await api.saveNoteCategories(stored)
      // Broadcast, so the Journal's filter and the composer's tag menu pick the
      // new names up immediately rather than on their next remount.
      publishNoteCategories(stored)
      // Re-resolve so a blank name the reader typed snaps back to its default
      // here, exactly as it will everywhere else.
      setCategories(resolveCategories(stored))
      setSavedAt(Date.now())
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }, [api, categories])

  const reset = useCallback(() => {
    setSavedAt(null)
    setCategories(resolveCategories([]))
  }, [])

  const dirty = changedFromDefaults(categories).length > 0

  return (
    <div className="category-names">
      {categories.map(cat => (
        <label key={cat.key} className="category-names-row">
          <span
            className={`category-names-dot cat-${cat.key}`}
            aria-hidden="true"
            title={cat.key}
          />
          <input
            className="category-names-input"
            value={cat.label}
            maxLength={24}
            onChange={e => rename(cat.key, e.target.value)}
            aria-label={`Name for the ${cat.key} category`}
          />
        </label>
      ))}
      <div className="category-names-actions">
        <button className="smodal-vault-btn" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save names'}
        </button>
        {dirty && (
          <button className="category-names-reset" onClick={reset} disabled={saving}>
            Reset to defaults
          </button>
        )}
        {savedAt !== null && <span className="category-names-saved">Saved</span>}
      </div>
      {error && <p className="smodal-vault-desc">Could not save. Check your connection.</p>}
    </div>
  )
}
