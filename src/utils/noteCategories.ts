import type { NoteCategory, NoteCategoryDef } from '../types'

/**
 * A stored definition, plus the one thing slice C adds: whether it is retired.
 *
 * DELIBERATELY NOT A CHANGE TO `NoteCategoryDef`. `archived_at` is optional, so
 * the two types are mutually assignable and the ~47 call sites that pass
 * definitions around keep compiling untouched — a surface that never asks about
 * archiving never has to know the field exists. `undefined` and `null` both
 * mean ACTIVE, which is what every row written before this slice means.
 */
export interface StoredCategoryDef extends NoteCategoryDef {
  /** ISO timestamp of when this category was retired, or null/absent if active. */
  archived_at?: string | null
}

/**
 * How many categories may be ACTIVE at once, built-ins included.
 *
 * The failure mode this defends against is the reader who builds a 17-colour
 * private language their future self cannot read — the observed behaviour that
 * motivated the whole note-object arc. Eight is also roughly where a picker
 * stops being scannable at a glance on a phone, and the picker is on the
 * capture path. Archived categories do NOT count, which is what makes the cap
 * tolerable rather than punitive: a season spent on typology can be retired to
 * make room for prophecy without losing a note. See
 * docs/proposals/custom-categories.md §6.
 */
export const MAX_ACTIVE_CATEGORIES = 8

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
  { key: 'observation', label: 'Observation', color: 'indigo', sort_order: 0 },
  { key: 'historical', label: 'Historical', color: 'green', sort_order: 1 },
  { key: 'application', label: 'Application', color: 'amber', sort_order: 2 },
  { key: 'personal', label: 'Personal', color: 'rose', sort_order: 3 }
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
 * Every category the workspace knows about, active AND retired, resolved.
 *
 * Stored rows OVERRIDE a built-in of the same key rather than replacing the
 * set, so a partially-customised workspace (one renamed category, three
 * untouched) still shows four. Rows for keys that are NOT built-ins are now
 * carried through rather than dropped — that dropping was the thing that made
 * slice A invisible, and creating a key is what this slice adds.
 *
 * A stored row is still refused when it cannot be rendered coherently: an
 * invalid or reserved key (`isValidCategoryKey`, which is what stops a category
 * keyed `all` shadowing the Journal's "show everything"), a duplicate key, or a
 * blank label on a custom row — a built-in falls back to its default label
 * instead, because it has one and a custom row does not.
 *
 * PURE, unlike `resolveCategories`. Every branch of the create/retire/restore
 * logic reads from this, so it is worth being able to test without a document.
 */
export function resolveAllCategories(stored: StoredCategoryDef[]): StoredCategoryDef[] {
  const overrides = new Map(stored.map(d => [d.key, d]))
  const resolved: StoredCategoryDef[] = BUILT_IN_CATEGORIES.map(builtIn => {
    const override = overrides.get(builtIn.key)
    if (!override) return builtIn
    const def: StoredCategoryDef = {
      key: builtIn.key,
      // An empty or whitespace-only label is a customisation that would leave
      // the category unnameable, so fall back rather than render nothing.
      label: override.label.trim() || builtIn.label,
      color: isPaletteSlot(override.color) ? override.color : builtIn.color,
      sort_order: override.sort_order
    }
    // Only set when retired, so an active built-in stays deep-equal to the
    // constant above — "absence means default" is still literally true.
    return override.archived_at ? { ...def, archived_at: override.archived_at } : def
  })

  const seen = new Set<string>(BUILT_IN_KEYS)
  for (const row of stored) {
    if (seen.has(row.key) || !isValidCategoryKey(row.key)) continue
    const label = row.label.trim()
    if (!label) continue
    seen.add(row.key)
    const def: StoredCategoryDef = {
      key: row.key,
      label,
      // A custom row has no built-in to fall back to, so an unrecognised colour
      // takes the first palette slot rather than rendering colourless.
      color: isPaletteSlot(row.color) ? row.color : CATEGORY_PALETTE[0].id,
      sort_order: row.sort_order
    }
    resolved.push(row.archived_at ? { ...def, archived_at: row.archived_at } : def)
  }

  return resolved.sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key))
}

