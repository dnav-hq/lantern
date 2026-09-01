import type { NoteCategory, NoteCategoryDef } from '../types'

/* ─── Category definitions ────────────────────────────────────────────────────
   The four categories are good discipline and the right default. They are also
   THE RETRIEVAL INDEX: a reader who studies mostly typology, or prophecy, or
   prayer has no category for it, so everything lands in `observation` and the
   Journal stops discriminating exactly when it starts mattering. See
   docs/proposals/note-object.md §3.

   SLICE A (2026-09-01) opened the seams: `NoteCategory` is now an open string
   and the parser reads any @tag generically, so a key this build has never seen
   no longer falls through as prose. NOTHING A READER SEES CHANGED — the four
   below are still the only categories that exist, and `resolveCategories` still
   refuses to surface anything else. Creating a key is slice B; see
   docs/proposals/custom-categories.md §7.

   The four KEYS stay fixed, which is why rename needed no schema backfill.

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

/** The four keys every workspace starts with. Custom keys are appended in slice B. */
export const BUILT_IN_KEYS: readonly NoteCategory[] = BUILT_IN_CATEGORIES.map(c => c.key)

/* ─── What a category key may be ──────────────────────────────────────────────
   THE SOURCE OF TRUTH FOR THE KEY GRAMMAR, and deliberately one string rather
   than two regexes. src/utils/noteParser.ts builds its @tag pattern from
   CATEGORY_KEY_SOURCE, so "what the parser will recognise as a tag" and "what
   this module will accept as a key" cannot drift apart. They drifting apart is
   precisely the failure this slice exists to prevent — the parser used to have
   the four keys baked into a literal regex of its own.

   This is also what replaces the compiler. `NoteCategory` was a closed union
   until slice A; widening it to `string` means a bad key now compiles fine and
   fails silently somewhere downstream, so the check has to be written out.
   See src/types/index.ts.
   ──────────────────────────────────────────────────────────────────────────── */

/** Lowercase letter, then letters/digits/hyphens, 24 chars max — matching the
 *  `maxLength={24}` the rename field already enforces. */
export const CATEGORY_KEY_SOURCE = '[a-z][a-z0-9-]{0,23}'

const CATEGORY_KEY_RE = new RegExp(`^${CATEGORY_KEY_SOURCE}$`)

/**
 * Keys a category may never take, because some other layer already means
 * something by them.
 *
 * `all` is the Journal filter's "no category filter" sentinel
 * (`ALL` in src/utils/journalFilters.ts). A category keyed `all` would be
 * indistinguishable from "show everything", so its notes would silently vanish
 * from the filtered view. While NoteCategory was a closed union that was
 * impossible by construction; now it is only impossible if someone checks.
 */
export const RESERVED_CATEGORY_KEYS: readonly string[] = ['all']

/** True when `key` is a key a category could legitimately be stored under. */
export function isValidCategoryKey(key: string): boolean {
  return CATEGORY_KEY_RE.test(key) && !RESERVED_CATEGORY_KEYS.includes(key)
}

/**
 * The categories to actually show, given whatever is stored.
 *
 * Stored rows OVERRIDE a built-in of the same key rather than replacing the
 * set, so a partially-customised workspace (one renamed category, three
 * untouched) still shows four. A stored row for an unknown key is ignored here
 * rather than shown, since this slice cannot render a category the composer
 * and pickers do not offer — dropping it is safer than offering a category
 * that cannot be applied.
 *
 * STILL TRUE AFTER SLICE A, on purpose. The parser now reads any @tag, but no
 * surface can yet CREATE a key, so surfacing a stored custom row would offer a
 * category with no colour and no way to manage it. Slice B rewrites this to
 * carry non-built-in keys; until then this function is what guarantees slice A
 * changes nothing a reader sees.
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
