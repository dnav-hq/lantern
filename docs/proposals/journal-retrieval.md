# Retrieval — making months of notes findable before it becomes a mess

Status: **options-and-recommendation brief, not spec'd.** Written 2026-08-30.
Docs-only: no `src/` change is proposed here, only the order to build in and
what each piece costs.

The problem this brief exists for: people who use Bible-note tools for *years*
don't complain that writing a note is slow. They complain they can never find
anything again, and that what they wrote has become a mess they've given up on.
Lantern hasn't hit that wall only because it's young — and the wall gets closer
every time someone uses it well. Every note added today is a small deposit into
a debt that comes due silently, at around the point the app has finally earned
someone's trust.

## A dependency that isn't there yet

The task for this brief said to read `docs/proposals/note-object.md` first and
build on it. **That file does not exist** — not on `main`, not on any remote
branch (checked `git ls-tree` across all `origin/claude/*`), and no queued or
in-flight Lantern task produces it. It is presumably still to be written.

So this brief was written from the repo as it stands plus the one sentence of
that document's contents that was quoted to me: it defines **three related
changes — highlights as bodiless notes, user-owned categories, and retrieval**,
of which this brief covers **only retrieval**.

Two consequences, both deliberate:

- **Nothing here redesigns highlights or categories.** Where retrieval needs
  them, it names the seam and stops: "the filter list must be data-driven"
  rather than "categories should work like X."
- **Two recommendations below carry an explicit assumption** about what a
  highlight is (§3.1) and what a user-owned category is (§3.1, §5). If
  `note-object.md` lands and contradicts either, the fix is in this brief's
  filter section, not in its ordering or its data-layer analysis — those hold
  either way.

## tl;dr

1. **Build filtering first** (book · category · kind · date), entirely
   client-side over the notes the Journal already loads. Cheapest thing here,
   and it's the piece the other pieces lean on. **CHEAP.**
2. **Don't build note search — finish it.** `BereanApi.searchNotes` and a
   global search box already exist and already match note bodies. The gaps are
   that a result drops you at a *passage*, not at the verse you wrote about;
   that it silently truncates at 50; and that it can't be scoped or filtered.
   **CHEAP–MEDIUM.**
3. **The passage-centric view is ~80% built and nobody can find it.** "Everything
   I've ever written about this chapter" *is* the reading view — every note
   anchored in the chapter already renders there. What's missing is a way to
   *know that* and reach it deliberately, plus a book-level roll-up.
   **CHEAP–MEDIUM.**
4. **Upgrade export from a backup into an answer to "can I get my notes out?"**
   It exists (zip of Markdown), it's shaped like the 2019 Electron vault, and
   it re-reads the database once per passage. **MEDIUM.**
5. **No to resurfacing** as a feature of its own — no daily card, no "on this
   day", no spaced repetition, no notification. **Yes** to the need underneath
   it, served pull-shaped by (1): **saved filters**, so "the questions I left
   open in Romans" is a thing you can walk back to when *you* decide to.
   **CHEAP, and only after (1).**

Nothing above needs a schema migration, a new table, or a new `BereanApi`
method. The one real data-layer risk is a silent truncation that already exists
(§6.1).

## 1. What we are actually solving for

Two observed behaviours ground everything below. Neither is a feature request,
which is exactly why they're worth designing from.

**The two-phase workflow.** People read with a pen in hand and capture
*questions* — "why does he say this twice?", "who is Melchizedek?" — and then,
in a *separate later pass*, go hunting for answers. Phase one is fast, messy and
in-the-moment. Phase two happens days later, at a desk, in a different frame of
mind, and it starts with **finding what you wrote**. Lantern is good at phase one
now (mobile inline capture, desktop workbench) and has essentially nothing for
phase two beyond scrolling a reverse-chronological list. The two phases have
opposite needs: capture wants zero friction and no structure; the return pass
wants structure and address-ability. A tool that only serves phase one produces
exactly the "drowning in a mess" complaint — not despite being good at capture,
but *because* of it.

