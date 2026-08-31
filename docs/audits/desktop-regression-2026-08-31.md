# Desktop regression sweep — 2026-08-31

Dennis opened Lantern on a desktop for the first time in months and found five
problems before he had finished looking. That is a coverage signal, not bad
luck, so this is the deliberate sweep of everything else the desktop layout can
reach.

**This is a findings report. Nothing was fixed.** Five fixes are already queued
and own most of the files involved; a change here would collide with them. Every
finding below names the queued task that would cover it, or says plainly that
none would.

The headline: **no console errors and no failed network requests anywhere** —
every surface, every width, both themes. The desktop is not broken in the loud
way. What it is, is *unmaintained*: two whole affordances lead nowhere, one
shared preference stops propagating at the desktop-only surface, and the
signed-out page never learned about dark mode. The last section argues that all
of that has one cause.

---

## How this was run

- Real Chromium (Playwright 1.62), against the dev server on this checkout.
- Three viewports, each **loaded fresh at its target size** — never resized
  after load: **1440×900** (wide desktop), **1024×768** (narrow laptop — note
  this is *below* the 1160px the Study workbench needs), **820×1024** (tablet,
  just above the 768px mobile breakpoint).
- Both themes, applied the way the app applies them (`berean-theme` in
  localStorage before first paint, plus a matching OS `prefers-color-scheme`):
  **Lantern** (light) and **Lantern Dark**.
- 126 surface visits in the main sweep, plus targeted follow-ups for the
  selection bar, Settings, the Journal filters, the category rename, and the
  signed-out path. Console output, page errors, failed requests and every
  4xx/5xx response were collected per surface.
- No `.env` in this checkout, so the app runs on the in-memory stub with its
  seed data (4 books, 4 passages, 10 notes) and the dev fixture scripture
  provider. The signed-out surfaces were reached by running a second dev server
  with placeholder Supabase env vars, which puts Root on the auth-gated path.

---

## Findings

Most severe first. Severity is **broken** (the thing cannot be done),
**degraded** (it can be done, but wrongly or only by luck) or **cosmetic**.

---

### 1. The Profile page cannot be reached on desktop at all — **broken**

`ProfilePage` renders perfectly. There is simply no way to open it above 768px.
Its only entry point is the Profile tab in `.bottomnav`, and `.bottomnav` is
`display: none` outside the `max-width: 768px` block. The desktop avatar menu
offers Settings, Export notes, Install app and Sign out — no Profile.

