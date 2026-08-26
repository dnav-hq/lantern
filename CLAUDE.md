# Lantern — working notes for contributors (human and AI)

Lantern is a personal Bible-study notes app. You read a passage, capture what you
see in it (observations, historical context, application, personal reflection),
and read those notes back later anchored to the verses. This is the web-first
rewrite; the old Electron desktop app is frozen on the `legacy/electron` branch.

**The model is note-centric (settled 2026-08-26).** A note anchored to
scripture is the only saved unit; "study" is a mode of reading, not a
container you create or name — see `docs/ARCHITECTURE.md`'s "Notes & studies
model" and its decision log for the full reasoning. Concretely: on desktop the
reading page carries a Read/Study toggle (`StudyWorkbench`) that edits a
chapter's notes directly beside the scripture; on mobile, capture is a
select-first, keyboard-aware inline composer, with no separate study surface at
all; the Journal is a derived, reflective history built from every note
(`getAllNotes()`), not an index of saved studies. There is no standalone
`StudyMode` page anymore.

**The app was renamed Berean → Lantern** (Psalm 119:105; "Berean" collided with
the Berean Standard Bible, the translation this app displays). The rename covered
user-visible strings and assets ONLY. **Internal `Berean*` identifiers are
deliberately unchanged** — `BereanApi`, `berean-api.ts`, `SupabaseBereanApi`, and
every persisted key (`berean.onboarded`, `berean-theme`, `berean-visual-theme`,
`berean-offline-mirror`, `berean-bible-cache`, and the default theme's stored id
`berean`). Renaming those would silently reset users' preferences and orphan their
cached data. Don't "tidy" them. The brand identity is wordmark-only — see
`src/components/Wordmark.tsx` for why every pictorial mark was rejected.

## Stack

Plain Vite + React 18 + TypeScript (strict). No framework, no router — the app is
a single-page tree with view state in `App.tsx`. Styling is hand-written CSS in
`src/assets/`. Backend is Supabase (Postgres + auth + RLS); scripture comes from
`bible.helloao.org`, cached in IndexedDB.