**Elaborate personal colour schemes are hand-built indexes.** When people invent
a five-colour highlighting system and remember what each colour means, they are
not decorating. They are building a retrieval index by hand because the tool
didn't give them one — colour is the only queryable attribute a paper Bible has.
The instructive part is *what* they index on: kind of thing ("promise",
"command", "question"), not date, and not verse. That is a strong signal for
what the primary filter axis should be — **the reader's own categories, not
time** — and a warning that a fixed set of four categories chosen by us is a
worse index than the one a reader would build. (Which change belongs to
`note-object.md`, not here; retrieval's job is to not hardcode against it.)

Corollary worth stating plainly: **time is the weakest retrieval axis and it's
the only one the Journal has today.** Nobody thinks "the note I want is from
March." They think "the thing I wrote about Ecclesiastes and *hebel*", or "the
question I never answered in Romans 4".

## 2. What already exists (audit before designing)

Retrieval in Lantern is much further along than "a chronological list" suggests.
Building the wrong thing here would mean building a *second* one of something.

| Capability | State today | Where |
|---|---|---|
| Journal, derived from notes | Built. `getAllNotes()` → grouped by chapter, soft time buckets (Today / This week / Earlier this month / Older), note-vs-chapter view toggle, "show more" collapse past 3 notes | `src/components/JournalPage.tsx` |
| Category filter | Built, **client-side**, hardcoded to the four categories | `JournalPage.tsx` `CATEGORY_OPTIONS` |
| Full-text search over note bodies | **Built.** Case-insensitive substring (`ilike`), workspace-scoped, `order by updated_at desc`, **`limit 50`** | `berean-api.ts` `searchNotes`, `GlobalSearch.tsx` |
| Scripture-reference jump ("mat 2:13") | Built, pure client-side parse | `utils/noteParser.ts` `parseScriptureQuery` |
| Everything written about a chapter | **Built, as the reading view itself** — every note anchored in the chapter renders inline / in the margin rail, whatever passage row it hangs off | `getNotesByBook`, `ReadingMode`, `BookDetailPage` |
| Export all notes | Built. Zip of per-passage Markdown, legacy-vault format | `src/platform/export.ts`, `SettingsModal` |
| Filter by book / date / kind | **Missing** | — |
| Search scoped or filtered | **Missing** | — |
| A deliberate way to *reach* a chapter's note history | **Missing** (you have to already be reading it) | — |
| Saved / re-runnable queries | **Missing** | — |
| Pagination anywhere | **Missing** (and see §6.1) | — |

Read that column honestly and the shape of the work changes: this is mostly a
**surfacing and completion** job, not a build-a-retrieval-system job. That is the
single most useful finding in this brief, and it's why the recommendation is
ordered the way it is.

## 3. What to build, in order

### 3.1 Filtering — the foundation (build first)

**Recommend: build.** Four axes on the Journal, composable, all client-side over
the `NoteWithPassageInfo[]` the page has already fetched:

- **Category** — exists; the change is to stop hardcoding the list and derive it
  from what the notes actually carry, so user-owned categories (`note-object.md`)
  need no second pass here. **This is the primary axis** (§1).
- **Book** — derivable today with zero new data: `JournalPage` already resolves a
  book from each note's `reference_label` (`bookFromLabel`). Present it as the
  books you have actually written in, in canon order — never a 66-item picker,
  which would read as a Bible index rather than as *your* notes.
- **Kind — highlight vs note.** Depends on `note-object.md` defining what a
  bodiless-note highlight is. **Assumption used here:** a highlight is a note
  whose body is empty, so "kind" is a derived predicate, not a stored column.
  If that holds, this filter is three lines and needs no schema. If highlights
  get their own field instead, the filter is the same UI over a different
  predicate. Either way: **do not add a `kind` column for retrieval's sake.**
- **Date** — keep the existing soft buckets as the *grouping*, and offer at most
  a coarse range ("this month / this year / all time"). No date pickers. Time is
  the weakest axis (§1) and a calendar UI would give it a prominence it hasn't
  earned.

Two rules that matter more than the widget choice:

- **Filters compose and are visible.** The state you're in must be legible at a
  glance and clearable in one tap. A filter you forgot you set is worse than no
  filter — you conclude a note is gone.
- **An empty result is a sentence, not a void.** "No personal notes in Romans" —
  with the filter that caused it named, and one tap to widen.

**Effort: CHEAP.** One component, no API change, no schema change. Roughly a
half-day and well under 200 changed lines. The category filter's existing
plumbing (`filter` state, `filterOpen`, popover) is the pattern to extend.

### 3.2 Search — finish the one that exists

**Recommend: build, as a completion pass, not a new surface.** Concretely, in
priority order:

1. **Land the reader at the verse, not the passage.** `GlobalSearch`'s note
   results call `onOpenStudy(passageId)`. Under the note-centric model
   (`ARCHITECTURE.md`) a passage is invisible interim storage — the honest
   destination is *the chapter, at the anchored verse, with the note visible in
   context*. This is the single highest-value line of the whole brief: it turns
   search from "find a note" into "get back to the place", which is what phase
   two actually needs. (Note the coupling: the chapter reader has no
   verse-scroll hook yet — `SearchJumpTargets` says so in a comment. That hook
   is the real work here.)
2. **Stop truncating silently.** `limit 50` with no indication is how a reader
   concludes their note is lost. Either say "showing the first 50 of many" or
   paginate. Saying so is the cheap half and most of the value.
3. **Let search be scoped and filtered.** "Search in this book", and the §3.1
   filters applied to results. Once filters exist as a component, this is reuse.
4. **A search entry point from the Journal.** Today, note search lives in the
   global bar. Someone in phase two is *in the Journal*; that's where the
   question gets asked.

**Explicitly not recommended now:** fuzzy matching, stemming, ranking by
relevance, or a client-side index. `ilike '%q%'` over a personal corpus of a few
thousand notes is genuinely fine, and substring already beats token-exact
matching on inflections (measured for the scripture-search brief: "love"
substring 583 hits vs. 331 token-exact). See §6.2 for the named trigger to
revisit.

**Effort: CHEAP–MEDIUM.** Items 2–4 are cheap. Item 1 is the medium one and is
mostly the verse-scroll hook, which several other backlog items want anyway.

### 3.3 The passage-centric view — surface what already works

**Recommend: build the reachability, not the view.** "Everything I have ever
written about this chapter" is already true in the reading view — every note
anchored in the chapter renders there regardless of which passage row stores it,
by design (`ARCHITECTURE.md`, "Notes & studies model"). Lantern gets this nearly
free from verse anchoring, exactly as hoped. What's missing is smaller and more
boring than a new view:

- **A way to know it's there before you scroll.** A quiet count in the reading
  header — "12 notes in this chapter" — that is also the affordance to jump to
  them. Nothing appears when the chapter has none.
- **A book-level roll-up.** "Everything in Romans" is the unit people think in
  ("I studied Romans last winter"), and it is one filter away once §3.1 exists —
  the Journal, filtered to a book, *is* that view.
- **Cross-links both directions.** Journal chapter entry → chapter (exists);
  chapter → the same chapter's entry in the Journal, filtered (missing).

**Do not build a separate "passage view" screen.** It would be a third surface
rendering the same notes as the reading view and the Journal, and the note-centric
decision log is explicit that a second editing/reading surface for the same notes
is the thing that was just removed.

**Effort: CHEAP–MEDIUM.** No new API method — `getNotesByBook` already returns
exactly this. The header affordance is cheap; the design question ("how does a
count show up in a reading surface without breaking the devotional calm?") is a
taste call for Dennis, not a build cost (§8).

### 3.4 Export — see §4.

### 3.5 Saved filters ("threads") — the answer to resurfacing. See §5.

## 4. Export — the trust artifact

Export is not a retrieval nicety. In this category it is a **trust precondition**:
the loudest, angriest, most durable complaints about Bible-note apps are from
people whose years of notes were locked inside a product that was discontinued,
re-platformed, or moved to a subscription they wouldn't pay. That anger is about
custody, not features. A personal spiritual journal is the most acute possible
version of the problem, and Lantern's whole pitch is calm and trustworthy.

**What exists:** `exportAllNotesAsZip` walks every passage, writes one Markdown
file per passage under `notes/{Book}/{reference}.md` with a frontmatter block, and
downloads a zip. It deliberately mirrors the legacy Electron vault format
byte-for-byte.

**Three problems with it, in order of importance:**

1. **It's a backup of an obsolete model.** Files are organised per *passage* — the
   container the product no longer has a concept of. A reader opening the zip sees
   folders named after storage rows. Under the note-centric model the honest unit
   is **one file per book, notes in canon order, grouped by chapter**, which is
   also how a person reads their own notes back.
2. **It loses fidelity.** Category, timestamps, sub-note nesting and verse anchors
   beyond the passage's own span do not survive as data — a note's category is
   dropped entirely, which is the very index §1 says people index on.
3. **It re-reads the database once per passage.** `getPassages()` then
   `getNotesByPassage(id)` in a loop: a workspace with 400 passages does 401 round
   trips. `getAllNotes()` returns everything needed in **one**.

**Recommend:**

- **Markdown for humans, JSON for fidelity, one zip.** `notes/{Book}.md` files —
  readable, greppable, pasteable into anything, with each note carrying its verse
  reference, category and date — plus a single `notes.json` holding every field
  verbatim. Markdown is what makes people feel un-trapped; the JSON is what makes
  a future import (or a migration to a Lantern that doesn't exist yet) possible
  without asking anyone to re-key years of work.
- **Rebuild it on `getAllNotes()`** — fixes the N+1 and the ordering in one go.
- **Keep it behind `platform/export.ts`.** Serialization stays pure and portable;
  only "put the file somewhere" is platform-specific, which is exactly what a
  Capacitor/Tauri wrapper reimplements. No change to that seam is needed — this
  is a rewrite *inside* it.
- **Say it in the UI, once, calmly.** "Your notes are yours — export them any
  time, as plain files." One line in Settings next to the existing action. The
  export feature only builds trust if people know it exists before they need it.
- **Not now:** import, scheduled/automatic export, cloud-destination export
  (Drive/Dropbox). Import is a real feature with real merge semantics, not an
  export follow-on.

**Effort: MEDIUM.** Serialization is pure and unit-testable (the existing
`serializePassageMarkdown` tests are the pattern). Roughly a day; the risk is
zero because the old format can be kept alongside if anyone's tooling depends on
it — though nobody's does, since the vault format's only consumer was the frozen
Electron app.

## 5. Resurfacing — an explicit no, and what to do instead

**Position: do not build resurfacing in Lantern.** No "on this day", no daily
review card, no spaced repetition, no notification, no digest, no widget.

The reasoning, in Lantern's own terms rather than as a general dislike of the
pattern:

- **Every resurfacing design implies a schedule, and a schedule implies you are
  behind.** The mechanism doesn't have to show a streak counter to do the damage;
  a card that says "you haven't looked at this in 6 months" is a scoreboard with
  the number filed off. The Journal is already, deliberately, "a record to look
  back over, not a log" — soft buckets *because* precision would read as
  measurement, and no streaks, targets or totals by explicit decision
  (`ARCHITECTURE.md`). Resurfacing contradicts that decision rather than
  extending it.
- **It is push, into a devotional moment.** The one thing this product must never
  do is interrupt someone's reading with an engagement mechanic — the same
  standard already applied to the changelog, install prompt and update pill.
- **It sees for you.** Choosing which of your notes deserves your attention today
  is an editorial judgment about someone's spiritual life. Lantern's line is
  *help the reader see, don't see for them* — the same line that governs the
  deep-dive work. An algorithm ranking your prayers is the wrong side of it.
- **The best version already exists and is pull-shaped.** Return to Ecclesiastes 1
  and everything you ever wrote there is waiting for you, in context, because
  notes are verse-anchored. That is resurfacing that requires no schedule, no
  notification and no judgment: **the text is the index**.

**What people actually mean when they ask for it**, though, is real, and it is
phase two of §1: *"I asked a question three weeks ago and never went back to it."*
That's not a need for the app to nudge — it's a need for the question to be
**findable on purpose**.

**Recommend instead: saved filters — call them threads.** A filter combination
from §3.1, named and kept ("open questions in Romans", "everything tagged
*promise*"), re-runnable from the Journal whenever the reader decides to do a
hunting pass. Pull, not push. No schedule, no scoring, no counts of how long
something has sat, no "unfinished" language anywhere in the UI — a thread with
nothing new in it says nothing at all.

Two constraints:

- **It depends on user-owned categories** to be worth much (the "question" tag is
  the reader's, not ours) — so it lands *after* `note-object.md`'s work, and
  retrieval must not pre-empt it by hardcoding a question type.
- **Build it only after §3.1 ships and gets used.** A saved filter over filters
  nobody has used yet is speculation. This is the one item here I'd happily see
  dropped if the filters alone turn out to be enough.

**Effort: CHEAP** once filters exist (persist a small named list; localStorage is
adequate, and `UserSettings` is the account-synced home if it should follow the
reader across devices — a one-key patch, no schema change).

**On competitors:** Harvous ships a "Recall" surface, and it is the reason this
question is on the table at all. It is **context, not a template**. It's a
reasonable design for a product whose stance on engagement mechanics differs
from ours; the recommendation above is derived from Lantern's own decision log
(no streaks/targets/totals), its own note-centric model (the text is the index),
and its own AI/philosophy line (help the reader see, don't see for them). If a
competitor reference ever *is* the justification for a Lantern feature, that's
the signal the feature hasn't been thought through.

## 6. What this needs from the data layer

All data access goes through `BereanApi`, and the Journal is one `getAllNotes()`
call. The good news is genuinely good: **§3.1, §3.3 and §5 need no new API method,
no index and no migration.** The findings that matter are these.

### 6.1 `getAllNotes()` is unbounded, and may already truncate silently

`getAllNotes()` selects every note in the workspace with no `limit` and no
`range` — and PostgREST applies a server-side max-rows cap. **Supabase's default
is 1,000 rows.** If that default is in force on this project, a workspace that
crosses 1,000 notes gets a Journal that silently stops at 1,000 and a reader who
concludes their older notes are gone. That is the worst possible failure for a
retrieval surface, and it is a *pre-existing* condition, not something these
recommendations introduce.

**Action, ahead of any of this work: check the project's API settings for the
configured max rows, and make the boundary explicit in code** — an intentional
`.range()` with an honest "showing your most recent N" is fine; silent
truncation is not. Cheap, and worth doing on its own.

Payload scale, measured on a realistic row in the exact wire shape
`getAllNotes()` returns (note columns plus the joined passage fields), ~747
bytes/note:

| Notes | Uncompressed payload |
|---|---|
| 500 | 0.36 MB |
| 1,000 | 0.71 MB |
| 2,000 | 1.42 MB |
| 5,000 | 3.56 MB |
| 10,000 | 7.12 MB |

Gzipped over the wire this is several times smaller, and it is also written to
the offline mirror on every successful read. **Verdict: fetch-everything is fine
into the low thousands** — a daily writer takes years to get there — but it is
not fine forever, and the honest fix when it stops being fine is **pagination on
the Journal** (`getAllNotes` gaining an optional range), not a rewrite. Note the
one asymmetry: filtering client-side means the *first* fetch is the whole
workspace regardless of the filter, so pagination and filtering interact — a
paginated Journal must filter server-side or it will filter only the page it
happens to hold. Design that seam when the trigger fires, not before.

### 6.2 Search: `ilike` scan and its named trigger

`searchNotes` is `ilike '%q%'` joined up through `sessions → passages` for the
workspace filter, `limit 50`. A leading-wildcard `ilike` cannot use a B-tree
index, so this is a scan of the workspace's notes — imperceptible at hundreds,
fine at thousands. The replacement is already scoped in the backlog: a `tsvector`
column + GIN index + `websearch_to_tsquery`, purely behind the existing
`BereanApi.searchNotes` seam (both implementations already satisfy it), so it is
an implementation swap, not an interface change.

**Trigger to do it** — pick whichever comes first, and don't do it earlier:
median notes per writer crosses ~2,000 (already a telemetry scalar, so this is
observable rather than guessed at), or search feels slow on a real mid-range
phone, or the 50-cap is being hit routinely. **Effort when triggered: MEDIUM**
(a real migration, hence Dennis-supervised).

### 6.3 Indexes

`notes` has `notes_session_idx`, plus `notes(created_at)` and `notes(created_by)`
from the telemetry migration; `passages` has `passages_workspace_idx` and
`passages(workspace_id, book_number)`. Every read this brief proposes goes
through those paths. **No new index is needed for any of §3** — the one that
would eventually matter (a full-text GIN index) is §6.2's, and a
`notes(book_number)` index only becomes meaningful *after* the deferred
denormalisation retires `passages`/`sessions`.

### 6.4 The denormalisation is not on this critical path

Retiring `passages`/`sessions` and moving `book_number`/chapter onto `notes` is
already a deferred, human-supervised backlog item, and it would make server-side
book filtering trivial. **Do not couple retrieval to it.** Client-side book
filtering works today at every scale this app will see for years, and coupling a
cheap UI win to a migration-with-backfill is how the cheap win doesn't happen.

### 6.5 Effort summary

| Piece | New API? | Schema? | Effort | Order |
|---|---|---|---|---|
| §3.1 Journal filters (book · category · kind · date) | no | no | **CHEAP** (~½ day) | 1 |
| §6.1 Make the `getAllNotes` boundary explicit | no (optional arg later) | no | **CHEAP** (~1h) | 1, alongside |
| §3.2 Search: land at the verse | no | no | **MEDIUM** (verse-scroll hook) | 2 |
| §3.2 Search: cap honesty, scope, Journal entry point | no | no | **CHEAP** | 2 |
| §3.3 Chapter note-count affordance + book roll-up | no (`getNotesByBook` exists) | no | **CHEAP–MEDIUM** | 3 |
| §4 Export rebuild (per-book MD + JSON, one read) | no | no | **MEDIUM** (~1 day) | 4 |
| §5 Saved filters / threads | no | no | **CHEAP** | 5, after §3.1 lands and is used |
| §6.2 `tsvector` + GIN search | no (swap behind seam) | **yes** | **MEDIUM** | only on trigger |
| Journal pagination | yes (range arg) | no | **MEDIUM** | only on trigger |

Every row above is a separately shippable diff. None should be one task.

## 7. Suggested backlog entry text (for a human to paste)

> - **Journal retrieval — filters, then search, then reach.** `docs/proposals/journal-retrieval.md`
>   (2026-08-30) works out how the Journal stops being a chronological history and
>   becomes a place you find things. Recommended order, each independently
>   shippable: **(1)** composable client-side filters on the Journal — book
>   (derived from `reference_label` as `JournalPage` already does), category
>   (derived from the notes, *not* hardcoded, so user-owned categories need no
>   second pass), highlight-vs-note, and a coarse date range; **(2)** finish the
>   note search that already exists — land the reader at the *verse* rather than
>   at a passage id (needs the verse-scroll hook `SearchJumpTargets` flags as
>   missing), stop truncating silently at `limit 50`, allow scoping/filtering, and
>   add an entry point from the Journal; **(3)** surface the passage-centric view
>   that already works — a quiet "N notes in this chapter" affordance in the
>   reading header plus a book-level roll-up (which is just the Journal filtered
>   by book). No new `BereanApi` method, no index and no migration for any of
>   these.

> - **Export as a trust artifact, not a vault backup.** `exportAllNotesAsZip`
>   still writes the frozen Electron vault's per-*passage* Markdown layout — a
>   container the note-centric model no longer has — drops category, and does one
>   round trip per passage (`getPassages` + `getNotesByPassage` in a loop; 401
>   reads for 400 passages). Rebuild inside the existing `platform/export.ts`
>   seam on a single `getAllNotes()`: one Markdown file per **book** in canon
>   order with each note's verse reference, category and date, plus a `notes.json`
>   sidecar carrying every field verbatim so nothing has to be re-keyed. Add one
>   calm line in Settings saying the export exists — people who fear being locked
>   in need to know before they need it. See `docs/proposals/journal-retrieval.md` §4.

> - **`getAllNotes()` is unbounded and may be silently truncating.** No `limit`
>   or `range`, and PostgREST caps rows server-side (Supabase default 1,000). If
>   that cap is in force, a workspace past 1,000 notes shows a Journal that
>   silently stops — the worst failure mode a retrieval surface can have. Check the
>   project's API max-rows setting and make the boundary explicit in code
>   (intentional range + an honest "showing your most recent N"). Measured payload
>   is ~747 bytes/note in the wire shape (~1.4 MB at 2,000 notes), so
>   fetch-everything is fine into the low thousands; real pagination is a later,
>   triggered item and interacts with client-side filtering (a paginated Journal
>   must filter server-side). See `docs/proposals/journal-retrieval.md` §6.1.

> - **Resurfacing old notes: decided against (2026-08-30).** No "on this day",
>   daily review card, spaced repetition or notification. Every version implies a
>   schedule, and a schedule implies the reader is behind — the same reason the
>   Journal has no streaks, targets or totals; it is push into a devotional
>   moment; and ranking which of your own notes deserves attention is seeing *for*
>   the reader rather than helping them see. Verse anchoring already gives the
>   pull-shaped version for free: return to the chapter and everything you wrote
>   there is waiting. The real need underneath ("I asked a question and never went
>   back") is served by **saved filters ("threads")** — a named, re-runnable filter
>   combination, no schedule, no counts, no "unfinished" language. Cheap, but only
>   after the §3.1 filters ship and get used, and it leans on user-owned
>   categories. Harvous's "Recall" is context for the question, not a template.
>   See `docs/proposals/journal-retrieval.md` §5.

> - **`tsvector` + GIN for note search — now has a trigger.** The existing
>   deferred item stands (`searchNotes` is a leading-wildcard `ilike` scan that no
>   B-tree can serve, purely swappable behind the `BereanApi` seam). Do it when
>   *one* of these is true, not before: median notes per writer crosses ~2,000
>   (already a telemetry scalar), search feels slow on a real mid-range phone, or
>   the `limit 50` cap is being hit routinely. See
>   `docs/proposals/journal-retrieval.md` §6.2.

## 8. What needs a design pass with Dennis

This brief makes no visual or taste decisions and contains no mockups. These are
the calls that need his eye, in the usual flow (prototype in `design/` first):

1. **How filters appear on the Journal** without turning a reflective surface
   into a database front-end. The existing category popover is the seed; four
   composable axes is a different weight of UI, and this is the one place where
   getting it wrong makes the page *feel* like admin.
2. **The active-filter state and the empty result.** Both are about tone as much
   as layout: what a filtered Journal says about itself, and what "nothing here"
   says without sounding like a failure or an accusation.
3. **The chapter note-count affordance in the reading header** (§3.3) — the
   hardest taste call here. Anything in a reading surface competes with scripture,
   and a count is one small step from a metric. Note the open capture about
   Read/Study toggle discoverability: the same header is already under review.
4. **Where note search is entered from the Journal**, and whether it's the same
   `GlobalSearch` component in a third variant or its own thing.
5. **Saved filters ("threads")** if built (§5) — naming, where they live, and how
   they stay invisible until wanted. Highest risk of drifting into an engagement
   surface; worth explicitly designing the *absence* of counts and badges.
6. **The one line in Settings about export** (§4) — wording, on a page whose tone
   is already settled.

## 9. Open questions

1. **What is a highlight, exactly?** (`note-object.md`.) The §3.1 kind filter
   assumes "a note with an empty body". If highlights get colour, that colour
   becomes a retrieval axis in its own right — arguably *the* axis, per §1's
   colour-scheme observation — and the filter design changes shape.
2. **Do user-owned categories replace the four, or extend them?** Retrieval only
   needs the list to be data-driven, but "show me everything with no category"
   behaves differently in each case.
3. **Should saved filters sync across devices?** `UserSettings` makes it a
   one-key patch if yes; localStorage is free if no. Depends whether threads are
   a workspace concept or a device convenience.
4. **Is search scoped to notes forever?** Scripture full-text search is a
   separate deferred item with its own brief; if it lands, one box holds three
   result kinds and the ranking question between them becomes real.
5. **What is the actual configured max-rows on the Supabase project?** (§6.1.)
   This brief flags the risk from the default; only the project settings can
   confirm it, and the answer changes whether §6.1 is a one-hour fix or already-fine.
6. **Does anyone want import?** Export builds trust on its own, but a reader
   with notes in Logos or Evernote is a different, larger problem, and it is
   worth knowing whether that's a real audience before export's format is frozen.

## Files read for this brief

`src/components/JournalPage.tsx`, `src/components/GlobalSearch.tsx`,
`src/api/types.ts`, `src/api/berean-api.ts` (`getAllNotes`, `searchNotes`,
`deleteNoteAndCascade`), `src/types/index.ts`, `src/platform/export.ts`,
`supabase/migrations/0001_init.sql`, `supabase/migrations/0003_telemetry_indexes.sql`,
`docs/ARCHITECTURE.md` (Notes & studies model, Data model, Offline reads,
Markdown export, decision log), `docs/BACKLOG.md` (note search index, scripture
search, passages/sessions retirement, Journal-as-derived-history),
`docs/proposals/deep-dive-study.md` (philosophy guardrails, monetization stance),
`docs/proposals/scripture-search.md` (measured substring-vs-token evidence),
`docs/proposals/study-id.md`. **Not read: `docs/proposals/note-object.md` — it does
not exist yet (see the top of this brief).**
