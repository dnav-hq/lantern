# Is a `study_id` column actually needed?

**SUPERSEDED 2026-08-26 — resolved by the note-centric model, not by this
proposal's own recommendation.** This proposal argued (correctly, at the time)
that `study_id` was unneeded because `passage_id` already provided the grouping
it would add. The model has since moved further: "study" is no longer a
container a user creates or reopens at all — see the "Notes & studies model"
section and the "Note-centric model" decision-log entry in
`docs/ARCHITECTURE.md`. There is no "study instance" concept left for a
`study_id` (or the `passage_id` this proposal defends) to disambiguate; a note
anchored to scripture is the only saved unit, and "study" is a derived view over
notes. The `passages`/`sessions` tables this proposal reasons about are now
interim, invisible storage, slated for retirement in `docs/BACKLOG.md`'s
deferred cleanup (which also denormalises book/chapter onto `notes`). Kept below
for its research value (the live-driven proof that the old model already
supported multiple overlapping passages), not as live guidance.

---

**Original recommendation (superseded, kept for history): no. Recommendation is
(a) — no schema change.** The backlog item
(`docs/BACKLOG.md`, "Multiple study instances over the same verses") describes
a feature that, once you actually drive the running app, turns out to already
exist. `notes -> sessions -> passages` already provides exactly the grouping
`study_id` would add, and the "cumulative merge by anchor overlap" half of the
proposal is already the default behaviour of the reading view. The one real
gap is a single UI affordance, not a migration.

This was verified against the running dev server (in-memory stub, no
`.env` present in this checkout so no moving-aside was needed) with
Playwright, not just by reading source. Screenshots referenced below are in
the run's `screenshots/` artifact.

## 1. Does `passage_id` already provide what `study_id` proposes?

Yes. Per `supabase/migrations/0001_init.sql`:

```
notes.session_id -> sessions.id
sessions.passage_id -> passages.id
```

`docs/ARCHITECTURE.md` states the model explicitly: "A study is one
deliberate effort — a `Passage`." A `Passage` row already *is* the group
stamp the backlog item wants to add. Two notes belong to "the same study" iff
they resolve (through their session) to the same `passage_id`. Two notes
belong to "different studies over the same verses" iff they resolve to
*different* `passage_id`s whose verse ranges happen to overlap. Both of those
are queries the schema already answers — nothing about them requires a new
column on `notes`.

## 2. The `findOverlappingPassage` lead — confirmed

`BookDetailPage.tsx`'s `findOverlappingPassage` (used by both "Start study on
{ref}" from a verse-range selection, and "Study chapter") deliberately reopens
the first existing `Passage` whose range overlaps the selection, instead of
creating a new one — see the comment at `BookDetailPage.tsx:33-39` and
`ReadingMode.tsx`'s "Start study on {ref}" (`handleStartStudyOnSelection`),
which calls `onOpenStudy()` unconditionally (it's always inside an existing
passage already).

**Live evidence (screenshots `A1`–`A3`):** with the seeded John 1:1-5 passage
present (3 existing notes), selecting verses 1-5 in the Bible reading view and
clicking "Start study on John 1:1-5" opens `StudyMode` **pre-populated with
the 3 existing notes** (`v1`, `v3`, `v4-5`) — not a blank editor. This
confirms the premise: the selection-driven entry points always reopen.

**But `StudyMode.ensureIds()` (`StudyMode.tsx:268-299`) reveals the other
half:** when `initialPassageId` is *not* set — i.e. when a study is opened via
the global "+ Study" button and a reference is typed by hand — `ensureIds()`
calls `api.createPassage(...)` **unconditionally, with no overlap check at
all.** `findOverlappingPassage` is only wired into the two selection-driven
buttons in `BookDetailPage`; it is not called anywhere in `StudyMode`,
`App.tsx`, or the search flow.

**Live evidence (screenshots `A4`–`A7`):** starting from 4 seeded studies,
using "+ Study" and typing "John 1:1-5" by hand (overlapping the existing
seeded passage exactly) and saving one note produced a **second, fully
distinct `Passage` row**. The Journal went from "4 studies" to "5 studies"
and now lists **two separate "John 1:1-5" cards** — one dated Jun 10 with 4
notes (the original), one dated Jul 20 with 1 note (the new one) — with
independent `passage_id`s, independent sessions, and independent notes. No
schema change was involved in producing this; it is what the code already
does today.