**All of that is built and LIVE** at [lanternword.com](https://lanternword.com)
(Cloudflare Pages, auto-deploying from `main`) — Supabase auth with Google OAuth
+ email OTP, real scripture, and the public landing/legal pages. The in-memory
stub (`src/api/memory.ts`) still exists and is still useful: with no
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the environment the app falls
back to it, so you can do pure-UI work with no backend by moving `.env` aside.
Keep `.env` in place when you need to exercise the real auth/data path.

## Hard rules

**Pure web only.** Nothing under `src/` may import a Node or Electron API
(`electron`, `fs`, `path`, `node:*`, `require(...)`, `window.electron`, etc.).
The whole point of this rewrite is that the same code runs in a browser, a PWA,
and later a Capacitor/Tauri shell. Platform capabilities that a native wrapper
would reimplement (file export, TTS) live behind `src/platform/` interfaces, not
inline. If you reach for a Node API, you are in the wrong layer.

**All data access goes through `BereanApi`.** Components never talk to Supabase,
`fetch`, or a global directly. They call `useApi()` (`src/api/context.tsx`) and
use the returned `BereanApi`. See the seam notes below.

**Keep the backlog honest.** `docs/BACKLOG.md` is the single source of deferred
work. Whenever you start, finish, or drop a backlog item, update that file in the
same change — move it out when done, add a line when you defer something new.
Don't let it drift.

## The two seams

Everything intentionally flexible about this app is expressed as one of two
interfaces. Understand these before changing data or scripture code.

### `BereanApi` — the data choke point (`src/api/`)

- `types.ts` — the interface. Evolved from the old Electron `window.api`: integer
  ids became UUID strings, the `Books` table became a static `book_number`
  (1–66) on `Passage`, and vault/updater/translation-settings methods were
  dropped.
- `context.tsx` — `ApiProvider` + `useApi()`. `useApi()` throws outside a
  provider so a missing wiring fails loudly.
- `memory.ts` — the in-memory stub. State lives in module maps and resets on
  reload. Seeds one sample passage so the app isn't empty. Still the fallback
  when Supabase env vars are absent, which makes it the fastest way to do pure-UI
  work.
- `supabase.ts` / `berean-api.ts` — the real, shipped implementation. It swaps in
  at the bootstrap with zero component changes, which is the whole point of the
  seam.

Because every mutation funnels through one object, the future offline write
outbox has exactly one place to live: a failed write is caught here and surfaced
as a friendly message today — that catch is the stub the outbox later replaces.
Cascade cleanup (delete note → delete empty session → delete empty passage) is
done explicitly in the implementation, mirroring the old desktop behavior.

**`Passage`/session are interim, invisible storage, not "studies."** The UI
never names, lists, or asks the user to choose a passage/session — it's
plumbing a note needs to hang off (`findOverlappingPassage` reuses an existing
passage rather than creating a redundant one). `docs/BACKLOG.md` has a deferred
cleanup to retire both tables and denormalise book/chapter straight onto
`notes`; until then, don't read a `Passage` in the schema as "a study" the
product has a concept of.

### `BibleProvider` — the scripture source (`src/bible/`)

`getChapter(bookNumber, chapter)` → verses in the `{ verse, text }` shape
components already consume. `helloao.ts` implements BSB; a future ESV provider
takes a user API key; a cache layer wraps any provider (chapters are immutable,
so cache forever). The memory stub fakes this inside `memory.ts.getBibleVerse`;
in dev a `FixtureBibleProvider` bundles a few chapters so contributors without
network egress still see real verses (it tree-shakes out of production).

The shipped composition is `FallbackBibleProvider(cache(helloao), selfHosted)`:
`self-hosted.ts` serves the complete BSB from `public/bible/bsb.json.gz` when
helloao fails, so the read path has no single point of failure. It is fetched
lazily (never on a successful read) and deliberately excluded from the PWA
precache. **This fixes availability, not offline reading** — a genuinely offline
user can't fetch the bundle either. See `docs/ARCHITECTURE.md` for the gzip
byte-sniffing gotcha, which is load-bearing and not obvious.

## Conventions

- Ids are client-generated UUIDs (`crypto.randomUUID()`); timestamps are
  client-set ISO strings. Both are deliberate — Tier-1 offline-sync readiness.
- Book identity is a USFM `book_number` (1 = Genesis … 66 = Revelation). All book
  metadata (names, aliases, chapter counts) lives in `src/utils/bibleBooks.ts`.
  There is no books table anywhere.
- Note categories are a closed set: `observation | historical | application |
  personal`. Sub-notes are just notes with `indent_level > 0`.
- Strict TS: `noUnusedLocals`/`noUnusedParameters` are on. Two-space indent,
  single quotes, no semicolons where the linter allows — run `npm run format`.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc --noEmit` then production build
- `npm run lint` / `npm run format`
- `npm test` — Vitest (unit tests for the pure `src/utils/` logic)

## Repo hygiene

**`src/` is Prettier-normalized as of 2026-07-20.** The whole tree was formatted
once, alone, in its own commit. Before that it had never been run through the
current `.prettierrc.json`, so `npm run format` rewrote ~40 otherwise-untouched
files — which is exactly why it had to be its own commit. That landmine is now
defused, and the rule going forward is simple:

- **Run `npm run format` freely.** On a clean tree it is a no-op; on your own
  changes it only touches what you edited. `npx prettier --list-different
  "src/**/*.{ts,tsx,css}"` should report **0 files** on `main` — if it ever
  reports more than the files you are working on, someone committed unformatted
  code and it is worth fixing separately.
- **Line endings: `.prettierrc.json` sets `"endOfLine": "auto"` on purpose.**
  Git here runs with `core.autocrlf=true`, so the working tree is CRLF while the
  committed blobs are LF (`git diff` is clean because git normalizes on compare).
  With Prettier's default `endOfLine: "lf"` that mismatch made
  `--list-different` report **every** file as unformatted on Windows, which
  invites a pointless CRLF/LF rewrite war between contributors. `"auto"` makes
  Prettier respect whatever the file already uses. Don't "fix" this by rewriting
  line endings or adding a `.gitattributes` eol rule without a reason.
- **Never mix a reformat with a feature change.** If a formatting sweep is ever
  needed again, it goes in its own commit with no other edits, so a real diff is
  never buried in reflow.
- **The formatter is deliberately scoped** to `src/**/*.{ts,tsx,css}`. It does NOT
  touch `index.html`, `public/*.html` (the live landing fallback and legal pages),
  `supabase/templates/*.html` (the auth emails, which are hand-tuned for email
  clients), or `design/`. Don't widen that glob casually — those files have
  whitespace/structure constraints the formatter doesn't know about.
- **This repo has more than one writer.** Other chats and HQ cloud workers push to
  `main`. Always `git fetch` before assuming you are in sync, **stage only the
  files you changed** (never `git add -A`), and expect to rebase. If a rebase
  conflicts in `docs/BACKLOG.md`, resolve by keeping BOTH sides — two agents
  closing different items is the normal case, not a mistake.

## Layout

`src/App.tsx` holds view state for the three destinations (Bible, Journal,
Profile) plus the desktop-only `studyOpen` flag that toggles the reading page's
Read/Study workbench — there is no separate study route to navigate to.
`src/components/` is the UI. `src/api/` is the data seam. `src/bible/` is the
scripture seam. `src/utils/` is pure logic (book metadata, note parsing,
rich-text serialization, dark mode). `src/offline/` is the local-persistence
layer: `status.ts` (fetch-failure-based connectivity, not `navigator.onLine`),
`mirror.ts` (read mirror), and `draft.ts` (in-progress note drafts, so a reload
can't destroy unsaved work). `src/platform/` holds capabilities a native wrapper
would reimplement (export today; TTS later). `supabase/migrations/` is schema:
`0001_init.sql` is the app, `0002_analytics_views.sql` is six owner-only
analytics views (revoked from `anon`/`authenticated` — query them in the
Supabase SQL editor).

Design, schema, and the decision log live in `docs/ARCHITECTURE.md`; deferred
work in `docs/BACKLOG.md`; and `docs/proposals/` holds research written *before*
building — currently `study-id.md`, `offline-write-outbox.md`,
`onboarding-hints.md` and `scripture-search.md`. Those are worth reading before
touching their areas: two of them concluded the work should NOT be done as
specified, which is why only draft persistence shipped instead of a full write
outbox. `study-id.md` is now marked superseded — its no-schema-change verdict
held, but the later note-centric model went further and removed the "study
instance" concept the proposal was reasoning about in the first place; see its
header note and `docs/ARCHITECTURE.md`'s decision log.

The original phased migration (scaffold+stub → Supabase → scripture → mobile UI
→ PWA/offline → deploy) is complete; the app is live, so `docs/BACKLOG.md` is
now the map of what's left rather than a phase plan. As of 2026-07-21 everything
remaining in it is demand-gated: nothing is blocking, and the next priorities
should come from what real users do rather than from the list.