/** Just the retired ones, in menu order. Pure; see `archivedCategories()`. */
export function resolveArchivedCategories(stored: StoredCategoryDef[]): StoredCategoryDef[] {
  return resolveAllCategories(stored).filter(c => c.archived_at)
}

/* The retired set from the last resolve. See archivedCategories(). */
let lastArchived: StoredCategoryDef[] = []

/**
 * The retired categories from the most recent `resolveCategories` call.
 *
 * A SIDE CHANNEL, and the same one `applyCategoryPalette` uses, for the same
 * reason: `resolveCategories` is the single funnel every surface's category
 * list passes through (the shared store publishes through it on load and on
 * every save), so it is the only place that cannot go stale. The alternative —
 * a second fetch inside the menu — would read the same rows a beat later and
 * could disagree with what the rest of the app is showing.
 *
 * Only the category MENU reads this. Every other surface wants the active set,
 * which is what `useNoteCategories()` returns, and offering a retired category
 * in a picker is exactly what retiring it was meant to stop.
 */
export function archivedCategories(): StoredCategoryDef[] {
  return lastArchived
}

/**
 * The categories to actually OFFER, given whatever is stored: active only.
 *
 * This is what every picker, composer and filter renders, and the contract has
 * not changed — a retired category is simply no longer in it. Notes already
 * filed under one keep their key, their `@tag` and their colour (the palette
 * below is written for retired categories too, deliberately); they just cannot
 * be filed there again.
 */
export function resolveCategories(stored: StoredCategoryDef[]): StoredCategoryDef[] {
  const all = resolveAllCategories(stored)
  // SIDE EFFECT, deliberately — see applyCategoryPalette. Colour is delivered by
  // custom properties now, and this is the only place every surface's list is
  // guaranteed to pass through, so it is the only place that cannot go stale.
  // Retired categories are painted too: a note filed under one still renders.
  applyCategoryPalette(all)
  lastArchived = all.filter(c => c.archived_at)
  return all.filter(c => !c.archived_at)
}

/* ─── Making a category ───────────────────────────────────────────────────────
   Key derivation and the create decision, kept out of the component because
   every interesting case here is a rule rather than a rendering: a label that
   derives to nothing, a name that already exists, a name that was RETIRED under
   the same key, and the cap. See docs/proposals/custom-categories.md §4.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The key a label becomes: lowercased, spaces hyphenated, anything outside
 * `[a-z0-9-]` stripped, forced to start with a letter, truncated to 24 to match
 * the `maxLength={24}` the rename field already enforces.
 *
 * Returns '' when the label derives to something that is not a legal key — an
 * emoji-only name, or one that reduces to the reserved `all`. The caller refuses
 * inline rather than storing a key no surface could resolve.
 */
export function deriveCategoryKey(label: string): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 24)
    .replace(/-+$/, '')
  return isValidCategoryKey(key) ? key : ''
}

/** The first palette slot nothing is using yet, so nobody is asked to pick one. */
export function nextPaletteSlot(categories: StoredCategoryDef[]): string {
  const taken = new Set(categories.map(c => c.color))
  const free = CATEGORY_PALETTE.find(slot => !taken.has(slot.id))
  return (free ?? CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length]).id
}

/** How many categories are currently being offered. Retired ones do not count. */
export function activeCount(categories: StoredCategoryDef[]): number {
  return categories.filter(c => !c.archived_at).length
}

/**
 * What should happen when the reader asks to create `label`.
 *
 * `restore` is the case worth reading twice: creating "Typology" after retiring
 * "Typology" derives the SAME key, and silently creating it would revive every
 * old note under a new definition without saying so. Offering the restore is
 * how a reader undoes a mistake, so it is a feature rather than an edge case
 * (§2). `exists` focuses the row that already exists rather than duplicating a
 * key, which is not even storable — the key is half the primary key.
 */