**Conclusion on the lead: confirmed exactly as suspected.** The only thing
preventing a *second, distinct* study over already-studied verses is that
`findOverlappingPassage` is wired into the two convenience buttons in
`BookDetailPage` (verse-selection "Start study on {ref}" and "Study
chapter"). The capability to create a distinct second study already exists
in the same running app via "+ Study" — it just isn't offered as a choice
from the in-context buttons, which always assume "reopen" is what you want.

## 3. Does the reading view already merge notes by anchor overlap?

Yes, for the surface `docs/ARCHITECTURE.md` calls cumulative. There are two
different "reading" surfaces in this app and they behave differently by
design:

- **`ReadingMode`** (opened from a Journal card / a specific study) calls
  `api.getNotesByPassage(passage.id)` — strictly scoped to one `passage_id`.
  This is deliberate: `ReadingMode` is the per-study view. Live evidence
  (screenshot `A6`): opening the freshly-created second study shows **only**
  its own note, not the original study's 4 notes. Correct and intentional
  per the architecture doc ("Editing an existing study never spawns a new
  Journal entry... a new entry appears only when you deliberately start a new
  study").
- **`BookDetailPage`'s `ChapterView`** (the Bible-library reading surface,
  reached via Bible → book → chapter) calls `api.getNotesByBook(bookNumber)`,
  which aggregates notes across **every** `Passage` in that book, then
  filters to the current chapter. This is the surface `ARCHITECTURE.md`
  calls cumulative ("every note anchored in a chapter renders inline there...
  regardless of which passage/session created it").

  **Live evidence (screenshot `A8`):** with both John 1:1-5 studies now
  existing (the original 4-note passage and the new 1-note passage from step
  2), navigating to Bible → John → chapter 1 — *without* reloading the page,
  so both passages' data is live in the same in-memory store — renders
  **both studies' notes together**, each anchored to its own verse: the v1
  and v3 observations and the v4-5 personal note from the *original* study,
  interleaved with `v2 This is a SECOND distinct study anchored to verse 2`
  from the *new* study. They appear side-by-side under their respective
  verses with no visual indication (and no code path) distinguishing which
  passage each came from — which is exactly "merge by anchor overlap."

**Conclusion: merge-by-anchor-overlap is not a new feature to build. It is
the existing, default behaviour of `getNotesByBook` / `ChapterView`, and it
required zero schema work to produce** — both studies were created through
the current schema and UI.

## Recommendation

**(a) No schema change. If anything, a small UI change — and arguably not
even that.**

The capability the backlog item asks for — "let me deliberately start a new,
distinct study over verses I've already studied, and see notes from related
efforts merged by anchor when reading" — already exists in the running app
today, end to end, via the global "+ Study" button plus the existing
`ChapterView` cumulative surface. No `notes.study_id` column, no migration,
no threading through `BereanApi`/`memory.ts`/`berean-api.ts` is needed,
because `passage_id` (reached via `session_id`) already *is* the group stamp,
and the merge-by-overlap reading behavior is already default.

The one genuine gap: `BookDetailPage`'s in-context "Start study on {ref}" /
"Study chapter" buttons only ever offer "reopen the existing study" — they
never surface "start a new, distinct one instead" as a second option, even
though that path already works via "+ Study". If Dennis wants that
discoverable from the Bible-reading flow (rather than requiring the user to
know to use the separate "+ Study" button and retype the reference by hand),
the fix is a small UI branch, entirely in `BookDetailPage.tsx`:

- When `findOverlappingPassage` finds a match, show **both** actions in the
  verse-action-bar / chapter-header instead of collapsing straight to
  "reopen": "Continue [existing reference]" (current behavior, unchanged) and
  "Start a new study on {ref}" (call `onStudyChapter(selReference)` /
  `onStudyChapter(...)` **without** passing `existing.id`, i.e. the same code
  path "+ Study" already takes).
- No prop or interface changes needed — `onStudy`/`onStudyChapter` already
  accept an optional `passageId`; simply don't pass it for the "new" action.

**Estimated diff for the UI-only follow-up (if wanted at all):**
- `src/components/BookDetailPage.tsx`: ~20–40 changed lines — branch the two
  existing call sites (`handleStartStudyOnSelection`, the "Study chapter"
  button handler) to show a second button when `findOverlappingPassage`
  returns a match, and wire its `onClick` to the no-`passageId` path.
  Possibly a couple of small CSS tweaks for a two-button action bar.
- No changes to `src/api/**`, `supabase/**`, or any other component.
- Effort: small (well under an hour of focused work); no migration, no data
  backfill, no `BereanApi` interface change.

This is optional polish, not a blocker — the underlying capability (distinct
studies, cumulative merged reading) is real and working today without it.
Given that, **(c) "don't build anything" is also a defensible call**: the
backlog item can simply be marked done/moot rather than turned into a
follow-up task, since the described user-facing outcome is already
achievable. I lean slightly toward keeping the small optional UI item on the
backlog (discoverability), but the schema half of the item should be struck
entirely.

## What to do with the backlog entry

`docs/BACKLOG.md`'s "Multiple study instances over the same verses" entry
should be rewritten (in a separate change, out of scope here) to drop the
`study_id`/migration language entirely and, if kept at all, describe only the
small optional `BookDetailPage` UI branch above.

**Update 2026-08-26:** overtaken by events rather than done as described above.
The note-centric model removed the "study instance" concept the entry was about
(see the SUPERSEDED note at the top of this file), so there is no longer a
"multiple distinct studies over the same verses" question to answer —
`docs/BACKLOG.md` has been updated accordingly rather than rewriting this old
entry in place.