So on a desktop these are unreachable: the workspace identity ("Personal
workspace" / "Trying Lantern"), the "Nothing here is saved yet" guest framing,
the guest sign-in call to action, the "Your notes are yours" reassurance, and
**the app version number** (`Lantern v2.0.0-dev`) that was added on 2026-08-28
specifically so a version could be read off a running app.

**Repro** — 1440×900, either theme, at any width ≥769px:
1. Open the app. 2. Look at the top bar: Bible, Journal, + Study, search,
avatar. 3. Open the avatar menu: Settings, Export notes. 4. There is no Profile
entry, and no bottom nav. The page exists — forcing the same navigation the
mobile tab performs renders it correctly, which is how the content above was
read.

**Widths/themes**: every width ≥769px, both themes.
**Probably lives in**: `src/assets/main.css:872` (`.bottomnav { display: none }`,
re-shown only under `max-width: 768px` at :5807), `src/components/NavBar.tsx`
:363–410 (the desktop menu, which has no Profile item),
`src/App.tsx:465` (`destination === 'profile'` renders it fine).
**Queued task that covers it**: none. `92f13b07` touches the install nudge, not
the menu's contents.

---

### 2. "+ Study" is a dead control between 769px and 1159px — **broken**

The Study workbench needs 1160px (`STUDY_QUERY` in `App.tsx:65`, mirrored by
`.study-toggle`'s media query). Below that, `canStudy` is false and the Read/
Study toggle is correctly hidden. **The "+ Study" nav tab is not hidden.** It
stays in the top bar at 1024px and 820px, looks like a primary destination, and
does nothing at all when clicked: `openStudyHere()` calls
`setStudyOpen(canStudy)` — that is `setStudyOpen(false)` — and returns.

No feedback, no navigation, no explanation. The shell's class list is byte-for-
byte identical before and after the click (verified at both widths, both
themes: `app-shell reading-surface` → `app-shell reading-surface`). At 1440 the
same click correctly adds `study-open`.

**Repro** — 1024×768 (or 820×1024), either theme:
1. Open a book so you are on the reading page. 2. Click **+ Study** in the top
bar. 3. Nothing happens. Repeat at 1440×900 and the workbench opens.

**Widths/themes**: 769–1159px, both themes. Correct at ≥1160px.
**Probably lives in**: `src/App.tsx:286–308` (`openStudyHere`), `:65`
(`STUDY_QUERY`), `src/components/NavBar.tsx:316` (the tab is rendered
unconditionally in the desktop top bar), `src/assets/main.css:7503` (the toggle's own width gate).
**Queued task that covers it**: none.

---

### 3. Renaming a category does not reach the reading page or the workbench — **degraded**

Categories became renameable in place (2026-08-31, `d35e306`). The rename
publishes through a shared store, `useNoteCategories`, whose own header comment
records that per-component copies caused exactly this bug once already. Three
components still keep a **private hardcoded `CATEGORY_LABELS` map** and never
subscribe:

| File | Line | Renders |
|---|---|---|
| `src/components/StudyWorkbench.tsx` | 29, 35 | the workbench's category chips and each note's label — **desktop-only surface** |
| `src/components/BookDetailPage.tsx` | 45 (used at 868, 1153, 1229) | the category chip on every note card in the reading page |
| `src/components/ReadingMode.tsx` | 43 (used at 596, 674) | the same chip in Reading Mode |

`BookDetailPage` *does* call `useNoteCategories()` (line 335) — but only for the
verse mark label at line 1515. The note cards two hundred lines below it use the
hardcoded map.

**Repro** — 1440×900, light (theme is irrelevant):
1. Open Genesis 1. 2. Click a verse, then **Highlight**. 3. Hover the
*Observation* row and click **Rename**. 4. Type `Context`, press Enter. 5. The
menu now says Context. 6. Press Escape and look at the note cards in the reading
column — still `OBSERVATION`. 7. Switch to **Study**. The chips still read
Observation / Historical / Application / Personal, and the note labels still say
`OBSERVATION`. (Run verbatim; the values above are what came back.)

**Widths/themes**: all, both. The workbench half only exists ≥1160px.
**Probably lives in**: the three hardcoded maps above; the fix is
`useNoteCategories()` in each, exactly as `JournalPage`, `MobileNoteComposer`,
`MobileSelectionBar` and `CategoryMenu` already do it.
**Queued task that covers it**: **none, and it looks like one does.**
`afc5fce6` ("category rename is missing from the note tag picker") is about
adding the Rename *affordance* to the composer's tag menu, and its
`files_in_scope` is `MobileNoteComposer.tsx` + `CategoryMenu.tsx`. It would not
touch any of the three files above. This is a separate fix.

---

### 4. The highlight menu covers the "Quick note" button below ~1160px — **degraded**

With verses selected, opening **Highlight** drops a category menu over the
selection bar. At 1440 the bar is wide enough that the menu sits clear of the
buttons. At 1024 and 820 the bar has already wrapped to three rows and the menu
lands **on top of the primary action**: hit-testing the centre of the "Quick
note" button returns `span.cat-menu-label`, not the button. The click does not
reach it; you have to dismiss first.

Escape does dismiss the menu — but it clears the entire selection with it, so
the recovery is "start again", not "close this menu".

**Repro** — 1024×768, light:
1. Open Genesis 1, dismiss the selection hint. 2. Click verse 3. 3. Click
**Highlight**. 4. Try to click **Quick note** — the pointer lands on the menu.
5. At 1440×900 the same sequence works.
Evidence: `picker-escape-1024.png` vs `picker-escape-1440.png`.

**Widths/themes**: 769–~1159px, both themes.
**Probably lives in**: `.verse-action-hl` / `.cat-menu` positioning in
`src/assets/main.css` (~2801 for `.verse-action-btns`), and the picker toggle in
`src/components/BookDetailPage.tsx:1643`.
**Queued task that covers it**: `405c144b` is adjacent — it owns
`BookDetailPage.tsx` and `main.css` and removes the Alt hint, which is roughly
200px of the reason the bar wraps in the first place. It may well fall out. It
is not the same bug, though: the menu is positioned relative to a wrapped
button, so **re-check this one after that task ships** rather than assuming.

---

### 5. The Bible library cannot be used with a keyboard — **degraded**

Every book row is a `<div>` with an `onClick` and nothing else — no `role`, no
`tabIndex`, no key handler (`BibleLibrary.tsx:61–64`; confirmed live:
`{"tag":"DIV","tabindex":null,"role":null}`). Tabbing through the reading app
goes search → avatar → Library → reading controls → chapter pills; the 66 books
are not in the sequence at all. Screen readers get 66 unlabelled divs.

This is a desktop problem specifically: a keyboard is the desktop's input
device, and the library is the app's front door.

**Repro** — 1440×900, either theme:
1. Load the app on the library. 2. Press Tab repeatedly. 3. Focus never enters
the book grid; there is no way to open a book without a pointer.

**Widths/themes**: all, both.
**Probably lives in**: `src/components/BibleLibrary.tsx:61–64` (a `<button>`, or
`role="button"` + `tabIndex={0}` + Enter/Space).
**Queued task that covers it**: none.

---

### 6. A failed export is silent on desktop — **degraded, code-read only**

Stated honestly: this one was **not reproduced in the browser**, because forcing
the zip build to fail is not something the UI can be driven into. It is a
difference in two code paths that both exist today.

Both entry points call the same `exportAllNotesAsZip`. `ProfilePage.tsx:33–42`
catches a failure into an `error` state and renders `.profile-page-error`.
`NavBar.tsx:113–121` — the desktop avatar menu, the *only* export a desktop user
can reach given finding 1 — logs to the console and sets the label back to
"Export notes". A desktop user whose export fails sees the menu item flicker and
nothing else, and will reasonably assume it worked.

**Repro** (not run): throw inside `exportAllNotesAsZip`, then export from the
desktop avatar menu vs. from the mobile Profile page, and compare what the UI
says. The happy path *was* exercised — `lantern-notes-2026-08-31.zip`
downloaded correctly at all three widths, both themes.

**Probably lives in**: `src/components/NavBar.tsx:113–121`.
**Queued task that covers it**: none.

---

### 7. Search-result timestamps are all but invisible in light — **cosmetic**

`.note-timestamp` is painted with a **hardcoded `#c4c1ba`**
(`src/assets/main.css:2345`) rather than a token. `dark.css:35` overrides it to
`var(--text-faint)`, so dark is fine (measured `rgb(122,114,100)`). Light was
never given the same treatment: `#c4c1ba` on the `#fbf9f4` result surface is
**1.71:1** at 10px. See `search-timestamp-light.png` next to
`search-timestamp-dark.png` — the "Jun 16" is barely there.

This is the "fails to carry in one theme" case the sweep was asked to look for,
and it is on a surface the desktop shows more than mobile does: the top-bar
search box is desktop-only.

**Repro** — 1440×900, **light only**:
1. Click the top-bar search. 2. Type `God`. 3. Look at the date on the right of
each note result.

**Probably lives in**: `src/assets/main.css:2342–2348` (use `--text-faint`, as
dark already does), and the same literal wherever `.note-line-timestamp` copies
it (~:1781).
**Queued task that covers it**: none.

---

### 8. The signed-out landing page ignores dark mode — **cosmetic**

`landing.css`'s header says dark mode "comes for free" because it is keyed on
`body.dark`. It is not free: `body.dark` is applied by `useDarkMode`, which
lives inside `App`, and the signed-out route renders `Landing` **instead of**
`App`. The boot script in `index.html` reads the same preference but only sets
the `--boot-*` splash variables and the `theme-color` meta.

Net effect for a dark-mode visitor who is signed out: a dark boot splash, then a
fully light landing page. Verified with `berean-theme=dark` *and*
`prefers-color-scheme: dark` — `document.body.className` is `""`
(`landing-1440-dark.png` is indistinguishable from the light capture).

**Repro** — any width, dark:
1. Set dark (or use a dark OS). 2. Open the app signed out. 3. The splash is
dark; the landing that replaces it is light.

**Probably lives in**: `src/Root.tsx:130–145` (the `signedOut` branch — apply
the stored preference there, or hoist the hook above the phase switch),
`index.html:32–48`, `src/assets/landing.css:12` (a comment that is currently
untrue).
**Queued task that covers it**: none.

---

### 9. Everything painted `--text-faint` sits at 3.01:1 — **cosmetic, and a decision, not a bug**

`--text-faint` (`#938a77` light) resolves to **3.01:1** on the canvas, under the
4.5:1 AA needs for text below 18.66px. It carries: verse numbers, the "CHAPTER
n" rule, the Old/New Testament labels, the `BSB` translation-footer button, the
`aA` display-settings glyphs, the "The beginning"/"Next" chapter-flow labels,
and the Journal's bucket labels and dates. 182 distinct elements failed the
check across the sweep; almost all of them are this one token.

The token file documents `--text-muted` as "AA (~4.8:1) on cream" and
`--text-faint` as "de-emphasised labels, placeholders" — so this is deliberate,
consistently applied, and identical on mobile. It is listed because the brief
asked for text that fails to carry, not because it is a regression.

**Probably lives in**: `src/assets/tokens.css:74` and its per-theme siblings.

---

### 10. The Journal counts marks as notes — **cosmetic**

With the kind filter set to **Marks**, a chapter with one highlight and no notes
still reads "Genesis 1 · **1 note**". A mark is deliberately not a note
everywhere else in the product.

**Repro** — 1440×900: highlight a verse, open the Journal, set the kind filter
to **Marks**, read the chapter row (`journal-kind-filter-1440-light.png`).
**Probably lives in**: `src/components/JournalPage.tsx` (the chapter-row count
label).
**Queued task that covers it**: none.

---

## The five already-known issues

Not re-reported as discoveries. Only one of them turned up something that is not
already understood:

- **The note tag menu has no Rename** — queued as `afc5fce6`. See finding 3 for
  the *different* problem in the same area.
- **"New version, reload"** — queued as `81646869`. Not triggered here (no
  service-worker update in dev), so nothing new.
- **"Add to home screen" on desktop** — queued as `92f13b07`. Not triggered here
  (no real `beforeinstallprompt`), so nothing new.
- **The "Hold Alt and drag" hint overflowing the selection bar** — queued as
  `405c144b`. **New information:** the task describes this as happening "at
  narrower widths". It happens at *every* desktop width. At 1440×900 with a
  4-verse range the bar is already two rows tall (96px) with "Study these
  verses" pushed onto its own line; at 1024 and 820 it is **three rows, 137px**,
  and its content is 4px wider than its own box even with a single verse
  selected. And see finding 4 — the wrap is what puts the highlight menu on top
  of the Quick note button.
- **The desktop composer still uses the older design** — queued as `405c144b`.
  Confirmed present (`@ category · v4 verse · esc cancel`), nothing new to add.

---

## Coverage

**Exercised, all three widths, both themes** — library; book/chapter reader
(50-chapter strip, chapter flow, translation footer); the verse-selection hint;
single-verse and range selection; the desktop selection bar; the highlight
picker (including in-place rename); quick note (compose → save → render); the
Read/Study toggle and the Study workbench (≥1160px only, by design); the Journal
with **all three filters** (category, book, and the kind segment — which only
renders once both notes and marks exist, so a highlight was created to reach it)
and **both view modes** (Notes and Chapters); global search for note text and
for a scripture reference (`John 3` → "Jump to scripture"); the account menu;
Settings — **every control**: all six looks, all three text sizes, all four
translations, hide-notes, export, diagnostics, and both ways to close; export
(a real `lantern-notes-2026-08-31.zip` download at each width); Escape clearing
a selection; tab-order and focus-ring sampling.

**Exercised at 1440, both themes** — the signed-out landing page and the guest
path (`Take a look first` → guest reading, 31 verses, "Sign in" in place of the
avatar, selection bar working). The landing was additionally checked for
overflow at 1024 and 820: clean.

**Not reachable, and why**

- **The real signed-in Supabase path.** No credentials in this environment.
  Everything above ran on the in-memory stub. Data-shaped bugs (RLS, paging,
  sync) are out of this sweep's reach by construction.
- **Onboarding.** Only rendered on the signed-in first-run path.
- **The PWA update prompt and the install nudge.** Both need a real service-
  worker update / `beforeinstallprompt`. These are two of the five known issues
  anyway.
- **ESV / KJV / NET scripture.** The Settings rows were clicked and behaved, but
  the fixture provider serves BSB, so a real translation fetch was not made.
- **A note editor with existing long content, and sub-notes at `indent_level >
  0`.** The seed data has neither.

---

## What is *not* a bug — traps in this environment

Both traps the brief named were avoided by construction, and four more of my own
tooling's false positives were run down and discarded rather than reported:

- **Frozen transitions.** Every measurement was taken after an explicit settle
  delay in a real browser, and the two suspicious contrast readings were
  re-checked from **cropped screenshots** rather than trusted from the DOM.
- **Stale `matchMedia`.** No page was ever resized after load. Each of the six
  width×theme combinations opened its own browser context at its target size, so
  `useIsMobile` / `canStudy` were always correct for the width being tested.
- **`.pill-verse` "1.00:1"** — discarded. My contrast walker composited the
  translucent `--accent-weak` fill as if the backdrop behind it were opaque, so
  the verse pill read as its own colour on its own colour. The real values are
  the documented ones (`--accent-ink`, "4.53 on tint"), confirmed by cropping
  the pill in both themes.
- **`.cat-menu-rename` "1.00:1"** — discarded. "Rename" is `opacity: 0` at rest
  and revealed on hover/focus (`main.css:1385–1395`). That is the design.
- **`.study-btn-save` "2.04:1"** — discarded. The Save button was disabled
  (empty composer), so the scan measured its dimmed state.
- **`.journal-index` overflowing by 24px** — discarded. `.journal-controls` uses
  `margin: 16px -24px 0` with matching padding to full-bleed the sticky filter
  bar to the column edges. Symmetric, intended, and it produces no document
  scroll at any width.
- **The chapter deck and chapter pills reading as "off-screen"** — discarded.
  They live inside a clipping carousel and a horizontal scroll strip. The
  detector now ignores anything under a non-`visible` overflow ancestor.

---

## Why desktop drifted

The evidence supports one specific answer, and it is not "nobody looked".

**The mobile surfaces have desktop equivalents that were not updated alongside
them, and nothing in the codebase makes that visible.** Three shapes of it:

1. **Recent feature work lands on the mobile component and stops there.** The
   2026-08-31 highlight/category work (`d35e306`, `9ee7f37`) touched
   `MobileNoteComposer`, `MobileSelectionBar`, `CategoryMenu`, `JournalPage` and
   `SettingsModal`. It did not touch `QuickEditCard` or `StudyWorkbench` — the
   desktop composer and the desktop workbench. That is exactly the pair Dennis
   noticed ("the desktop composer still uses the older design") and exactly
   where finding 3 lives.

2. **The desktop-only surface is the one nobody sees.** `StudyWorkbench` only
   exists above 1160px — a width that literally cannot occur on the device
   testing happens on. It is the one component that kept a private copy of the
   category labels *after* the shared store was introduced specifically to stop
   that. A bug can live there indefinitely without a phone ever showing it.

3. **The two navs were built as mirrors and then diverged.** `ProfilePage`'s own
   doc comment says it is "the mobile Profile destination — the same actions as
   the desktop avatar menu". The mirror was maintained in one direction only:
   when the page gained a version number, a guest CTA and an error state for
   export, the desktop menu got none of them — and since the *page* has no
   desktop entry point, nobody noticed the mirror had cracked. Findings 1 and 6
   are both this.

The same shape explains finding 2 (a nav tab whose feature has a width floor the
tab does not respect), finding 4 (a popover positioned for a bar that only wraps
on desktop) and finding 8 (a signed-out route that renders `Landing` instead of
`App`, so every preference `App` owns silently stops applying).

The cheapest structural change that would have caught most of this: **make the
desktop surfaces consume the same shared sources the mobile ones already do** —
`useNoteCategories` in the three components holding private label maps, and a
single list of account actions rendered by both the avatar menu and the Profile
page. After that, a feature that lands mobile-first cannot silently miss its
desktop half, because there would no longer be two halves to miss.

---

*Swept 2026-08-31 with Playwright 1.62 / Chromium, 126 catalogued surface
visits plus targeted follow-ups. Screenshots are attached to this task's run as
workflow artifacts; filenames are cited inline above.*