export type CreateCategoryPlan =
  | { kind: 'invalid'; reason: string }
  | { kind: 'exists'; key: string }
  | { kind: 'restore'; key: string; label: string }
  | { kind: 'full' }
  | { kind: 'create'; def: StoredCategoryDef }

export function planCategoryCreate(
  categories: StoredCategoryDef[],
  label: string
): CreateCategoryPlan {
  const name = label.trim()
  if (!name) return { kind: 'invalid', reason: 'Give it a name first.' }
  const key = deriveCategoryKey(name)
  if (!key) return { kind: 'invalid', reason: 'Use a name with letters in it.' }

  const existing = categories.find(c => c.key === key)
  if (existing && !existing.archived_at) return { kind: 'exists', key }
  if (activeCount(categories) >= MAX_ACTIVE_CATEGORIES) return { kind: 'full' }
  if (existing) return { kind: 'restore', key, label: existing.label }

  const sort_order = categories.reduce((max, c) => Math.max(max, c.sort_order), -1) + 1
  return {
    kind: 'create',
    def: { key, label: name, color: nextPaletteSlot(categories), sort_order }
  }
}

/** Label for one key, falling back to the key itself so nothing renders blank. */
export function labelFor(categories: StoredCategoryDef[], key: string | null): string | null {
  if (!key) return null
  return categories.find(c => c.key === key)?.label ?? key
}

/* ─── The palette: ten slots, never a hex ─────────────────────────────────────
   `NoteCategoryDef.color` stores a SLOT ID ("teal"), not a colour. A hex is a
   light-mode value that dark mode would then have to reverse-engineer, which is
   the bug the whole design exists to avoid: a colour someone picks in light can
   be unreadable in dark, and the failure is silent and one-sided.

   Every value below is solved rather than chosen, and copied verbatim from
   design/category-palette.html (approved 2026-09-01). Do not re-derive them.
   Each pair is measured against all twenty theme canvases tokens.css ships:
   FIELD >= 3:1 on every canvas (WCAG 1.4.11 non-text), INK >= 4.5:1 on the
   canvas AND on the category's own 12% tint, DARK carrying both bars at once
   because ink aliases to the field in dark. No two slots within 25 degrees of
   hue — with one deliberate exception, `slate`, which is separated by
   saturation (18% against 55%) instead and is the only slot allowed to be.

   The FIRST FOUR are today's built-ins at exactly their current hexes, so
   nothing about the existing look changes. See docs/proposals/custom-categories.md
   section 5.2.
   ──────────────────────────────────────────────────────────────────────────── */

export interface PaletteSlot {
  /** Stored in `NoteCategoryDef.color`, and the CSS token suffix (`--slot-teal`). */
  id: string
  /** Shown to a reader only as a swatch label / accessible name. */
  label: string
  /** Field value in light. Also what EXPORT resolves to — a file has no themes. */
  light: string
  /** Ink value in light: the 12px/500 uppercase label, on its own tint. */
  ink: string
  /** Field AND ink in dark, where ink aliases back to the field. */
  dark: string
}

export const CATEGORY_PALETTE: readonly PaletteSlot[] = [
  { id: 'indigo', label: 'Indigo', light: '#6b62d6', ink: '#594fd1', dark: '#a49cf0' },
  { id: 'green', label: 'Green', light: '#3f8f5b', ink: '#316f47', dark: '#5fbf92' },
  { id: 'amber', label: 'Amber', light: '#b5732a', ink: '#8a5820', dark: '#d79a55' },
  { id: 'rose', label: 'Rose', light: '#c05070', ink: '#a73c5b', dark: '#e58aab' },
  { id: 'olive', label: 'Olive', light: '#6f8934', ink: '#576b29', dark: '#90b143' },
  { id: 'teal', label: 'Teal', light: '#2c8c88', ink: '#226d6a', dark: '#3bbab6' },
  { id: 'blue', label: 'Blue', light: '#3984c6', ink: '#2d679a', dark: '#79abd8' },
  { id: 'slate', label: 'Slate', light: '#72809d', ink: '#58657e', dark: '#9ca6ba' },
  { id: 'purple', label: 'Purple', light: '#a964c4', ink: '#8f42ae', dark: '#c697d8' },
  { id: 'plum', label: 'Plum', light: '#c059af', ink: '#9f3c8f', dark: '#d590c9' }
] as const

