# World-class pass — 2026-09-18

Dennis asked for a deliberate evaluation of the live app after a run of feature
work: whether it still keeps to the design philosophy, whether anything breaks
the flow, whether implementations are wrong, and what small details are missing.
Walked as a guest on a 390×844 phone viewport and on desktop, through every
reachable flow: landing, library, chapter, select, dive in, highlight, note,
journal, profile, search, study.

**Every finding below was fixed the same day, on main** (see docs/BACKLOG.md
for the list). The findings stay here as they were written, ranked by how
much each cost a first-time reader, so the reasoning survives the fixes.

---

## The one structural finding

**The app's identity had drifted because "tap a verse" meant three things.**
Read: select and act. Study: aim the note. Mobile: select and compose. Each
new feature attached to whichever meaning it was built against. Resolved
today with one sentence in the decision log (docs/ARCHITECTURE.md): choosing
a verse always shows what is beneath it and what you can do with it. Study now
shows the dive-in body under the note; the gutter marks which verses have
depth. Every item below is judged against that sentence.

---

## Findings, most costly first

### 1. Searching for a word finds nothing, and the page did not say why
Typing "faith" returns "no match" on a black screen. Search finds references
and your own notes; it has never searched the text of Scripture (deferred in
docs/BACKLOG.md). A first-time reader does not know that, and this is the
single most common thing a person does with a Bible app.
- Fixed today: the empty state says what search finds.
- Still open: scripture full-text search itself. BSB ships complete in
  `public/bible/bsb.json.gz`, so an in-browser word index is possible with no
  backend. This is the biggest gap between Lantern and "world-class".

### 2. On mobile, the note composer hides the verse you are writing about
Tap Note under a selected verse and the composer opens where the verse was;
the verse scrolls above the fold. The reader writes about a sentence they can
no longer see. Against the product principle that notes must feel effortless.
- Change: pin the chosen verse's text at the top of the composer (one line,
  clamped), or scroll so verse and composer share the screen. Files:
  `MobileNoteComposer.tsx`, `BookDetailPage.tsx`.

### 3. A highlight renders an empty note row under the verse
Highlighting verse 6 as Observation paints the verse, labels it OBSERVATION in
the row, and then adds a second "OBSERVATION · Genesis 15:6 · just now" line
beneath it with no body. Highlights are bodiless notes by design, but showing
the empty body is noise: the label on the verse already says everything.
- Change: an inline note row renders only when the note has a body; a bare
  highlight is the verse's own tint and label. Files: `BookDetailPage.tsx`
  (inline notes group), `ReadingMode.tsx`.

### 4. The highlight menu covers the verse being highlighted (mobile)
The category menu opens upward from the action bar and lies over the selected
verse and the dive-in line. The reader picks a colour for text they cannot see.
- Change: open the menu above the bar but cap its height so the selected verse
  stays visible, or scroll the verse to sit above the menu when it opens.
  File: `MobileSelectionBar.tsx` / `CategoryMenu.tsx`.

### 5. A guest on desktop cannot reach Profile or Settings
Desktop replaces the avatar menu with a "Sign in" button for guests, and the
bottom nav (the only other route to Profile) is hidden above 768 px. So a
desktop guest cannot reach Settings, Export notes, or the app version. The
display-settings popover covers reading preferences, but not the rest.
- Change: give the guest state the same menu host, with "Trying Lantern",
  Profile, Settings, and Sign in as items. File: `NavBar.tsx`.

### 6. The full map has no entrance
The dive-in card is the map now, so `MapView.tsx` (pan/zoom world map, place
cards, confidence legend, unlocated list) is reachable only by `?map=`.
- Decide: retire it, or restyle it to the card's paint and give it one quiet
  way in (from the card, "the whole map"). The parked parchment atlas task is
  superseded either way.

### 7. Small details
- The chapter strip does not recentre on the current chapter after a viewport
  change (showed 3–9 while reading 15). `BookDetailPage.tsx`.
- The "Tap a verse to select it" hint appears on every chapter open for a guest.
  Once per session is enough. `BookDetailPage.tsx`.
- Journey gap notes in `scripts/data/journeys.yml` contain "--" and show in the
  map caption. Replace with plain punctuation.
- `src/utils/doorways.ts` is no longer used by the entrance; delete with its
  test once the word door's presence row is decided.
- The one standing lint error, `richText.ts:72`, predates this work.

---

## What holds up

- No console errors and no failed requests anywhere walked, both viewports.
- The reading page itself: type, measure, verse selection, the chapter strip,
  the display settings popover, and the Journal are calm and coherent.
- The dive-in, after today's fixes: one entrance, one sheet, data-bounded
  content, motion on the app's tokens. It now obeys the grammar in every mode.
- Guest mode is honest: "Trying Lantern · Nothing here is saved yet", export
  works, sign-in is one tap away.

## On ESV

A recommendation, since Dennis raised it. Keep ESV for now, but make its terms
visible where the reader chooses it: a small "online only" tag beside ESV in
the translation selector, with the one-line note the footer already carries.
The reasons: the HQ goal to obtain a negotiated licence is open and ESV is the
relationship that exists; removing it before that answer lands closes a door
for free; and the one real user signal so far (a friend reading BSB) says the
absence of a familiar translation is the thing to watch, not the presence of
one. If the licence route fails, remove ESV then, with the tag having already
told readers what it was. The freeze on paid features and donate buttons stays.
