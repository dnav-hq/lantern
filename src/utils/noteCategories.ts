import type { NoteCategory, NoteCategoryDef } from '../types'

/* ─── Category definitions ────────────────────────────────────────────────────
   The four categories are good discipline and the right default. They are also
   THE RETRIEVAL INDEX: a reader who studies mostly typology, or prophecy, or
   prayer has no category for it, so everything lands in `observation` and the
   Journal stops discriminating exactly when it starts mattering. See
   docs/proposals/note-object.md §3.

   THIS SLICE: rename and recolour. The four KEYS stay fixed, which is why this
   needs no schema backfill, no change to the NoteCategory union, and no change
   to the note parser (whose @tag regex is built from those keys). Adding a
   reader's own key is the next slice and is where the parser coupling lands.

   ABSENCE MEANS DEFAULTS. A workspace with no stored definitions uses the four
   below, which is exactly what every workspace does today. Rows exist only once
   someone has actually customised something, so this changes nothing for anyone
   who does not use it.
   ──────────────────────────────────────────────────────────────────────────── */

export const BUILT_IN_CATEGORIES: readonly NoteCategoryDef[] = [
  { key: 'observation', label: 'Observation', color: '#6b62d6', sort_order: 0 },
  { key: 'historical', label: 'Historical', color: '#3f8f5b', sort_order: 1 },
  { key: 'application', label: 'Application', color: '#b5732a', sort_order: 2 },
  { key: 'personal', label: 'Personal', color: '#c05070', sort_order: 3 }
] as const

/** The keys a note may carry in this slice. Widens when custom keys land. */
export const BUILT_IN_KEYS: readonly NoteCategory[] = BUILT_IN_CATEGORIES.map(
  c => c.key as NoteCategory
)

/**
 * The categories to actually show, given whatever is stored.
 *
 * Stored rows OVERRIDE a built-in of the same key rather than replacing the
 * set, so a partially-customised workspace (one renamed category, three
 * untouched) still shows four. A stored row for an unknown key is ignored here
 * rather than shown, since this slice cannot render a category the composer
 * and parser do not know about — dropping it is safer than offering a category
 * that cannot be applied.
 */
export function resolveCategories(stored: NoteCategoryDef[]): NoteCategoryDef[] {
  const overrides = new Map(stored.map(d => [d.key, d]))
  return BUILT_IN_CATEGORIES.map(builtIn => {
    const override = overrides.get(builtIn.key)
    if (!override) return builtIn
    return {
      key: builtIn.key,
      // An empty or whitespace-only label is a customisation that would leave
      // the category unnameable, so fall back rather than render nothing.
      label: override.label.trim() || builtIn.label,
      color: isHexColor(override.color) ? override.color : builtIn.color,
      sort_order: override.sort_order
    }
  }).sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key))
}

/** Label for one key, falling back to the key itself so nothing renders blank. */
export function labelFor(categories: NoteCategoryDef[], key: string | null): string | null {
  if (!key) return null
  return categories.find(c => c.key === key)?.label ?? key
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

/** Only what actually differs from the built-in is worth storing. */
export function changedFromDefaults(categories: NoteCategoryDef[]): NoteCategoryDef[] {
  return categories.filter(c => {
    const builtIn = BUILT_IN_CATEGORIES.find(b => b.key === c.key)
    if (!builtIn) return true
    return (
      c.label !== builtIn.label || c.color !== builtIn.color || c.sort_order !== builtIn.sort_order
    )
  })
}