/**
 * True when `value` names a slot in the palette.
 *
 * This replaced `isHexColor`, and it is the same guard doing the same job one
 * level up: an unrecognised stored value falls back to the built-in exactly as
 * an invalid hex did. That matters for rows written BEFORE this slice, which
 * stored the built-in hexes — they simply read as "not customised" and resolve
 * to the built-in, which is what they meant.
 */
export function isPaletteSlot(value: string): boolean {
  return CATEGORY_PALETTE.some(slot => slot.id === value)
}

/** The slot a stored colour names, or undefined if it names nothing we know. */
export function paletteSlot(value: string | null | undefined): PaletteSlot | undefined {
  return CATEGORY_PALETTE.find(slot => slot.id === value)
}

/**
 * A slot as a plain hex, for anywhere that has no themes to resolve against.
 *
 * EXPORT is the case that forces this: a Markdown file (or the notes.json
 * beside it) is read in a text editor ten years from now, where "teal" means
 * nothing and there is no light/dark to choose between. The LIGHT field value
 * is the answer, because it is the one a reader saw when they picked it.
 */
export function paletteHex(value: string | null | undefined): string | null {
  return paletteSlot(value)?.light ?? null
}

/* ─── Painting a category ─────────────────────────────────────────────────────
   CSS no longer keys on the category. Before this slice, 79 selectors named one
   of the four keys across 14 selector families (`.journal-note.cat-personal`,
   `.rail-bracket.cat-historical`, …), which is why a fifth category rendered
   colourless: there was no rule for it, and there could not be until someone
   wrote fourteen more by hand.

   Now every family paints from `--cat-c` / `--cat-c-ink` / `--cat-c-weak` /
   `--cat-c-tint`, and the only thing that knows a key exists is one small
   binding block in main.css (the built-in defaults, which keep each category's
   theme-tuned tokens) plus what this module writes for a CUSTOMISED one.

   Writing it as a stylesheet rather than inline styles is deliberate: the
   elements carrying `.cat-<key>` are rendered by nine components, and a rule
   reaches all of them without any of those components knowing about colour.
   ──────────────────────────────────────────────────────────────────────────── */

/** The id of the `<style>` element the palette is written into. */
export const CATEGORY_PALETTE_STYLE_ID = 'lantern-category-palette'

/**
 * The CSS for whatever categories are customised. Pure, and the whole reason
 * this is testable without a browser.
 *
 * Only categories that actually MOVED off their default are emitted, so an
 * uncustomised workspace produces the empty string and the built-ins keep the
 * per-theme values tokens.css tunes for them. `html ` prefixes each selector
 * purely for specificity: it has to outrank main.css's binding block no matter
 * which order the two stylesheets end up in.
 */
