# Architecture

## What this is

Lantern (renamed from Berean — see CLAUDE.md; internal `Berean*` identifiers and
persisted keys deliberately kept) is a single-user, web-first PWA for personal
Bible-study notes, bound for Cloudflare Pages (not deployed yet — see Deploy) and
backed by Supabase (Postgres + auth + RLS). It's a rewrite of
a local-only Electron desktop app. The desktop app carried its whole domain model
and pure-React UI through a single `window.api` bridge with zero direct Electron
imports in the renderer — that bridge is the seam the rewrite pivots on, so the UI
carries over nearly untouched and only the layer behind the seam changes.

## Shape of the app

The UI is a single React tree. `App.tsx` owns view state (the current
destination, which book/chapter/passage is selected, editor state). There is no
router and no global store — state is local to `App.tsx` and passed down; data
comes exclusively through the `BereanApi` context.

### Information architecture (Bible-centric, July 2026 overhaul)

The old capture/reading *mode toggle* and the left sidebar/drawer are gone. The
app is organized around three real destinations plus a desktop-only mode toggle,
in a single nav bar (`src/components/NavBar.tsx`, `type Destination = 'bible' |
'journal' | 'study' | 'profile'` — `'study'` is kept in the type only to drive
the desktop toggle's active/highlighted state, described below, not because a
`study` page exists) — a top bar on desktop, a bottom tab bar on mobile:

