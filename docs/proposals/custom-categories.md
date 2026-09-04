# Custom categories — adding and removing your own

Status: **slice A built 2026-09-01; slice B's COLOUR half built 2026-09-02;
slice C (create/archive/restore) and slice D (the Journal filter + the export
label fix) both built 2026-09-03.** Written
2026-08-31, after the rename slice shipped (`docs/BACKLOG.md`, "User-owned
categories, slice 1: RENAME"). Rename was free because the KEY never moves.
Everything left is about keys that move, and that is a different problem
wearing the same clothes.

> **Corrections made while building slice A (2026-09-01)** — each is also
> marked inline where it applies:
> 1. §1.1's three `Record<NoteCategory, string>` label maps **no longer
>    exist.** They were deleted on 2026-09-01 by the desktop-regression sweep's
>    finding 3 (category-rename drift), which moved all three onto
>    `useCategoryLabels()`. That part of slice A was already done.
> 2. §3's regex is **not sufficient as written**: `[a-z]` plus a trailing `\b`
>    does not leave email addresses alone, so `paul@corinth.org` would have
>    filed the note under `corinth`. The pattern gained a leading
>    `(^|[^A-Za-z0-9_])` — a tag must START a word.
> 3. §7's slice A was **narrowed** to the parser and the type. The CSS
>    custom-property refactor (§5.1) and the five hardcoded tag lists moved to
>    slice B; see the note at the end of §7 for why that is safe.

## tl;dr

- **The four keys are not data. They are compiled in.** They are a closed TS
  union (`src/types/index.ts:2`, 47 uses across 10 files), a hardcoded regex in
  the note parser (`src/utils/noteParser.ts:4`), a second copy of that regex in
  the workbench (`src/components/StudyWorkbench.tsx:26`), five literal lists in
  four editor components, and **75 hardcoded CSS selectors** across 14 selector
  families. A custom key today renders with no colour at all and breaks
  highlight detection.
- **`NoteCategoryDef.color` is currently rendered nowhere.** The rename slice
  stores a hex and then paints from `.cat-<key>` CSS classes
  (`src/components/CategoryMenu.tsx:87`). Recolour did not actually ship; it was
  stored and ignored. This is the real colour blocker, not the hex-picker
  contrast question.
- **Deletion must archive, never remove.** A category with notes on it is
  retired from the pickers and kept as a definition. Notes keep their key, their
  name and their colour. Nothing is reassigned and nothing is orphaned.
- **The parser should parse `@tags` generically and validate afterwards.** It is
  the only option that keeps the function pure, and it fixes a live bug: an
  unrecognised tag today makes a wordless highlight read as a written note whose
  entire text is `@typology`.
- **Colour is slots, not hexes.** A curated palette of 10 light/dark pairs,
  assigned automatically on create. The CSS stops keying on the category and
  starts keying on a custom property the component sets, which collapses 75
  selectors to 14.
- **Cap at 8 active, archived excluded.** The cap is only tolerable because
  retiring is free.

---

## 1. What is actually coupled

Every claim below was read out of the code, not assumed. Line numbers are
against `main` at 7d4c90f.

### 1.1 The type is a closed union

```ts
// src/types/index.ts:2
export type NoteCategory = 'observation' | 'historical' | 'application' | 'personal'
```

`NoteCategory` (not `NoteCategoryDef`) appears **47 times across 10 non-test
files**: `types/index.ts`, `utils/noteParser.ts`, `utils/noteCategories.ts`, and
the components `ReadingMode`, `MobileNoteComposer`, `NoteEditor`, `JournalPage`,
`StudyWorkbench`, `QuickEditCard`, `BookDetailPage`. Most are harmless
annotations. Three are not, and they are the ones to look at:

- ~~`Record<NoteCategory, string>` label maps at `ReadingMode.tsx:43`,
  `StudyWorkbench.tsx:35` and `BookDetailPage.tsx:45`. These are **exhaustive by
  type**. Widen the union and they compile fine and return `undefined` for every
  custom key — a silent blank label, not a type error.~~
  **CORRECTED 2026-09-01: these three maps no longer exist.** The
  desktop-regression sweep's finding 3 (category-rename drift) deleted all
  three and moved the call sites onto `useCategoryLabels()`
  (`src/utils/useNoteCategories.ts`), for the same reason this brief gives —
  they were a stale second copy that never noticed a rename. So slice A's
  "delete the three maps" was already done before slice A started, and the
  most-dangerous silent failure §1.1 warned about is gone.
- `key as NoteCategory` casts at `BookDetailPage.tsx:1617` and `:1654`, where a
  `CategoryMenu` `onPick(key: string)` is forced back into the union. These are
  already lies; widening makes them honest.
- `type CategoryFilter = NoteCategory | 'all'` at `JournalPage.tsx:23`, with a
  matching `d.key as CategoryFilter` cast at `:29`.

**Recommendation: `export type NoteCategory = string`, kept as a named alias.**
One line changes, all 47 sites keep compiling, and the name keeps documenting
what the string is for. Then delete the three `CATEGORY_LABELS` maps outright
rather than widening them — labels already come from `useNoteCategories()`
(`src/utils/useNoteCategories.ts:63`), and those maps are the stale second copy.

**Risk: medium, and it is a silent-failure risk.** The compiler stops helping
the moment the union opens. The three label maps are the specific places where
"it compiles" and "it works" come apart.

**SHIPPED 2026-09-01 as `export type NoteCategory = string`,** kept as a named
alias exactly as recommended. All 47 sites compiled unchanged; the `as
NoteCategory` casts became honest no-ops. Because the compiler stops helping,
the check it used to give for free was written out instead:
`isValidCategoryKey` in `src/utils/noteCategories.ts` holds the key grammar
(`CATEGORY_KEY_SOURCE`) and a `RESERVED_CATEGORY_KEYS` list, and
`src/utils/noteParser.ts` builds its @tag pattern from the **same source
string**, so "what the parser will read back" and "what may be stored as a key"
cannot drift apart.

`RESERVED_CATEGORY_KEYS` is a hazard this brief did not spot. `CategoryFilter`
(§1.1, third bullet) is `NoteCategory | 'all'`, and `journalFilters.ts`'s `ALL`
sentinel is the string `'all'`. While the union was closed, a category keyed
`all` was impossible by construction; open the union and it becomes a category
whose own notes vanish under its own filter. Slice B's create flow must call
`isValidCategoryKey`.

### 1.2 The parser builds a fixed regex from the four literals

```ts
// src/utils/noteParser.ts:4
const TAG_PATTERN = /@(obs(?:ervation)?|hist(?:orical)?|app(?:lication)?|per(?:sonal)?)\b/gi
```

and normalises prefixes onto them, with a default:

```ts
// src/utils/noteParser.ts:8-15
function normalizeCategory(raw: string): NoteCategory {
  const lower = raw.toLowerCase()
  if (lower.startsWith('obs')) return 'observation'
  // …
  return 'observation'
}
```

`parseNoteLine` is a **pure function with no context**, called from at least
`StudyWorkbench.tsx` (three sites), `noteKind.ts:42`, `richText.ts`, and
`NoteEditor.tsx`. That purity is why §2 is a real question rather than a
one-liner.

There is a **second copy of the same regex** in `StudyWorkbench.tsx:26`
(`ANY_TAG`), used by `withCategory` (`:71`) to strip an existing tag before
writing a new one. Both have to widen together or setting a category on a note
that already carries a custom one will append rather than replace.

**Risk: high.** This is the one file every note-rendering surface depends on.

### 1.3 Every stored note embeds its category as an `@tag` in its content

```ts
// src/components/BookDetailPage.tsx:93-101
function composeNoteContent(body, start, end, category): string {
  const anchor = start === end ? `v${start}` : `v${start}-${end}`
  return `${anchor}${category ? ` @${category}` : ''} ${body.trim()}`.trim()
}
```

So a wordless mark is literally stored as `v4 @personal`. The `notes.category`
column carries the same value redundantly.

This is where the sharpest live bug is. `noteKind.ts` decides
highlight-vs-written-note by stripping tag segments and asking whether anything
is left:

```ts
// src/utils/noteKind.ts:41-49, :57
function lineProse(line: string): string {
  const { segments } = parseNoteLine(line)
  return segments.filter((seg, i) => seg.type !== 'tag' && …)
}
export function isHighlight(note): boolean { return noteProse(note.content) === '' }
```

The parser only produces a `tag` segment for the four known keys. So the moment
a custom key exists, `v4 @typology` parses as **text**, `noteProse` returns
`"@typology"`, `isHighlight` returns false, and a wordless mark renders as a
written note whose entire body is the tag. Its file comment
(`noteKind.ts:36-39`) already warns that getting this wrong "made every mark
look like a written note whose text had gone missing." It would do it again.

**Risk: high, and invisible in review.** Nothing throws. Highlights just quietly
turn into notes.

### 1.4 Colour is CSS classes keyed on the category, not the stored hex

`CategoryMenu` renders `className={`cat-menu-dot cat-${cat.key}`}`
(`CategoryMenu.tsx:87` and `:114`) and never reads `cat.color`. Grepping the
stylesheets:

- **67** `.cat-<key>` selectors in `src/assets/main.css`, across **14 selector
  families**: `.journal-dot`, `.journal-note`, `.journal-note … .journal-note-verse`,
  `.cat-menu-dot`, `.reading-note-card`, `.reading-note-meta`,
  `.reading-subnote-meta`, `.rail-bracket`, `.verse-span-bracket`,
  `.quick-edit-card`, `.chapter-note-dot`, `.study-note`, `.study-editor`,
  `.study-chip`.
- **8** more in `src/assets/dark.css:117-131`.
- Four more each of `.pill-tag-<key>` and `.swatch-<key>` in `main.css`, driven
  by `richText.ts:112` and `NoteEditor.tsx:167`.
- **8 declarations of `--cat-observation`** in `src/assets/tokens.css` — four
  themes (default, `scholarly`, `paper`, `modern`) × light/dark. Each block
  declares a **three-token family** per category: `--cat-X`, `--cat-X-weak`,
  `--cat-X-ink`. (`html[data-pure-black]` deliberately does not override them;
  see the comment at `tokens.css:411`.)

So a custom category named `typology` gets `class="cat-typology"`, matches
nothing, and renders colourless in fourteen places. **The stored `color` hex is
dead data today.** That is the honest state of the "recolour" half of the
shipped slice, and it is the thing to fix before a picker of any kind is
designed.

### 1.5 Four hardcoded tag lists in the editors

`RichEditInput.tsx:16-19`, `InlineTagInput.tsx:21-24`, `NoteEditor.tsx:28-31`
and `NoteEditor.tsx:94-97` each hold their own literal array of the four
categories for the `@` autocomplete and the toolbar. `StudyWorkbench.tsx:29-33`
holds a fifth. All five become `useNoteCategories()`. **Risk: low** — mechanical,
and a missed one shows up immediately as a missing dropdown row.

### 1.6 What is already ready

Three things need no work at all, and it is worth saying so:

- `journalFilters.ts:66-78` (`categoriesPresent`) already derives the filter
  list from the notes present, with the built-ins as a preference order and
  anything unknown appended alphabetically. Its comment says it was written for
  exactly this.
- `supabase/migrations/0010_note_categories.sql` already dropped
  `notes_category_check`, so the database will accept any key today.
- `getNoteCategories` goes through `this.read(...)`
  (`berean-api.ts:438`), so definitions are mirrored offline like every other
  read. A custom category keeps its name and colour with no network.

One thing needs a small decision it does not have yet:
`src/platform/export.ts:92` writes `note.category` — the **key**, not the label.
A reader who named a category "Christ in the OT" exports `christ-in-the-ot`.
Export the label with the key as fallback.

---

## 2. What happens to existing notes when a category is deleted

This is the hardest question and it goes first, because every other decision
bends around the answer.

Renaming is safe because the key never moves — that is stated in
`types/index.ts:5-10` and enforced by `resolveCategories` keying on `builtIn.key`
(`noteCategories.ts:43-57`). Deletion moves nothing either; it makes a key
**stop having a meaning**, and every note carrying it becomes a note filed under
a word the app can no longer explain.

Three behaviours are possible.

1. **Hard delete.** The row goes. Notes keep the key. `labelFor`
   (`noteCategories.ts:60-63`) already falls back to the key itself, so the
   Journal shows `typology` in lowercase and the colour drops to neutral. Cheap,
   and it does not lose notes. But it silently degrades work the reader did
   deliberately, and it is irreversible from the UI.
2. **Reassign on delete.** Ask which category the notes should move to, then
   rewrite `notes.category` **and the `@tag` inside every affected note's
   content** (§1.3). This is a bulk content rewrite across an unbounded number
   of rows, with no undo, and it destroys the distinction the reader made. It is
   also the only option that can genuinely lose information.
3. **Archive.** The definition is kept with an `archived_at` timestamp. It stops
   appearing in every picker and in the `@` autocomplete. It keeps appearing in
   the Journal filter (which derives from notes in use anyway) and keeps
   supplying its label and colour wherever an existing note renders. Nothing is
   rewritten.

**Recommendation: archive (3), with a hard delete only when the category has
zero notes.**

Why: the unacceptable outcome is losing or orphaning a reader's notes, and
archive is the only option where no note is touched at all. It also matches the
grain the schema was already built on — migration `0010` is explicit that
categories are "DEFINITIONS ONLY, NOT A FOREIGN KEY" precisely so that
"deleting a category must not cascade-delete notes."

What it costs, stated plainly:

- **A fourth state to hold in mind.** Rows are now built-in, customised,
  archived, or absent. `resolveCategories` and `changedFromDefaults`
  (`noteCategories.ts:43`, `:70`) both need to know about archived rows and
  currently cannot express one. `resolveCategories` also **drops any stored row
  whose key is not a built-in** today (it maps over `BUILT_IN_CATEGORIES`), so
  it needs rewriting regardless.
- **Archiving a built-in is a real case.** Someone who never writes historical
  notes will retire it. The built-in must be archivable, which means "absence of
  a row" can no longer mean "show the default" for that key. Store an explicit
  archived row for a retired built-in.
- **Restore has to exist**, or archive is just a slower delete. It lives in the
  same menu, below a "Retired" divider that only appears when there is something
  in it.
- **Key reuse must be caught.** Creating "Typology" after retiring "Typology"
  derives the same key. Offer the restore instead of silently reviving the old
  notes under a new definition. This is a feature, not an edge case: it is how a
  reader undoes a mistake.

A category with **zero notes** hard-deletes with no ceremony, because there is
nothing to protect and an archive list full of empty experiments is its own
mess. The delete confirm therefore has two forms, and it says the count:
"Delete Typology?" versus "Retire Typology? 31 notes keep their name and
colour — you just won't be able to file new ones here."

---

## 3. How the parser learns the reader's key list

`parseNoteLine` is pure and context-free (§1.2). Three ways to give it the list.

**A — pass the list in.** `parseNoteLine(text, keys)`. Explicit and testable,
but it changes the signature at every call site including `noteKind.ts:42`,
which is itself called from `chapterNoteMarks`, the Journal and export — so the
list has to be threaded through pure utility modules that currently have no
business knowing about a workspace. It also puts the burden on every future
caller to remember, and a caller that forgets gets a wrong answer rather than a
compile error if the parameter is optional.

**B — a module-level registry.** `setKnownCategories(keys)` called once at
bootstrap, read by the parser. No signature churn. But it is global mutable
state under a pure function: tests must seed it (and a forgotten seed produces a
plausible wrong result), and it has exactly one slot, which the groups /
shared-workspaces work (`docs/proposals/groups-shared-workspaces.md`) would need
two of.

**C — parse `@tags` generically, validate afterwards.** The parser matches any
`@word` and reports it. Whether that word is a category the reader owns is
decided at the render and filter layer, which already has `useNoteCategories()`.

**Recommendation: C.** It is not merely the least invasive; it is the only one
that is *more correct* than today.

- It keeps `parseNoteLine` pure, with no new parameter and no hidden state.
- **It fixes §1.3's highlight bug for free**, and fixes it for categories that
  do not exist yet — including a tag typed before its category is created, and a
  note that arrives from another device before the definitions have loaded.
  Options A and B both leave that window broken, because during it the key list
  is wrong.
- It makes the failure mode visible rather than silent. An unknown `@tag`
  renders as a neutral pill and is stripped from prose exactly like a known one,
  which is the behaviour a reader would predict.

The shape:

```ts
const TAG_PATTERN = /@([a-z][a-z0-9-]{0,23})\b/gi   // was: four literals
```

**CORRECTED 2026-09-01 — that pattern is not safe.** The claim two paragraphs
below, that "the `[a-z]` first-character rule and the `\b` boundary cover most
of it", is wrong about the case that matters: an email address. `@` is preceded
by a letter in `paul@corinth.org`, so the pattern above matches `@corinth` and
files the whole note under a category called `corinth`. A tag has to START a
word. What shipped:

```ts
const TAG_PATTERN = new RegExp(`(^|[^A-Za-z0-9_])@(${CATEGORY_KEY_SOURCE})\\b`, 'gi')
```

The leading group is consumed only to prove the boundary; it is stripped back
off the token's index and length, so segment offsets are unchanged.
`CATEGORY_KEY_SOURCE` is `[a-z][a-z0-9-]{0,23}` and lives in
`noteCategories.ts` (§1.1) rather than being written out here, so the parser and
the key validator are one string.

Two behaviours worth pinning, both now tested:

- **An over-long `@word` stays prose.** The trailing `\b` refuses to land
  mid-word, so a 25-character word does not match a truncated 24-character key.
  Truncating would have filed a note under a key nobody chose.
- **`@Typology` normalises to `typology`.** Keys are lowercase; the display
  string is the normalised key, which is the existing behaviour that already
  showed `@obs` as `@observation`.

`normalizeCategory` loses the prefix table and becomes a lowercase, with a small
**legacy alias map** retained for `obs|hist|app|per` so content someone already
typed by hand keeps resolving. `ParsedNote.category` becomes `string | null`.
The silent `return 'observation'` default at `noteParser.ts:14` goes — an
unknown tag is an unknown tag, not an observation.

Two consequences worth naming:

- **Abbreviations stop being a parser concern.** Custom categories get no
  prefix matching, which is right: `@pro` cannot mean both `prophecy` and
  `promises`. Completion moves entirely to the `@` dropdown
  (`RichEditInput.tsx:62-68`), which already inserts the full key.
- **`@` now matches more text than it used to.** ~~A note containing an email
  address or a handle would previously have been left alone and will now produce
  a tag segment. The `[a-z]` first-character rule and the `\b` boundary cover
  most of it;~~ **(corrected above — they do not; email addresses needed the
  leading word-boundary guard.)** With that guard in place the residual case is
  a bare `@word` in prose, which now renders as a neutral pill. Acceptable — it
  is stripped from prose the same way, so nothing is lost — but it is the one
  behaviour change a reader could notice, and it is pinned in
  `noteParser.test.ts` as an explicit case.

~~`StudyWorkbench.tsx:26`'s `ANY_TAG` widens to the same pattern in the same
commit.~~ **DEFERRED to slice B (2026-09-01)** — with the reasoning, because
this looked like a correctness requirement and is not. `ANY_TAG` (and the two
further copies in `BookDetailPage.tsx`: `LEADING_META` at `:75` and
`CATEGORY_TOKEN` at `:772`, which this brief missed) only diverge from the
parser for a key outside the four. Nothing can create such a key until slice B,
and for a stray `@word` typed in prose those copies behave **exactly as they did
before slice A** — they never matched it either. So the divergence is
pre-existing and unchanged, not introduced here. It must close in slice B, in
the same commit as the create affordance, or setting a category on a note that
already carries a custom one will append rather than replace.

---

## 4. The UI

Nothing visible until you engage. That is already the shipped pattern — the
rename affordance in `CategoryMenu.tsx:117-137` is hidden until hover or focus,
and its file comment cites Notion, Linear and Todoist for exactly this. Build on
that component; do not add a settings screen. Naming happens where the name is
used.

The menu, top to bottom:

1. **A filter field**, appearing only once there are **more than six** rows.
   With four categories a filter is noise; with eight it is the fastest path.
   Typing filters the rows by label, case-insensitive, substring.
2. **The rows.** Unchanged from today: colour dot, label, check when selected.
   The hover affordance changes from the word `Rename` to a `⋯` button opening a
   small submenu: **Rename** (the existing inline edit, unchanged), **Colour**
   (a single row of the palette swatches, §5, no hex field ever), **Delete or
   Retire** (§2, using the existing `InlineDeleteConfirm.tsx`, stating the note
   count).
3. **A "Retired" divider and its rows**, only when something is archived. Each
   offers **Restore**.
4. **The create row, at the bottom.** It is absent until the reader has typed
   something the filter does not match, and then reads
   `+ Create "Typology"` — quiet, out of the reading path, and impossible to hit
   by accident while picking a category to file a note under.

Creating derives the key from the label: lowercase, spaces to hyphens,
non-`[a-z0-9-]` stripped, truncated to 24 to match the existing
`maxLength={24}` at `CategoryMenu.tsx:92`. A label that derives to an empty key
(emoji only, say) is refused inline. A key that collides with an active category
focuses that row instead of creating a duplicate; a key that collides with an
archived one offers the restore (§2).

Colour is **assigned automatically** from the next unused palette slot. Nobody
is asked to pick a colour while they are trying to write a note; changing it
later is one tap away in `⋯`.

Writes follow the path the rename already uses: publish to the shared store
first so every surface updates at once, then write through, and leave the local
value in place on failure (`CategoryMenu.tsx:60-69`). That behaviour is right
and should not be revisited here.

---

## 5. Colour

The stated blocker was that a free hex picker lets someone choose a colour that
reads in light and fails in dark. True, but §1.4 shows the deeper problem: **the
stored hex is not rendered at all.** Colour is delivered by 75 CSS selectors
keyed on the four literal keys, across 14 selector families and 8 theme blocks.
A hex picker has nowhere to put its output.

So the colour work is two changes, and the second is the interesting one.

**BUILT 2026-09-02.** §5.1 and §5.2's storage decision both shipped; what did
not is the CREATE flow §4 describes, so the picker recolours the four built-ins
and offers nothing else yet. Three things the brief did not anticipate, each
recorded where it bites:

1. **The count was 83, not 75, and it collapsed to 4.** `main.css` held 79 rules
   naming a built-in key (87 selectors) and `dark.css` 4 more (8 selectors). The
   brief missed the composer's `data-cat` family and undercounted `pill-tag-` /
   `swatch-`. After: 4 binding rules in `main.css`, and the 4 in `dark.css` left
   in place but no longer deciding anything.
2. **The component does not set the triple; a stylesheet does.** §5.1 imagined
   `style={slotVars(cat.slot)}` on each element, but the elements carrying
   `.cat-<key>` are rendered by nine components. `noteCategories.ts` writes one
   `<style>` element instead (`categoryPaletteCss`, pure and unit-tested), which
   reaches all of them and needs no component to know about colour. It is
   applied from `resolveCategories` because that is the one funnel every
   surface's list already passes through.
3. **Observation was painted from `--accent`, not `--cat-observation`, in seven
   rules** — the note-card rail, both meta labels, the @tag pill, the dropdown
   swatch, and both brackets (plus `--accent-hover` for the dark rail). The two
   tokens are the same value in every look but `paper`, whose accent is amber,
   so unifying them would have quietly changed a shipped look. `--cat-alt-*`
   preserves it; a recolour clears it. It is a quirk, not a design — in `paper`
   an observation label and an application label are currently the same colour —
   and deleting it is a one-line change whenever someone decides.

### 5.1 Stop keying CSS on the category

Replace `.cat-<key>` with a **custom property the component sets**. Each of the
14 families becomes one rule:

```css
.cat-menu-dot { background: var(--cat-c); }
.journal-note { border-left-color: var(--cat-c); }
.journal-note .journal-note-verse { color: var(--cat-c-ink); }
```

and the component sets the triple once per element:

```tsx
<span className="cat-menu-dot" style={slotVars(cat.slot)} />
// → { '--cat-c': 'var(--slot-indigo)', '--cat-c-weak': 'var(--slot-indigo-weak)',
//     '--cat-c-ink': 'var(--slot-indigo-ink)' }
```

**75 selectors collapse to 14, and they stop caring how many categories exist.**
Because the slot tokens are still resolved per theme by the cascade, all four
themes and both modes keep working with no per-category CSS anywhere. This
refactor is the whole reason the feature is affordable, and it is worth doing
even if custom categories were never built.

### 5.2 A curated palette of pairs, not a hex field

**Ten slots.** Eight is the cap (§6); ten gives two spare so nobody is forced
into a colour they dislike, and it keeps the swatch row to one line on a phone.

The four built-ins map onto slots whose light values are **exactly today's
hexes** (`indigo #6b62d6`, `green #3f8f5b`, `amber #b5732a`, `rose #c05070` —
`noteCategories.ts:22-25`), so nothing changes visually and the rows migration
`0010` may already have stored resolve by lookup.

Suggested set, chosen for hue separation at small sizes and to stay inside the
existing warm-canvas palette: **indigo, green, amber, rose, teal, violet, slate,
clay, olive, plum.** The exact hexes are a design pass, not a decision this brief
should make — what it should fix is the **rule each pair must satisfy**, which
the existing tokens already document themselves against
(`tokens.css:104-120`):

- **Field value** (`--slot-X`) — used for fills, dots, rail brackets and
  left-borders. Must reach **≥ 3:1 against its own canvas** (WCAG 1.4.11,
  non-text contrast), in every theme × mode.
- **Ink value** (`--slot-X-ink`) — used for 12px/500 text, which is nowhere near
  the large-text exemption. Must reach **≥ 4.5:1 on the category's own 12% tint
  AND ≥ 4.5:1 on the canvas**, in every theme × mode. In dark mode ink aliases
  back to the field value, which already measures 4.65–6.72:1
  (`tokens.css:185`).
- **Weak value** (`--slot-X-weak`) — the tint the ink is measured against.
  12% alpha in light, 16–18% in dark, matching what is there now.
- **Separation** — no two slots within ~25° of hue at the same lightness, or the
  dots stop being distinguishable in a picker, which is the entire point.

That is 3 tokens × 10 slots = 30 declarations per theme block, × 8 blocks. It is
a lot of lines, but it is bounded, mechanical, and exactly the price of having
four themes already. Measure each pair the way `tokens.css:117-120` records its
measurements — in a comment, with the number.

**Storage:** keep `note_categories.color` and store the **slot id** (`"indigo"`)
rather than a hex. Storing a hex means storing a light-mode value that dark mode
must then reverse-engineer, which is the original bug. `isHexColor`
(`noteCategories.ts:65`) becomes `isPaletteSlot`, validating against the palette
table, and an unknown value falls back to the built-in exactly as it does today.
For **export**, resolve the slot to its light hex — a Markdown file has no
themes.

**No hex field, now or later.** The contrast rule cannot be satisfied by a
person with a colour wheel, and a picker that silently produces unreadable text
is worse than no picker.

---

## 6. The cap

**Yes, cap it. Eight active categories including the built-ins**, matching
`note-object.md:139`.

The failure mode to design against is the reader who builds a 17-colour private
language their future self cannot read. That is not hypothetical — it is the
observed behaviour that motivated the whole note-object arc: people hand-build
colour schemes as indexes and then cannot use them. A cap is the cheapest
possible defence and it costs almost nobody anything, because eight is more
categories than any coherent reading practice sustains.

There is a second, smaller reason: eight is roughly where a picker stops being
scannable at a glance on a phone, and the picker is on the capture path.

**At the limit**, the create row stays visible and reads
`8 of 8 — retire one first`, disabled, with the count. It is not hidden. A
control that vanishes reads as a bug and generates the support question the cap
was supposed to avoid.

**Archived categories do not count.** This is what makes the cap tolerable
rather than punitive: a reader who spent a season on typology can retire it and
start on prophecy without losing a single note or hitting a wall. The cap
governs how many things you are actively filing under, which is the number that
affects legibility — not how many you have ever used.

---

## 7. Slicing

**Slice A — open the seams. Ships nothing visible.**
Generic `@tag` parsing plus the legacy alias map (`noteParser.ts`), the matching
widening of `StudyWorkbench.tsx:26`, `NoteCategory = string`, deletion of the
three `CATEGORY_LABELS` maps, the five hardcoded tag lists moved onto
`useNoteCategories()`, and the CSS custom-property refactor (§5.1). The app
looks and behaves identically when this lands.

**BUILT 2026-09-01, narrower than the paragraph above.** What actually landed:

| Slice-A item | Status |
|---|---|
| Generic `@tag` parsing + legacy alias map (`noteParser.ts`) | **done** |
| `NoteCategory = string` (`types/index.ts`) | **done** |
| Runtime replacement for the closed union (`isValidCategoryKey`, `RESERVED_CATEGORY_KEYS`, shared `CATEGORY_KEY_SOURCE`) | **done** — not in the original list; see §1.1 |
| The three `CATEGORY_LABELS` maps | **already gone** — deleted 2026-09-01 by the rename-drift fix |
| `StudyWorkbench.tsx:26` `ANY_TAG` (+ two more copies in `BookDetailPage.tsx`) | **moved to B** — see the note at the end of §3 |
| The five hardcoded tag lists in the editors | **moved to B** |
| The CSS custom-property refactor (§5.1) | **moved to B** |

Why the last three moved, and why that is safe: each of them only matters once a
key outside the built-in four can exist, and **slice A ships no way to make
one** — `resolveCategories` still drops any non-built-in stored row, so the four
built-ins remain the only categories the app offers. Doing them here would have
meant editing seven components and 75 CSS selectors for no change in behaviour,
which is the opposite of "a regression has exactly one candidate cause". They
are **hard prerequisites for slice B** and belong in the same commit as the
create affordance, not after it.

The rest of the paragraph holds exactly as written: this slice carries the risk
and the risk is silent, so the coverage went in with it —
`noteParser.test.ts` gained the unknown-key, legacy-alias, email-address,
prose-collision, over-long-key, `Object.prototype`-key and
written-under-the-old-parser cases, including an `isHighlight` assertion that a
wordless mark tagged with a key the app has never seen is still a **mark**.
`noteKind.test.ts` and `chapterNoteMarks.test.ts` were left alone (out of the
task's scope fence); the highlight case they would have covered is asserted from
`noteParser.test.ts` instead, against the real `noteKind` functions.

**This slice carries all the risk.** It touches the parser every note-rendering
surface depends on, and its failure modes are silent: a mark stops being a mark
(§1.3), a tag stops rendering as a pill, a label goes blank. It should ship
alone, with no feature attached, so that a regression has exactly one candidate
cause. Extend `noteParser.test.ts`, `noteKind.test.ts` and
`chapterNoteMarks.test.ts` with unknown-key cases first — a wordless note tagged
with a key the app has never seen must still be a highlight.

**Slice B — create.** The palette tokens (§5.2), `resolveCategories` rewritten to
carry non-built-in keys, the `+ Create` row, key derivation, automatic slot
assignment, the cap. This is the feature. It is small once A has landed.

**Carried over from A (2026-09-01), and each is a hard prerequisite:** the three
stale tag regexes (`StudyWorkbench.tsx` `ANY_TAG`, `BookDetailPage.tsx`
`LEADING_META` and `CATEGORY_TOKEN`) must widen to the parser's pattern, the
five hardcoded tag lists must move onto `useNoteCategories()`, and §5.1's CSS
custom-property refactor must land — otherwise a created category renders
colourless and cannot be replaced on a note that already carries it. Key
derivation must run its result through `isValidCategoryKey` (§1.1), which is
what stops a category keyed `all`.

**Slice C — retire and restore.** `archived_at`, the `⋯` submenu, the two-form
delete confirm, the Retired divider, key-collision-offers-restore. Separable
from B on purpose: a reader can add categories for a while before they need to
remove one, and the archive semantics deserve their own review.

**B's CREATE HALF AND C BUILT TOGETHER, 2026-09-03.** They shipped in one slice
because C's storage model rewrites the same function B's create half rewrites:
`resolveCategories` had to carry non-built-in keys AND learn a fourth state, and
splitting that across two commits would have meant writing it twice. What
landed:

| Item | Where |
|---|---|
| `resolveCategories` carries custom keys, drops retired ones | `resolveAllCategories` / `resolveCategories`, `noteCategories.ts` |
| Key derivation + automatic slot assignment + the cap | `deriveCategoryKey`, `nextPaletteSlot`, `planCategoryCreate`, `MAX_ACTIVE_CATEGORIES` |
| `archived_at` | migration `0011_note_categories_archive.sql`, both api implementations |
| The `⋯` submenu, the Retired divider, the two-form confirm, the create row | `CategoryMenu.tsx` |
| Key-collision-offers-restore | `planCategoryCreate`'s `restore` branch |

Three decisions worth recording, because none of them is in the paragraphs
above:

1. **The retired set reaches the menu through the SAME funnel the palette
   does.** `resolveCategories` returns the ACTIVE set — that contract is what
   every picker, composer and filter already renders, and widening it would have
   offered retired categories everywhere. The retired set is published as a side
   channel (`archivedCategories()`) off the one call the shared store makes on
   load and on every save, for the reason `applyCategoryPalette` is written the
   same way: a second fetch inside the menu would read the same rows a beat
   later and could disagree with what the rest of the app is showing.
2. **`archived_at` is on a NEW `StoredCategoryDef`, not on `NoteCategoryDef`.**
   The field is optional, so the two types are mutually assignable and the ~47
   call sites that pass definitions around kept compiling untouched.
3. **KNOWN GAP, deliberately left: a retired category's LABEL falls back to its
   KEY where an existing note renders.** §2 says archive "keeps supplying its
   label and colour wherever an existing note renders", and the COLOUR half is
   done — `applyCategoryPalette` paints retired categories too, so a note filed
   under one still renders in its own colour. The label does not, because
   `useCategoryLabels()` derives from the ACTIVE list and
   `src/utils/useNoteCategories.ts` was outside this task's scope fence. It is
   invisible for a retired BUILT-IN (whose key is its label lowercased) and
   shows as a lowercased key only for a category that was RENAMED and then
   retired. The fix is one line in that file — a `useAllCategoryLabels()` that
   folds `archivedCategories()` in — and belongs to whoever owns it next.

**Slice D — the filter field, plus the export label fix
(`export.ts:92`).** Only worth doing once someone actually has seven categories.

**BUILT 2026-09-03, ahead of order, scoped to what does not need slice B's
create affordance.** The Journal category filter (`JournalPage.tsx`) now
derives its options from `categoriesPresent` (over the notes actually shown,
not the active definitions list) rather than mapping `useNoteCategories()`
directly, so a category that is archived or deleted outright still offers
itself as a filter for the notes that carry it, and its label is looked up
fresh each render so a rename is reflected immediately. `export.ts:92` no
longer writes `note.category` (the key) into the Markdown meta line; a new
`resolveExportCategories` (export.ts) resolves the reader's stored category
rows to their current label and colour — including a non-built-in key, which
`resolveCategories` still drops until slice B's create half ships — and a key
with no definition at all (fully deleted) falls back to itself rather than
being dropped. The stored colour resolves to its light hex in `notes.json`
exactly as it already did for the four built-ins. No UI exists yet to actually
CREATE a custom category (that is still slice B), so this was verified by
writing a custom-keyed row directly through `saveNoteCategories` and a note
carrying that `@tag` through the composer's raw text, the same path a note
written on another device or before its category existed would take.

Order matters and it is A → B → C → D. Anything else means shipping a feature on
top of a parser that cannot see it. D's two fixes turned out to be an
exception: both are read-side (filter, export) and neither needs a way to
CREATE a category, so they were safe to build ahead of B/C without contradicting
the ordering's reasoning.

---

## 8. Backlog entry (pasteable)

~~Editing `docs/BACKLOG.md` is out of scope for this brief.~~ **Pasted
2026-09-01** with slice A marked built. Kept here for the record:

```markdown
- **User-owned categories, slice 2: ADD AND REMOVE.**
  `docs/proposals/custom-categories.md`. Rename shipped because the KEY never
  moves; adding a key does. The four keys are compiled in — a closed union in
  `src/types/index.ts:2` (47 uses), a fixed regex in `src/utils/noteParser.ts:4`
  with a second copy at `src/components/StudyWorkbench.tsx:26`, five hardcoded
  tag lists in the editors, and 75 `.cat-<key>` CSS selectors across 14 selector
  families and 8 theme blocks. `NoteCategoryDef.color` is stored but rendered
  nowhere: `CategoryMenu.tsx:87` paints from a CSS class, not the hex, so the
  "recolour" half of slice 1 never actually shipped.
  Decided: the parser parses `@tags` GENERICALLY and validates afterwards (keeps
  it pure, and fixes a live bug where an unknown tag makes a wordless highlight
  read as a note whose text is "@typology" — `src/utils/noteKind.ts:41-49`).
  Deleting a category with notes on it ARCHIVES rather than removes: notes keep
  their key, label and colour, nothing is rewritten, restore is offered on key
  reuse; zero-note categories hard-delete. Colour is a curated palette of 10
  light/dark SLOTS assigned automatically, never a hex picker — each pair must
  hit 3:1 non-text on canvas and 4.5:1 ink on both tint and canvas, in all four
  themes × both modes. Cap 8 ACTIVE, archived excluded.
  Four slices, in order: (A) open the seams — generic parser, `NoteCategory =
  string`, CSS keyed on a custom property instead of the category, no visible
  change and ALL of the risk; (B) create + palette + cap; (C) retire/restore;
  (D) the filter field + export the label rather than the key
  (`src/platform/export.ts:92`).
```

---

## 9. Open questions

1. **Should archiving a built-in be allowed?** This brief says yes, and it is
   the case that forces an explicit archived row rather than "absence means
   default" (`noteCategories.ts:11-18`). If the answer is no, the storage model
   gets simpler and a reader who never writes historical notes keeps staring at
   the word.
2. **Ten slots or eight?** Ten gives choice; eight means the palette and the cap
   are the same number and "you have used every colour" and "you are full" are
   the same message, which is arguably clearer.
3. **Do custom categories sync a colour, or a slot, across a group?**
   `groups-shared-workspaces.md` has two people naming the same key. Out of
   scope here because `note_categories` is already keyed on `workspace_id`
   (migration `0010`), but it decides whether the palette is per-workspace or
   per-person.
4. **Does the `@`-matches-more-text change (§3) bother anyone in practice?**
   It is the one user-visible behaviour change in slice A and the cheapest thing
   to revert if it does. **Shipped 2026-09-01 in its narrowed form** — the
   leading word-boundary guard removed the email-address case, so what remains
   is a bare `@word` in prose rendering as a neutral pill. Pinned by a named
   test in `noteParser.test.ts` ("DOES treat a bare @word in prose as a tag —
   the one visible change"), which is the line to delete if the answer turns out
   to be yes.

## Files read for this brief

`src/types/index.ts`, `src/utils/noteParser.ts`, `src/utils/noteCategories.ts`,
`src/utils/useNoteCategories.ts`, `src/utils/noteKind.ts`,
`src/utils/chapterNoteMarks.ts`, `src/utils/journalFilters.ts`,
`src/utils/richText.ts`, `src/components/CategoryMenu.tsx`,
`src/components/StudyWorkbench.tsx`, `src/components/BookDetailPage.tsx`,
`src/components/NoteEditor.tsx`, `src/components/RichEditInput.tsx`,
`src/components/InlineTagInput.tsx`, `src/components/JournalPage.tsx`,
`src/components/ReadingMode.tsx`, `src/api/types.ts`, `src/api/berean-api.ts`,
`src/api/memory.ts`, `src/platform/export.ts`, `src/offline/mirror.ts`,
`src/assets/tokens.css`, `src/assets/main.css`, `src/assets/dark.css`,
`supabase/migrations/0010_note_categories.sql`, `docs/proposals/note-object.md`
(§3), `docs/BACKLOG.md` (read for status only — not edited, out of scope).