export function categoryPaletteCss(categories: StoredCategoryDef[]): string {
  const rules: string[] = []
  for (const cat of categories) {
    if (!isValidCategoryKey(cat.key)) continue
    const slot = paletteSlot(cat.color)
    if (!slot) continue
    const builtIn = BUILT_IN_CATEGORIES.find(b => b.key === cat.key)
    if (builtIn && builtIn.color === cat.color) continue
    const c = `var(--slot-${slot.id})`
    rules.push(
      [
        `html .cat-${cat.key},`,
        `html .pill-tag-${cat.key},`,
        `html .swatch-${cat.key},`,
        `html [data-cat='${cat.key}'] {`,
        `  --cat-c: ${c};`,
        `  --cat-c-ink: var(--slot-${slot.id}-ink);`,
        `  --cat-c-weak: color-mix(in srgb, ${c} var(--cat-weak-pct), transparent);`,
        `  --cat-c-tint: color-mix(in srgb, ${c} var(--cat-tint-pct), transparent);`,
        // main.css keeps observation's pre-existing --accent aliasing alive
        // through --cat-alt-*. A recoloured category must stop honouring it,
        // and `initial` is how a custom property is un-set so var()'s fallback
        // (the slot above) takes over.
        `  --cat-alt: initial;`,
        `  --cat-alt-ink: initial;`,
        `  --cat-alt-weak: initial;`,
        `  --cat-alt-strong: initial;`,
        `}`
      ].join('\n')
    )
  }
  return rules.join('\n')
}

/**
 * Put that CSS in the document. Idempotent, and a no-op outside a browser.
 *
 * Called from `resolveCategories` rather than from a component, because that is
 * the one funnel EVERY surface's category list already passes through — the
 * shared store publishes through it on load and on every save. Hanging it off a
 * component instead would mean a surface that never mounts the picker (the
 * Journal, say) rendering last-published colours, which is precisely the class
 * of bug the shared store was introduced to end.
 */
export function applyCategoryPalette(categories: StoredCategoryDef[]): void {
  if (typeof document === 'undefined') return
  const css = categoryPaletteCss(categories)
  let el = document.getElementById(CATEGORY_PALETTE_STYLE_ID)
  if (!el) {
    el = document.createElement('style')
    el.id = CATEGORY_PALETTE_STYLE_ID
    document.head.appendChild(el)
  }
  if (el.textContent !== css) el.textContent = css
}

/**
 * Only what actually differs from the built-in is worth storing.
 *
 * A RETIRED built-in always differs, even when its label and colour are still
 * the defaults — "absence means default, active" cannot express a built-in the
 * reader has retired, so that one needs an explicit row (see migration 0011).
 */
export function changedFromDefaults(categories: StoredCategoryDef[]): StoredCategoryDef[] {
  return categories.filter(c => {
    const builtIn = BUILT_IN_CATEGORIES.find(b => b.key === c.key)
    if (!builtIn) return true
    return (
      c.label !== builtIn.label ||
      c.color !== builtIn.color ||
      c.sort_order !== builtIn.sort_order ||
      Boolean(c.archived_at)
    )
  })
}

/* ─── Retiring and restoring ──────────────────────────────────────────────────
   Three one-liners rather than three inline `.map`s in the component, because
   what they preserve is the point: a retire NEVER touches `notes.category` or
   the `@tag` in a note's content, and a restore returns the SAME key, so the
   notes that were filed under it resolve again exactly as they did before.
   ──────────────────────────────────────────────────────────────────────────── */

/** Retire one category. Its notes keep their key, their tag and their colour. */
export function archiveCategory(
  categories: StoredCategoryDef[],
  key: string,
  now: string = new Date().toISOString()
): StoredCategoryDef[] {
  return categories.map(c => (c.key === key ? { ...c, archived_at: now } : c))
}

/** Bring one back. The key never moved, so nothing has to be rewritten. */
export function restoreCategory(categories: StoredCategoryDef[], key: string): StoredCategoryDef[] {
  return categories.map(c => (c.key === key ? { ...c, archived_at: null } : c))
}

/**
 * Actually remove a definition. Only ever offered for a CUSTOM category with
 * zero notes, because there is nothing to protect and an archive full of empty
 * experiments is its own mess. A built-in is never deleted — its key is what
 * every note written before this feature existed still resolves through.
 */
export function deleteCategory(categories: StoredCategoryDef[], key: string): StoredCategoryDef[] {
  if (BUILT_IN_KEYS.includes(key)) return categories
  return categories.filter(c => c.key !== key)
}