- **Bible** (home) — the annotated Bible: a book library → per-book chapter
  reader (`BibleLibrary` → `BookDetailPage`) with notes rendered inline against
  the verses, plus the saved-passage `ReadingMode`. Verse selection is the
  in-Bible gesture, and it differs by breakpoint on purpose (see "Notes &
  studies model" below for why): on **desktop** tapping/dragging a verse raises
  a floating action bar with **Quick note** (emphasised) and **Start study on
  {ref}**, and the reading page carries a **Read/Study toggle** beside the
  scripture; on **mobile** tapping a verse selects it directly (extend by
  tapping more verses) and raises a bottom selection bar whose **Note** button
  opens a keyboard-aware inline composer beneath the anchored verse — there is
  no mobile study surface, studying on a phone *is* reading plus this composer.
  This is the landing view.
- **Journal** — a **reflective, derived history of notes** (`JournalPage`,
  built entirely from `BereanApi.getAllNotes()` — not an index of saved study
  containers). Notes group under the chapter they're anchored to, newest-first,
  under soft local-day time buckets (Today / This week / Earlier this month /
  Older); a Notes/Chapters view toggle and a category filter slice the list.
  Tapping an entry opens that chapter in the ordinary reading view (the same
  jump-to-chapter handler search results and the chapter strip use) — Journal
  is a lens onto notes you already have, not a place notes are filed into.
- **+ Study** (desktop only) — no longer a destination you navigate to. The
  nav's "+ Study" tab, and every other "open this study" entry point (a Journal
  row, a note's "Open study", a search hit), all flip a **Read/Study focus
  toggle** on the reading page itself: Study slides a notes workbench
  (`StudyWorkbench.tsx`) in beside the scripture, editing that chapter's notes
  directly, while Read shows clean scripture. The standalone `StudyMode.tsx`
  page (770 lines) and its reconciling batch-save are deleted — there is no
  second editing surface to keep in sync with the inline one. Gated to
  `!isMobile`; on mobile the toggle is inert and capture is always the inline
  composer described above.
- **Profile** — display name, Settings, Export, Sign out (`ProfilePage` +
  `SettingsModal`); on desktop this is the top-bar avatar menu.

The leading top-bar slot carries the app logo and a **"Personal ▾" workspace
selector stub** — it renders the personal workspace only, a placeholder so the
future group switcher (see backlog) drops in without restructuring the bar.

**The "open study" entry point.** `handleOpenStudy(passageId)` (`App.tsx`) is
the single landing spot for a Journal row, a search hit, and `ReadingMode`'s own
"Open study" control: it resolves the passage's book/chapter and lands back in
the ordinary Bible reading view for that chapter — with the Read/Study toggle
switched to Study on desktop — rather than opening a distinct editor page.
"Opening a study" and "reading that chapter with its notes" are now the same
action; there is no bridge to a separate surface left to describe.

**Search** (`src/components/GlobalSearch.tsx`) is one box with two
independently-populating sections: (1) scripture-reference jumps, parsed
client-side by `parseScriptureQuery` (reusing the book-alias table) — a bare book
name or prefix yields book-level jumps (ambiguous prefixes return a small ranked
list), and book+chapter[:verse] jumps to the chapter; no verse text is searched;
and (2) matching notes via the additive
`BereanApi.searchNotes` (case-insensitive substring; `ilike` in Supabase, a
workspace scan in the memory stub). On desktop it's an always-present top-bar
input rendering a popover, focusable from anywhere via a `/` shortcut
(ignored while already typing in an editable field); on mobile a dedicated
full-screen surface opened from a top-bar search button. The two sections are
structurally decoupled (a synchronous `useMemo` for section 1, a debounced
effect for section 2) so neither blocks the other. Search is deliberately
**not** promoted to a hero/landing element — a prominent search bar primes
lookup-and-leave behavior, the opposite psychological posture from the
Bible-centric home's "settle in and read" intent; the `/` affordance and a
resting elevation shadow make it feel like a capable, fast tool without
competing with the reading canvas for attention. Scripture verse-text search
and a Postgres FTS index are backlogged.

**Top-bar layout is a 3-column CSS grid** (`.topnav`, `grid-template-columns:
1fr auto 1fr`), not flex-with-self-centering — the two outer columns
(`.topnav-lead`, a new `.topnav-right` wrapper grouping the search box/button +
avatar) are forced to equal width so the center destination tabs land on the
true viewport center regardless of the two sides' own (unequal) content width.
Each of the three children carries an explicit `grid-column` rather than
relying on source-order auto-placement, because a `display:none` grid item
(e.g. `.topnav-tabs` on mobile) is removed from the grid entirely and
auto-placement would otherwise pack the remaining visible children into the
wrong columns.

### Notes & studies model (the mental model behind the IA)

**Decided 2026-08-25/26 (note-centric model — see the decision log entry
below): a note anchored to scripture is the only saved unit. A "study" is a
derived VIEW over notes, not a stored container.** This replaced the earlier
"a study is a `Passage`" model described in this file through 2026-08-25 (still
visible via `git log` if you need the prior framing) — the passage/session
tables are unchanged in Postgres today, but the UI no longer treats a `Passage`
row as "a study" the user creates, names, or reopens as a distinct thing:

- **Notes belong to verses, not to studies.** A note is anchored to a verse or
  range and is the one durable artifact the user thinks in terms of. The
  **Bible/reading view is the cumulative surface**: every note anchored in a
  chapter renders inline there (`getNotesByBook`) regardless of which
  passage/session it happens to be stored under. "Everything I ever noted on
  this verse shows up when I read it" — because study is cumulative and
  verse-centric, not filed-in-folders.
- **"Study" is a mode of reading, not a container you create.** On desktop,
  flipping the reading page's Read/Study toggle opens `StudyWorkbench` beside
  the scripture and edits that chapter's notes directly — there is no
  passage-naming step, no "start a new study" action distinct from "add a note
  here," and no second editing surface (`StudyMode`) to reconcile against. On
  mobile, capture is the inline composer described above; there is no
  study mode at all on a phone.
- **The Journal is a derived history of notes, not an index of studies.**
  `JournalPage` groups notes from `getAllNotes()` by chapter and recency; it
  reflects what you've written, it doesn't enumerate "study" records you made.
  Deliberately reflective (soft time buckets, a note/chapter view toggle, a
  category filter) rather than a scoreboard — no streaks, targets or totals.
- **Quick notes and "study" notes are the same thing.** There is no longer a
  distinction between an ungrouped margin jotting and a note made "inside a
  study" — every note is anchored to a verse range and renders the same way
  everywhere; whether you added it via the mobile composer, the desktop
  workbench, or the reading page's Quick note action doesn't change what it is.
- **The `Passage`/`session` tables are interim, invisible storage, not the
  model.** They still exist in Postgres and the app still writes through them
  (a note needs *some* row to hang off), and `findOverlappingPassage` still
  reuses an existing passage whose range overlaps a new note's anchor rather
  than minting a redundant one — but the UI never surfaces a passage/session id,
  never asks the user to name or choose one, and no screen enumerates "your
  studies." **Deferred cleanup:** retire the `passages`/`sessions` tables
  entirely and denormalise `book_number`/chapter directly onto `notes` (see
  `docs/BACKLOG.md`) — today's shape is a stepping stone that let the
  note-centric UI ship with zero migration, not the intended end state.

**Reading-view presentation (study-Bible layout).** In both reading surfaces
(`ReadingMode` and `BookDetailPage`'s `ChapterView`) verse-anchored notes are
laid out by span width: **single-verse notes render inline** beneath their verse
row; **multi-verse range notes** sit in a right-hand **margin rail**
(`.scripture-grid` column 2) on desktop, with a category-coloured bracket that
spans exactly the anchored verse rows (the rail note fills its grid-row span via
`align-self: stretch`); **anchorless notes** are passage-level. The rail collapses
and the scripture column centers (`.scripture-grid.no-rail`) when there are no
range/passage notes. Overlapping range notes are laid out in side-by-side
**lanes** (greedy interval coloring). On mobile (no rail), range notes render
inline right after their *last* anchored verse rather than stacking at the
chapter's end. Desktop verse selection is a **marquee/box drag**
(`useVerseMarquee`) plus tap-anchor/tap-extend; both drive the same
`selAnchor`/`selFocus` state and the floating action bar. The marquee's drag
origin is the full-width reading container (not the centered column), so a drag
can start in the side margins, and its hit-test requires the box to overlap a
verse row on both axes — a box drawn purely in side whitespace, without ever
crossing verse text, selects nothing. Note-highlight and range-selection are
mutually exclusive and fully clearable — a click on empty scripture whitespace or
Escape clears everything. Verified live in a real browser across desktop and
mobile widths, light and dark.

**Deferred (future milestone), by design, not omission:** a modifier to restore
native verse-text copy under the marquee. See the backlog. (The `study_id`
group-stamp idea named here through 2026-08-25 is moot under the note-centric
model — there is no "study instance" concept left to distinguish; see
`docs/proposals/study-id.md`'s superseded note and the decision log below.)

### The `BereanApi` seam

All data access and mutation funnels through one interface, `BereanApi`
(`src/api/types.ts`), consumed via `useApi()`. This is the design's load-bearing
decision:

- The implementation swaps without touching components. Phase 0 uses an in-memory
  stub (`memory.ts`); Phase 1 drops in `SupabaseBereanApi` at `main.tsx`.
- It's the single mutation choke point, so the future **offline write outbox** has
  exactly one home. The phase-1 behavior on a failed write — catch, surface a
  friendly message — is literally the stub the outbox replaces later.
- Parent-cleanup cascades (delete note → delete now-empty session → delete
  now-empty passage) are done explicitly in the implementation, matching the old
  desktop `deleteNoteAndCascade` / `deletePassageAll` behavior. In Postgres these
  ride on `ON DELETE CASCADE` for the downward direction; the upward emptiness
  checks stay in `berean-api.ts`.

### The `BibleProvider` seam

Scripture access is a second interface, `src/bible/provider.ts`:
`getChapter(bookNumber, chapter)` → `{ verse, text }[]`. Implemented (Phase 2):

- `src/bible/helloao.ts` — `HelloaoBibleProvider`, BSB via the free, keyless
  `bible.helloao.org` API: `GET /api/BSB/{USFM}/{chapter}.json`. Book numbers
  (1–66) map to helloao's 3-letter USFM codes via an explicit table
  (`USFM_BY_BOOK_NUMBER`) rather than reusing `bibleBooks.ts`'s `id` field,
  because a handful of codes differ (e.g. Ezekiel is `EZK` not `eze`, Joel is
  `JOL`, Nahum is `NAM`, Song of Solomon is `SNG`). The response's
  `chapter.content` is a flat array of typed nodes (`heading`, `line_break`,
  `hebrew_subtitle`, `verse`); a verse's own `content` array mixes plain
  strings with inline objects (`{ noteId }` footnote markers, `{ lineBreak:
  true }`, `{ text, poem }` poetry lines). `flattenVerseContent` reduces all of
  that to one plain-text string per verse — footnote markers and poem-line
  structure aren't surfaced to components today.
- `src/bible/cache.ts` — `CachedBibleProvider` wraps any `BibleProvider` with an
  IndexedDB store (`berean-bible-cache`, key `translation/book/chapter`) and
  caches forever: chapters are immutable, so once fetched, helloao downtime
  never affects a chapter that's already been read.
- `src/bible/service.ts` — the reference-based lookup (`getBibleVerse(reference)
  -> BiblePassage | null`) that components actually call through `BereanApi`.
  It parses a label like `"John 1:1-5"` or `"Genesis 3"` (book prefix via
  `findBookByAlias`, chapter/verse via a regex tailored to the two shapes call
  sites produce), fetches the chapter through the cached provider, and slices
  the requested verse range (or returns the whole chapter when no verse
  component is present). **Design choice:** `getBibleVerse` stayed on
  `BereanApi` (both `memory.ts` and `berean-api.ts` delegate to
  `bible/service.ts`) rather than being removed from the interface and having
  components call the bible module directly — this keeps `BereanApi` as the
  single thing components import for data, avoids call-site churn across
  `CaptureMode`/`NoteEditor`/`ReadingMode`/`BookDetailPage`, and scripture
  lookup is still trivially separable later if it ever needs to move.
- `src/bible/self-hosted.ts` — `SelfHostedBibleProvider` (2026-07-21), serving
  the complete BSB from `public/bible/bsb.json.gz` (~1.2 MB gzip, 66 books /
  1,189 chapters / 31,086 verses), built by `scripts/build-bsb-bundle.mjs` from
  bereanbible.com. Composed as `FallbackBibleProvider(cache(helloao),
  selfHosted)`: helloao stays PRIMARY, this is the fallback, so it is fetched
  **lazily** — never on a successful read — and memoized for the session.
  Three things that are easy to get wrong here:
  - **It sniffs the gzip magic bytes rather than trusting `Content-Encoding`,
    and this is load-bearing.** The two environments behave in *opposite* ways:
    Vite dev sends `Content-Encoding: gzip` so the browser pre-decompresses and
    the bytes arrive as `{"`; Cloudflare Pages sends no encoding header so the
    raw `1f 8b` gzip stream arrives. Header-trusting code works in exactly one
    of them. Both verified live.
  - **It is excluded from the PWA precache** (`globIgnores` in
    `vite.config.ts`). Precaching it would push the entire Bible onto every
    first load, which defeats the point of fetching it lazily.
  - **This fixes availability, NOT offline reading.** If helloao is down and the
    user is online, the fallback works. If the user is genuinely offline the
    bundle fetch fails too, since it is in neither the precache nor any
    `runtimeCaching` rule. Guaranteed offline reading is still the deferred
    prefetch item in `docs/BACKLOG.md`, now much cheaper because the asset
    already exists and ships.
- KJV, or ESV-with-user-key, are future providers behind the same
  `BibleProvider` interface — nothing about the seam is BSB-specific except
  `helloao.ts`'s own USFM table.

There is no translation selection anywhere: BSB is the only translation, so no
translation state/props/settings UI exist. The provider interface is the sole
extensibility point for adding one later.

### `platform/`

Anything a native wrapper (Capacitor/Tauri) would reimplement lives behind a
`src/platform/` interface — markdown export now (zip download in the browser),
TTS later. The rule that keeps this honest: no Node/Electron APIs anywhere under
`src/` (see CLAUDE.md).

## Data model

Domain: a **passage** (a scripture reference span) has **sessions**, each holding
ordered **notes**. A note anchors to a verse range, carries an optional category,
and can be a sub-note (`indent_level > 0`). Book identity is a static USFM
`book_number` (1–66) — no books table; `src/utils/bibleBooks.ts` owns all book
metadata client-side.

**This schema is interim, invisible storage under the note-centric model** (see
"Notes & studies model" above) — passage/session rows are plumbing the note
needs to hang off, not a "study" concept the UI exposes. The deferred cleanup in
`docs/BACKLOG.md` retires `passages`/`sessions` and denormalises `book_number`
and chapter directly onto `notes`; until that lands, treat this section as
describing storage, not the product's mental model.

Key data decisions:

- **Ids are client-generated UUIDs** (`crypto.randomUUID()`) and **timestamps are
  client-set**. This is offline-sync readiness: an offline client can mint a valid
  row and reconcile later without server round-trips for id assignment.
- **`workspace_id` from day one.** Phase 1 only exercises the degenerate
  single-personal-workspace case, but the column and the RLS pattern are in place
  so Groups later is *just new rows* — zero schema or policy migration.

### Target Postgres schema (Supabase, Phase 1)

```sql
-- profiles: 1:1 with auth.users, created by trigger on signup
profiles (id uuid PK refs auth.users, display_name text default '', created_at)

-- workspaces: 'personal' now; 'group' later without migration
workspaces (id uuid PK default gen_random_uuid(),
            kind text check (kind in ('personal','group')),
            name text, created_by uuid refs auth.users, created_at)
workspace_members (workspace_id uuid refs workspaces on delete cascade,
                   user_id uuid refs auth.users on delete cascade,
                   role text default 'owner',
                   PK (workspace_id, user_id))

-- passages: book is a USFM number (1–66); no Books table
passages (id uuid PK, workspace_id uuid refs workspaces on delete cascade,
          book_number int not null check (book_number between 1 and 66),
          chapter_start int, verse_start int, chapter_end int, verse_end int,
          reference_label text not null, created_at timestamptz)

sessions (id uuid PK, passage_id uuid refs passages on delete cascade,
          created_at timestamptz)

notes (id uuid PK, session_id uuid refs sessions on delete cascade,
       content text not null,
       anchor_start_verse int, anchor_end_verse int,
       anchor_book_override text, anchor_chapter_override int,
       category text check (category in
         ('observation','historical','application','personal')),
       indent_level int not null default 0,
       created_by uuid refs auth.users,
       created_at timestamptz, updated_at timestamptz)
```

- **Signup trigger:** on a new `auth.users` row, create a profile + a personal
  workspace + the owner membership.
- **RLS, one pattern everywhere:** a row is visible/writable iff its workspace is
  in `(select workspace_id from workspace_members where user_id = auth.uid())`.
  Notes and sessions check this via a join up to their passage. Groups later add
  membership rows and change nothing about the policies.
- **Not in Postgres:** scripture text (IndexedDB chapter cache) and the old
  `BibleVerseCache` / `Books` tables (replaced by the cache and the client
  `book_number` constant).

## Auth & bootstrap (Phase 1)

**The signed-out surface is the public landing page** (`src/components/landing/`,
`src/assets/landing.css`) — nav, an animated hero, three feature clips, CTA,
footer — ported from the approved specs in `design/`. Sign-in is a dialog opened
from its CTAs (`SignIn.tsx`), not a screen of its own. It is `React.lazy`-loaded
so a signed-in user never downloads it. Two things there are load-bearing and
documented at their call sites: the landing is **its own scroll container**
(the app shell locks `html/body/#root` to `overflow: hidden`, which would
otherwise make a 2300px page unscrollable), and the hero's loop **measures
layout** rather than trusting fixed pixel distances (see `design/README.md`).

Sign-in offers **two methods reaching one account**: Google OAuth
(`signInWithOAuth({ provider: 'google' })`, the prominent one-click default) and
**email OTP** (the fallback). Because first sign-in doubles as sign-up, there is
only ever *one* action here — which is why the landing offers a choice of method
rather than a "Get started"/"Sign in" pair. **Both methods are live in
production** (2026-07-20): the Google provider is configured in Supabase, and the
OAuth consent screen's branding is verified, so users see "Lantern" and the app
logo rather than the raw `…supabase.co` host. Note that `signInWithOAuth` hands
the browser off *without validating the provider* — if the provider is ever
disabled, the user lands on a raw JSON error page and the caller's `catch` never
runs, so never ship that button against an unconfigured provider.

The two methods do not fork the account: **Supabase automatically links
identities that share a *verified* email** into one `auth.users` row. The OTP
flow verifies an address by definition and Google returns verified emails, so
email-then-Google (or the reverse) lands on the same user. This is load-bearing
rather than incidental — the signup trigger creates a profile + personal
workspace on *every* new `auth.users` row, so a second row would mean a second,
empty workspace and split notes. Nothing in this codebase implements the linking.
**Verified in production (2026-07-20):** signing in by email and then with Google
on the same address returned the same notes, and the account holds exactly one
`personal` workspace — so the linking behaves as relied upon here. Re-test this
if the Supabase auth settings ever change (in particular, "Allow users without
email" must stay OFF, since the email is what the linking keys on).

Email OTP: the user enters an email, Supabase sends a 6-digit code,
and the code is verified (`signInWithOtp({ shouldCreateUser: true })` →
`verifyOtp({ type: 'email' })`, `src/api/auth.ts`). First sign-in doubles as
sign-up, which fires the Postgres signup trigger that creates the user's profile,
a personal workspace, and the owner membership. Sessions persist
(`persistSession`, `autoRefreshToken`); sign-out lives in the settings modal.

`src/Root.tsx` is the bootstrap that picks the backend and gates the app:

- **Supabase configured** (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` present)
  → auth-gated. Phases: `loading → signedOut (Landing) → onboarding (Onboarding) →
  ready (App)`. On a signed-in session it constructs `SupabaseBereanApi.create()`,
  which resolves and caches the user's personal workspace id once, then provides
  it via `ApiProvider`. Onboarding (optional name → capture intro → reading intro,
  skippable) runs on first sign-in and sets `profiles.onboarding_done`
  (localStorage `berean.onboarded` as a fallback).
- **Not configured** → the in-memory stub (`memory.ts`), with a console warning.
  `npm run dev` works with no backend for pure UI work.

`SupabaseBereanApi` (`src/api/berean-api.ts`) is the one mutation choke point:
client-generated `crypto.randomUUID()` ids, client-set ISO timestamps, downward
deletes via `ON DELETE CASCADE`, and the upward empty-session / empty-passage
cleanup done explicitly (mirroring the memory stub and the legacy desktop
`deleteNoteAndCascade`).

### Environment variables

| Var | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` (browser) | Supabase project URL. Absent → memory stub. |
| `VITE_SUPABASE_ANON_KEY` | `.env` (browser) | Supabase anon/public key. Absent → memory stub. |
| service-role key | CLI arg only | Used by the migration script to bypass RLS. Never in the browser or committed. |

See `.env.example`. `.env` is gitignored.

### SQLite → Supabase migration

`scripts/migrate-sqlite.ts` (run via `npx tsx`; Node APIs allowed here only — the
rest of `src/` stays pure web) does a one-time import of the legacy Electron
`berean.db` into a user's personal workspace. It remaps integer ids → UUIDs
(preserving `created_at`), maps legacy book names → `book_number` via the same
table as `src/utils/bibleBooks.ts`, inserts passages/sessions/notes with the
service-role key, and prints a before/after count summary plus a few sample notes.

```
npx tsx scripts/migrate-sqlite.ts \
  --db ./berean.db \
  --url https://<ref>.supabase.co \
  --service-key <service-role-key> \
  --user-email you@example.com
```

## Offline & PWA (Phase 4)

### Installability and the service worker

`vite-plugin-pwa` (`vite.config.ts`, `generateSW` strategy) emits the web app
manifest and a Workbox service worker at build time:

- **Manifest** — name/short_name "Lantern", `standalone` display, theme and
  background color `#F5F4F1` (matching the app's light background), three
  icons (`192`, `512`, and a `512` `maskable` variant with ~10% safe-area
  padding baked in) generated from `public/icon.svg`.
- **Precache** — the app shell (JS/CSS/HTML/icons) via Workbox's default glob
  precache, plus a SPA `navigateFallback` to `index.html`.
- **Runtime caching** — a `NetworkOnly` rule for `*.supabase.co` traffic. The
  service worker must never cache API responses: notes and auth always hit the
  network (or fail loudly), so staleness is handled by the app's own offline
  mirror below, not silently masked by the SW cache.
- **Registration** — `registerType: 'autoUpdate'`; `src/main.tsx` calls the
  `virtual:pwa-register` `registerSW()` so updates apply without a user prompt.

### Offline reads: the notes mirror

`src/offline/mirror.ts` is a small IndexedDB store (`berean-offline-mirror`)
that mirrors `BereanApi` read-query *results*, keyed by `queryName + JSON(params)`
(e.g. `getNotesByPassage:"<uuid>"`). It's whole-result, write-through, no
merging — the opposite of a sync engine:

- On every successful read, `SupabaseBereanApi` (`src/api/berean-api.ts`)
  writes the full result to the mirror under that key.
- On a read that fails with what looks like a network error, it falls back to
  whatever was last mirrored for that exact key and returns it, so the app
  still renders. Scripture chapters have their own, separate cache-forever
  IndexedDB store (`src/bible/cache.ts`) and aren't routed through this mirror.

### Offline writes: graceful failure, not silent loss

Detection is by **fetch failure, not `navigator.onLine`** — the browser's
online flag reflects link-layer state, not actual reachability of Supabase.
`src/offline/status.ts` exports `isNetworkError()` (classifies `TypeError`s and
Supabase's connectivity-error messages) and a tiny listener-based emitter
(`subscribeOffline`, `markOffline`/`markOnline`) so both the plain-TS API layer
and React components can react to connectivity changes without a shared store.

`SupabaseBereanApi` routes every read through a `read()` helper (mirror
write-through / fallback, described above) and every mutation through a
`write()` helper: on a network failure it marks the app offline, fires a
one-shot toast event, and throws a typed `OfflineError` — the same catch point
the future write outbox (`docs/BACKLOG.md`) replaces.

The UI surfaces two things, both in `src/components/OfflineIndicator.tsx`,
mounted once in `App.tsx`'s shell:

- A subtle, persistent **"Offline — viewing only" pill**, shown while
  `isOffline()` is true (set on any `OfflineError`/mirror-served read; cleared
  on the browser's `online` event or the next successful request).
- A **non-blocking toast** ("You're offline — changes can't be saved yet."),
  fired once per failed mutation attempt, auto-dismissing after a few seconds.

#### Draft persistence (2026-07-21) — what the toast alone did not cover

The behaviour above is necessary but was not sufficient, and the gap was only
found by observing it rather than reading it. On a failed save the typed note
*stays on screen*, because nothing on the failure path clears `lines`. That
looks like the content is safe. It is not: it existed **only in React state**,
so closing the tab or reloading destroyed it. The pill and toast correctly said
"can't be saved yet" while the work was one refresh away from being gone.

`src/offline/draft.ts` closes that window. It is a small IndexedDB store
(`berean-note-drafts`) following the same shape as `mirror.ts` and
`bible/cache.ts` — write-through, best-effort, errors swallowed. `StudyMode`
persists the in-progress draft debounced (600ms) while `isLinesDirty` is true,
restores it on returning to the same study, and clears it once a save lands.
Keyed by `passage:<id>` once a passage exists, or `new:<reference>` for a study
that has not been saved yet.

Two things worth knowing before touching it:

- **A restored draft is labelled**, deliberately distinct from the per-line
  "saved Xh ago" stamp, so recovered content is never mistaken for something
  already on the server.
- **There is a generation counter (`draftSaveGenRef`) and its ordering is
  load-bearing.** A debounced write scheduled just before a save can otherwise
  fire *after* that save cleared the draft, resurrecting stale content. The
  counter is bumped **synchronously before** `await clearDraft(...)`, not after
  — bumping it after leaves the timer able to race a competing write against
  the same key while the clear is in flight.

This is the small first step recommended by `docs/proposals/offline-write-outbox.md`,
not the full write outbox. Queue replay, conflict reconciliation and delete
handling remain deferred, and that proposal is the design doc if they are picked
up.

### Markdown export

`src/platform/export.ts` reuses the legacy Electron vault's serialization
format exactly (frontmatter block — `reference`, `book`, `chapter_start`,
`verse_start`, `chapter_end`, `verse_end`, `updated` ISO timestamp — then a
blank line, then one `- {content}` line per note, ordered by
`anchor_start_verse` ascending with nulls last, then `created_at`). "Export all
notes" in `SettingsModal` calls `exportAllNotesAsZip(api)`, which walks every
passage via the active `BereanApi`, builds one `.md` file per passage at
`notes/{BookName}/{safeFilename(reference_label)}.md` (same `safeFilename`
rules as the legacy vault: `:` → `.`, strip ``\/?*"|<>``), zips them with
`fflate`, and triggers a browser download via `Blob` + a synthetic anchor
click. Works against whichever `BereanApi` is active (Supabase or the memory
stub), since it only calls interface methods.

- **iOS PWA note:** every cached thing is re-fetchable (scripture is immutable and
  re-downloadable; notes live in Supabase, mirrored locally only as a read
  fallback), so Safari storage eviction is an inconvenience, never data loss.

## Deploy (Phase 4)

**LIVE at [lanternword.com](https://lanternword.com) since 2026-07-19.**
**Cloudflare Pages** auto-deploys from `main` (build `npm run build`, output
`dist`, env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`); the preview origin is
`lantern-5jf.pages.dev`. The domain is registered at Cloudflare Registrar, so DNS,
hosting, the Pages custom domain, Brevo's email records and the OAuth origins all
live in one dashboard with no nameserver delegation. Pages was chosen over Vercel
because `public/_redirects` is already the Cloudflare/Netlify format (Vercel would
need a `vercel.json` rewrite). Auth email goes out over **Brevo** SMTP from
`no-reply@lanternword.com`. Auth origins are allowlisted in BOTH
`supabase/config.toml` (local CLI only) and the hosted project's
Auth → URL Configuration — keep those in sync.

**Deploy-time gotchas, all learned the hard way:**

- **Cloudflare's Git-import defaults to the Workers flow** (`npx wrangler deploy`,
  expecting a Worker that does not exist here). The correct product is **Pages**.
- **Do NOT add explicit `/privacy` → `/privacy.html` rewrites to `_redirects`.**
  Pages already serves static files at their extensionless URL and 308-redirects
  `.html` → clean; an explicit rewrite fights that and produces an **infinite
  redirect loop**. This shipped once and broke the live legal pages. `_redirects`
  should hold only the SPA catch-all, and it carries a comment saying so.
- **Static files shadow the catch-all**, which is what makes `public/*.html`
  (`about`, `privacy`, `terms`) work at clean URLs — and is why `/robots.txt` was
  silently served as the app's HTML until a real `public/robots.txt` was added.
- **Cloudflare mutates the served HTML.** Email Obfuscation rewrites `mailto:`
  links into `/cdn-cgi/l/email-protection` plus a decoder script. Harmless here,
  but if crawler rendering ever looks wrong, check that and Rocket Loader.

**The public static pages exist for a reason beyond content.** `public/about.html`
is the URL registered as the OAuth "Application home page", and `privacy.html` /
`terms.html` back the claims the landing makes. Google's brand verification reads
the *served* HTML, so several constraints are load-bearing and must not be
"tidied" away:

- The app is a client-rendered SPA whose landing is a lazily-loaded chunk, so
  `index.html` carries a **visible** fallback inside `#root` (app name, purpose,
  logo, policy links) that `createRoot` replaces on mount. `<meta>`/`<title>` do
  not count as page content to the checker, and `<noscript>` is hidden whenever JS
  runs — neither is sufficient on its own.
- Policy links on those pages are **absolute** (`https://lanternword.com/privacy`),
  because the requirement is that the homepage's privacy link *match the value
  configured on the consent screen*. Relative hrefs silently fail that check.
- The `<h1>` on `about.html` must stay exactly **"Lantern"** (matching the consent
  screen app name) and the logo rendered there must be the same file uploaded as
  the OAuth logo (`icon-512.png`).
- Pages must be linked from somewhere: an orphan page is never crawled, and an
  uncrawled page fails verification no matter what it contains.

## Responsive & touch (Phase 3)

The app is mobile-first responsive from a single `max-width: 768px` breakpoint in
`src/assets/main.css`. Above it, the original desktop layout is untouched; below
it the shell reflows for a phone (primary target: Android Chrome, ~360–430px).

- **Shell.** The July-2026 IA overhaul replaced the sidebar/drawer with the
  `NavBar` (`src/components/NavBar.tsx`): a **top bar on desktop** (logo +
  workspace stub, centered destination tabs including the "+ Study" toggle,
  search box, avatar menu) and a **fixed bottom tab bar on mobile** (Bible ·
  Journal · Profile — the mobile Study tab was tried and then removed, see the
  note-centric decision log entry: studying on a phone is reading plus the
  inline composer, with no separate surface to tab into). The swap is driven by
  one `max-width: 768px` breakpoint — the desktop `.topnav` hides its
  tabs/trail/search and the `.bottomnav` appears; the mobile search box
  collapses to a top-bar button that opens the full-screen `.search-surface`.
- **Single column.** The desktop Study workbench (a 60/40 split beside the
  scripture) is gated off below the breakpoint — there is no mobile
  equivalent; reading, book detail, and library go full-width with comfortable
  padding. The library grid drops from 3 to 2 columns so book names don't
  truncate.
- **Modals as sheets.** SettingsModal and ConfirmDialog become full-width bottom
  sheets (rounded top, slide-up) on mobile.
- **Functional hovers → tap.** The only functional hover interactions are the
  cross-reference verse previews. `CrossRefPill` (`src/components/CrossRefPill.tsx`)
  centralizes them: on `(hover: hover)` devices it previews on hover exactly as
  before; on touch it's a tap-to-toggle popover that dismisses on outside-tap or
  Escape. Capability is detected with `matchMedia('(hover: hover)')`, not a UA
  sniff, so a hybrid device still gets both. Cosmetic `:hover` styles are left
  as-is (harmless on touch). Hover-revealed action buttons (note edit/delete, the
  verse "+" add button, the sidebar passage-edit pencil) are forced always-visible
  under `@media (hover: none)`.
- **Ergonomics.** All text inputs are ≥16px on mobile (prevents iOS focus zoom);
  touch targets are ≥44px (menu button) or enlarged (icon buttons to 34px, list
  rows padded). `viewport-fit=cover` in `index.html` plus `env(safe-area-inset-*)`
  padding keep content clear of the notch and home indicator. No horizontal
  overflow at 360px (the verse "+" button was pulled inside the row for this).

## Decision log

| Decision | Rationale |
|---|---|
| Web-first PWA, freeze Electron | One codebase runs everywhere; native returns only as a thin Capacitor/Tauri wrapper. Desktop frozen at `v1.2.1-electron-final` on `legacy/electron`. |
| Supabase (Postgres + RLS + email OTP) | Managed auth + row security + Postgres without running infra. Google OAuth links to the same account later via verified email. |
| Single `BereanApi` seam | One swap point for stub→Supabase; one home for the future offline outbox; components stay backend-agnostic. |
| Client UUIDs + client timestamps | Offline-sync readiness — clients mint valid rows without server round-trips. |
| `workspace_id` + membership + single RLS pattern from day one | Groups later is new rows only, no migration. |
| Static `book_number` (1–66), drop Books table | Book metadata is static and belongs client-side; removes a table and its bookkeeping. |
| BSB via helloao, cached forever in IndexedDB | Free, no key; immutable chapters cache indefinitely, so provider downtime doesn't affect reads. Provider interface keeps KJV/ESV addable. |
| `platform/` abstraction + pure-web rule | Keeps the code portable to native wrappers; nothing under `src/` touches Node/Electron. |
| Design-token layer (`src/assets/tokens.css`) | One source of truth for color/elevation/spacing/motion/type, consumed via `var()`. Default theme, now labelled "Lantern" (warm cream canvas + indigo accent + serif scripture), in `:root`; `body.dark` reassigns tokens (also warm-tinted, F1b). Its stored id stays `berean` deliberately — that value is persisted in localStorage and hooked by `tokens.css`, so renaming it would reset every user's theme. Live theme picker in Settings (`src/utils/useTheme.ts`, `[data-theme]` blocks in `tokens.css`) lets the user choose Lantern / Scholarly Serif / Warm Paper / Quiet Modern independent of light/dark. Values chosen via a throwaway `design/mockup.html` compare-artifact + reading-UX/color research. F1–F4 (tokens, serif reading typography, contrast, motion) all landed, plus the note→study bridge and self-hosted scripture fonts closed out the sweep — see BACKLOG's Done section. Only cosmetic/optional polish (dark.css redundancy prune, elevation-over-borders consistency) remains, deliberately deferred past the first deploy. |
| Overlap-match on "Start study on {ref}" | Selecting verses that overlap an existing passage reopens it (with its notes) instead of always starting a blank study — interval overlap, not exact-range match, so a note anchored anywhere inside the selection surfaces. Superseded in spirit by the note-centric model below: there is no longer a distinct "study" to start or reopen, only notes on a chapter, but `findOverlappingPassage` is still what keeps a new note from spawning a redundant passage row underneath. |
| Note-centric model: study is a derived VIEW, not a stored container (2026-08-26) | Mobile study/note UX was Dennis's own live-use blocker — the desktop two-pane `StudyMode` (a `Passage` you name/reopen, holding `sessions` of `notes`) is a great power tool at a desk but a cognitive tax on one cramped mobile column. Rather than build a second mobile-shaped `StudyMode`, the model itself collapsed: a note anchored to scripture is the only saved unit; "study" became a mode of reading (desktop Read/Study toggle over `StudyWorkbench`) rather than a container the user creates and names. This removed a whole class of complexity for free — lazy passage creation, fragile passage-matching, multi-session ambiguity, the `study_id` question (`docs/proposals/study-id.md`, now superseded) — because none of it needs solving once there's no "study" object left to disambiguate. Shipped on the EXISTING `passages`/`sessions` tables, kept as invisible interim storage, specifically so this could ship with **zero schema migration**; a later, human-supervised cleanup retires those tables and denormalises `book_number`/chapter onto `notes` directly (see `docs/BACKLOG.md`). Journal changed in lockstep: from an index of saved studies to a derived, reflective history built from `getAllNotes()`. |

## Risks & mitigations

- **RLS correctness** — one policy pattern, verified with a second account
  attempting cross-access.
- **SQLite→Supabase migration fidelity** — tiny dataset; the migration script
  prints a before/after count-and-sample diff, and the legacy branch stays
  runnable as source-of-record until confirmed.
- **helloao dependency** — RESOLVED 2026-07-21. Was mitigated only by the
  provider interface + cache-forever (which protects chapters already read).
  The complete BSB now ships as `public/bible/bsb.json.gz` and serves as the
  fallback, so an outage no longer throws. Note the residual risk is *offline
  reading*, not availability — see the `BibleProvider` seam above for why those
  are different failure modes.
- **Crashes are invisible to the operator** — `ErrorBoundary` (app-level and
  scripture-pane) means a render throw degrades gracefully instead of blanking
  the page, but nothing reports it. Deliberate: error reporting means a service
  receiving data, and `public/privacy.html` would need to change in the same
  commit. `TELEMETRY.md` in the `hq` repo is the agreed contract for closing
  this; not built on either side yet.
- **The deployed system can drift from the repo** — learned the hard way on
  2026-07-21. A privacy audit run against `src/` passed while Cloudflare Web
  Analytics had been enabled in the dashboard and counting traffic for two days.
  Anything configured in the Cloudflare or Supabase dashboards is invisible to
  `grep`, so auditing the code is not auditing the product.
