# Backlog

Deferred work. This file is the single source of truth for it. **Rule:** whenever
an item is started, finished, or dropped, update this file in the same change —
move completed items to the bottom section, add a line when you defer something
new. Don't let it drift.

Items are roughly ordered by when they're likely to matter, not strictly
prioritized.

**Arc-level sequencing lives in `docs/ROADMAP.md`** (added 2026-08-31). This
file stays the item-level source of truth; the roadmap says which arc an item
belongs to and why that arc comes when it does.

## Deferred

- **Journal retrieval, step 1 of 5: FILTERING (DONE 2026-08-31).** Composable
  book + category filters on the Journal, entirely client-side over the notes
  already fetched — no API method, no migration, per
  `docs/proposals/journal-retrieval.md` §3.1. Logic is in
  `src/utils/journalFilters.ts` (structurally typed, React-free, 17 tests) so
  the rules are testable without rendering. Categories are DERIVED from the
  notes present rather than hardcoded, so user-owned categories need no second
  pass here. Books offered are only the ones actually written in, in canon
  order — never a 66-item picker. Both of the brief's rules are honoured: the
  active filter is always visible with one-tap clear, and an empty result is a
  sentence naming its cause ("No historical notes in Romans.") with the undo
  inline. Remaining steps, in order: finish the existing search (land the
  reader at the VERSE not the passage, and stop truncating silently at 50),
  surface the passage-centric view, upgrade export, then saved filters.

- **ESV's quota ceiling is a SCALING constraint, and it should be watched
  (2026-08-31).** Crossway's 5,000/day, 1,000/hour, 60/minute limit is PER
  APPLICATION, so it is shared across every Lantern user, not per person
  (`supabase/functions/esv-proxy/handler.ts`). With the cache now persisting,
  a rough capacity estimate is 1,000-1,500 DAILY-ACTIVE ESV readers before the
  daily cap binds. That is roughly two orders of magnitude beyond today, so it
  blocks nothing now — but it is the one part of Lantern that does NOT scale for
  free, and it is worth knowing before a growth push. Note the constraint is on
  ESV, not on the app: BSB/KJV/NET are self-hosted and cost nothing per read at
  any scale, so the failure mode is "one translation stops scaling", not "the
  app cannot stay free". Mitigation already shipped: the reader falls back to
  BSB with a visible notice rather than hitting a dead end. Next lever if it
  ever binds: per-user metering in the proxy, or the licence conversation in
  `translations-path-to-esv-niv.md` from a position of real traction.

- **The note object — highlights, user-owned categories, and RETRIEVAL
  (2026-08-30, new arc; see `docs/proposals/note-object.md`).** A research pass
  contradicted the standing assumption that capture latency is Lantern's top
  defect: serious users of mature note tools complain about *retrieval*
  ("hard to find, hard to discover, hard to retrieve, hard to organize… the
  single worst part of Logos") and fear "a complete mess of notes." Lantern has
  not hit this yet only because it has one user with months of notes — the
  defect scales with the product's own success. Three pieces: (1) **highlight =
  a note with no body** (same verse anchor, same categories, same colour, one
  action in the existing composer — deliberately NOT sub-verse word selection,
  which would forfeit the translation-independence Lantern currently wins on);
  (2) **user-owned categories** (rename/recolour free, add/remove with a cap
  ~8, four defaults kept — this is a schema change touching the `BereanApi`
  seam, not a settings toggle); (3) **the Journal becomes a retrieval surface**,
  not just a derived history (needs its own design pass; nearest competitor
  Harvous ships "Recall" and made resurfacing its thesis). Hard constraints
  inherited from the research: no streaks, scores, or activity metrics; any
  resurfacing is pull, never push. Note-object work sits *underneath* the
  deep-dive layers and group sharing, and unlike them it depends on no
  translation licence.

- **Translations: the settled position + zero-cost next actions (2026-08-30;
  see the addendum in `docs/proposals/translations-esv-niv.md`).** Settled:
  **BSB + KJV + NET offline and permanent; ESV online-only while Lantern stays
  free; NIV only if Biblica surprises us.** Decisions made: do NOT form a legal
  entity (Australian Pty Ltd / incorporated association overhead is not worth
  it for a free app with ~1 user, even though "organizations not individuals"
  turns out to be an entity-form test that a small LLC clears); do NOT buy
  API.Bible (it sells breadth, and cannot supply either translation Dennis
  wants); do NOT take the YouVersion Platform's Biblica licence (forbids
  offline, caps display at 25 verses, forbids AI-personalised content, and its
  non-commercial obligation is **app-wide**, not scoped to NIV). **Tripwire:
  any paid feature or donate button breaks ESV compliance today** — Crossway
  counts donations as commercial and revokes at will. Zero-cost actions, none
  blocking: test whether Harvous actually serves NIV offline; email Crossway
  and Biblica (free, a "no" is still worth having); email Derek Castelli
  (derek@harvous.com) and ask how he licensed his 11 translations; add a
  comment in `src/bible/esv.ts` pointing at the tripwire.

- **ESV performance: persist the cache + prefetch neighbours (2026-08-30,
  compliant, unblocked).** ESV refetches on every reload because
  `src/bible/esv-cache.ts` is in-memory only — a deliberately conservative
  choice its own comment admits is "stricter than the letter of the license
  requires." Two wins inside Crossway's 500-verse cap: (a) persist the cache to
  IndexedDB so reloads stop refetching (tradeoff: writes licensed text to disk,
  which the original author avoided on purpose — Dennis's call); (b) prefetch
  the next/previous chapter on idle, which is where most of the perceived
  slowness actually lives. Neither removes new-chapter latency beyond the cap;
  only a Crossway licence could.

- **Distribution / discoverability — the gap that is actually costing us
  (2026-08-30).** Harvous is not beating Lantern on product; it is beating it
  on being findable. It ships 40+ comparison pages (vs Notion, Obsidian,
  YouVersion, Logos, Apple Notes, Olive Tree…), seven use-case landing pages,
  and ten feature pages, and consequently owns search for "best Bible notes
  app." Lantern has nothing comparable. Not 40 pages — the ten that matter,
  including an honest Lantern-vs-Harvous page. Cheapest meaningful win
  available, and it needs no licence and no schema change.


- **Deep Dive — verse study exploration (the "go deeper" arc).** Full design +
  data research captured in `docs/proposals/deep-dive-study.md`; cross-references
  prototype in `design/reference-deep-dive.html`. The feature replicates the whole
  roving study experience across a zoom spectrum (word → whole-Bible), presented
  psychology-first as ranked "doorways" that anticipate the question a verse
  provokes, never a dump. Data for every layer is confirmed open + self-hostable
  (helloao footnotes = CHEAP/ship-first; BSB per-word Strong's + STEPBible
  lexicons for word study = MEDIUM/highest-value; OpenBible verse-linked geocoding
  for a custom verifiable interactive map + timeline slider, kept in the FREE
  core; author ~66 book intros). Philosophy guardrail: primary data only, never
  AI-authored meaning; epistemic humility. The "how people study" research pass
  RAN 2026-08-30 (see the proposal's addendum): it confirmed the doorways thesis
  and changed four things — doorways must open only AFTER a full read (never
  auto-expand, so this stays behind the Read/Study toggle); translation
  divergence returns as a SALIENCE SIGNAL routing into the word door rather than
  a door of its own (BSB alternate-rendering footnotes first, NET later); the
  word door needs a guardrail DESIGN (root fallacy / totality transfer) before a
  build ticket; and "don't see for them" is revised to mean mediated by METHOD,
  not by CONCLUSIONS, because raw lexicon data is not neutral. This also splits
  the footnote layer in two: alternate-rendering footnotes are safe and ship
  first, textual-variant footnotes ("some manuscripts omit") cause anxiety and
  should be gated. Build order unchanged: footnotes → word door → map → intros.
  The deep-dive entry surface will likely be redesigned from scratch on the
  doorways model rather than reusing the connections prototype.

- **Guest cleanup after the guest-is-the-App change (2026-08-27) — the two
  mechanical loose ends are DONE (2026-08-28, see Done); one optional item
  remains.** A subtle in-reader "preview" indicator so a guest mid-reading (not
  just on the Profile tab) knows nothing is saved. Optional polish, not started.

- **Note-capture editor: tag selector + verse pills + type-@-to-select
  (taste — prototype with Dennis).** The desktop quick-note (`QuickEditCard` +
  `InlineTagInput`) shows the verse tag as plain text (`v2-5`) while the edit
  path (`RichEditInput` + `renderRich`) renders styled pills — inconsistent.
  Dennis's direction (2026-08-27): give the quick-note a **tag SELECTOR** like
  the mobile composer / study workbench, render **verse pills** while typing,
  AND let the reader **type `@category`** so it applies to the selector and
  removes itself from the text. Touches both signed-in and guest desktop (shared
  component). Taste-heavy: prototype the interaction with Dennis before speccing;
  a blind build would be redone. (HQ capture 56d4cfcb.) Note: a standalone
  "`@`-dropdown click doesn't select" bug was reported but could not be
  reproduced in current code (clicking inserts the tag in tests) — re-check on a
  real device; the selector redesign supersedes that dropdown anyway.

- **Retire `passages`/`sessions` tables; denormalise book/chapter onto `notes`.**
  The note-centric model (2026-08-26, see `docs/ARCHITECTURE.md`'s decision log)
  shipped on the *existing* `passages`/`sessions` schema deliberately kept as
  invisible interim storage, specifically so mobile capture, Journal-as-history,
  and the desktop Read/Study toggle could ship with **zero migration**. That
  schema is no longer the model the UI presents (a note is the only saved unit;
  "study" is a derived view), so it is now bookkeeping overhead a note has to
  route through rather than something the product needs. This item is the
  human-supervised cleanup: retire `passages`/`sessions`, move `book_number` +
  chapter (currently reached via `session_id -> passage_id`) directly onto
  `notes`, and update `BereanApi`/`SupabaseBereanApi`/`memory.ts` and every
  read (`getNotesByBook`, `getAllNotes`, `getNotesByPassage`, search) to query
  notes directly. Needs a real Supabase migration + data backfill (existing
  `passages.reference_label`/verse-range data must survive the move), so it
  is explicitly **not** a same-shape worker task — a schema change with a
  backfill needs Dennis's judgment on migration safety and rollback, not a
  blind overnight run. `findOverlappingPassage`'s dedup-by-range behaviour must
  be preserved in the new shape (or replaced by an equivalent anchor-overlap
  query directly on `notes`) — it's what stops a note from spawning a
  redundant row today. Revisit once the interim shape has proven itself in
  real use, or sooner if the extra join starts showing up as a real cost.


- **Guest preview mode.**
  `docs/proposals/guest-preview-mode.md` (2026-08-03) resolves the guest-write
  question Dennis was unsure about: recommends (B), an ephemeral client-only
  sandbox note editor (nothing persisted, no data model, resets on reload —
  not the rejected local-persistence or second-user-type shapes) over pure
  read-only, since it lets a guest feel the read-notice-write loop rather than
  just read about it. Defines the guest boundary as one inverted, gated-by-
  default rule (unauthenticated = scripture + sandbox only; anything touching
  an account/stored data/other people is gated by default, with a named
  explicit opt-in escape hatch for future public features) rather than a
  maintain-forever allowlist. Confirms the RLS/telemetry surfaces add no new
  risk. It also flagged that the ESV proxy was exposed with no per-IP
  protection — that piece has since shipped, see "ESV proxy rate limiting" in
  Done. Guest preview itself ships BSB/KJV only; ESV stays signed-in-only
  until/unless that changes. See the proposal's own MVP slice and "Trigger to
  revisit" for sequencing.
  **Settled stance added 2026-08-03 (proposal §2a/§2b):** sign-in stays the
  primary flow; guest is a durable, never-nagged free *reading* app (installing
  the PWA and reading forever without an account is a legitimate end state, not
  a failed conversion); the sign-in prompt is scoped to the note-taking moment
  only, so pure readers are never prompted; true offline reading stays deferred
  (guest reading is BSB/KJV, which is also the only offline-capable shape).

  **G1 — the guest reading surface + the boundary — is DONE (2026-08-03).**
  `Root.tsx` gained a `guest` phase rendered OUTSIDE `ApiProvider` (the §4
  inverted rule made structural, not a check), and `src/components/GuestReader.tsx`
  reads scripture through the `BibleProvider` seam only — library → book →
  chapter, prev/next across book boundaries, BSB/KJV (never ESV), with no
  notes/study/journal/account UI reachable from it. `berean.guest`
  (`src/components/guestMode.ts`) makes a reload or PWA relaunch return to the
  reader; a corner "Sign in" clears the flag and hands back to the landing page.
  What remains of guest preview, each its own piece of work:

  **G2 — the ephemeral note sandbox — is DONE (2026-08-03).** Tapping a verse
  in `GuestReader.tsx` opens an inline editor (reusing `InlineTagInput` and the
  `.quick-edit-card` chrome QuickEditCard.tsx also uses) backed by plain
  `useState` inside `GuestChapter` — no `BereanApi`, no `localStorage`, no
  IndexedDB, nothing that outlives the render; closing the tab or reloading
  drops it completely. A permanent ambient label ("You're trying this out.
  Nothing you type here is saved. Sign in to keep it.") sits on the editor
  from the moment it opens, never a toast, mirroring `StudyMode.tsx`'s
  draft-recovery notice shape. The sign-in call to action is styled like the
  app's other inline text links (accent color + underline) rather than
  inheriting the notice's own tint, so it reads as tappable rather than as
  part of the sentence. This is the *only* place a guest is invited to sign
  in (§2a); reading stays un-nagged.
  - **G3 — the real landing CTA** (§7). G1 ships a deliberately temporary
    entry button so the guest tree is reachable now; the designed hero CTA
    ("Read the Bible free — no account needed") replaces it and is a design
    pass on `src/components/landing/`, untouched by G1 on purpose.
  - **G4a — one deep-linkable route — is DONE (2026-08-03).** `src/utils/deepLink.ts`
    is a pure `parseDeepLink(pathname)` parsing `/read/<book>/<chapter>` (book
    by name/alias/slug via `bibleBooks.ts`, case-insensitive, multi-word and
    numbered books like `1-john` / `1 John`; chapter numeric and range-checked)
    — unit-tested for a plain book, a numbered book, a multi-word book, an
    unknown book, an out-of-range chapter, and trailing/casing variants; any
    miss is `null`, never a throw. `Root.tsx` reads it once at startup
    (module-level — v1 is on-load parsing only, no `pushState`-as-you-browse)
    and threads it to whichever surface actually renders: a signed-out visitor
    is dropped straight into guest reading on that passage with no sign-in
    wall (`enterGuestMode()` fires even without the persisted flag), a
    signed-in visitor's `App` opens directly on the equivalent reading
    surface, and `GuestReader`/`App` both already had the book-number +
    chapter shape this needed. No hosting/redirect-config change — this rides
    the existing SPA fallback, per the spec.
  - **G4b — edge-rendered per-passage previews + crawlable HTML.**
    `docs/proposals/guest-deep-link-seo.md` (2026-08-03) covers the layer on
    top of G4a's URLs: recommends a Cloudflare Pages Function intercepting
    `/read/*` that serves crawlers/unfurlers real per-passage meta + BSB/KJV
    verse text (humans still get the SPA), over build-time static
    prerendering of all ~1,189 chapters or an SSR/framework migration — both
    rejected as disproportionate to the problem. ESV stays out of any
    server/edge-rendered HTML per the licensing terms in
    `docs/proposals/translations-esv-niv.md`. Separates link-preview value
    (high, achievable) from search-ranking value (low near-term, saturated
    niche against BibleGateway/YouVersion — explicitly not promised). Pairs
    with a static sitemap/robots.txt/canonical pass. G4a has landed; not
    started.
  - **G4c — shareable passage cards (verse + note), link and image shares.**
    `docs/proposals/shareable-passage-cards.md` (2026-08-04) recommends
    against a generic verse-on-a-gradient image (a saturated category
    YouVersion and others already own) and centres Lantern's real
    differentiation instead: the verse rendered together with the user's own
    note, the read-notice-write loop made shareable. Sharing a note is an
    explicit, per-share "share this one publicly" opt-in, never automatic and
    never a blanket setting — verse-only shares stay trivially public. Two
    modalities: a LINK share that upgrades G4b's edge Pages Function with an
    `og:image` renderer (satori/resvg-style, same BSB-bundle data source) so
    the beautiful card IS the OG image rather than a second system, and an
    IMAGE share (client-canvas or edge-rendered PNG) for Instagram/stories
    where links don't unfurl. BSB/KJV only, same as G4b, per the ESV
    licensing constraint. Recommends readable deep links over a URL
    shortener. Demand-gated: build after G4a (done) and G4b land and there's
    real usage to share to, not speculatively now — smallest slice is G4b's
    `og:image` upgrade, then the note-carrying share path, then the PNG
    composer last. Not started.

- **Internal `Berean*` identifiers stay — standing decision, not pending work.**
  `BereanApi`, `berean-api.ts`, `SupabaseBereanApi`, and the persisted keys
  (`berean.onboarded`, `berean-theme`, `berean-visual-theme`,
  `berean-offline-mirror`, `berean-bible-cache`) were NOT renamed in the Lantern
  rebrand. Renaming the storage keys/DB names would silently reset every user's
  prefs and orphan their cached data; `BereanApi` is the documented seam in
  CLAUDE.md. The default theme's stored id also stays `berean` (only its visible
  label became "Lantern"). Listed here so nobody "tidies" it, not because it is
  queued.

- **Design sweep — remaining work.** The visual/structural + motion polish
  passes are both done: token layer (F1 + F1b warm dark), serif reading
  typography (F2), contrast (F3), top-bar/library true centering, the theme
  picker, the overlap-aware study flow, F4 motion (entrance/press/spring
  micro-interactions), and a round of mobile study-editor/nav fixes (see Done,
  below, for the full history). Bible/Journal toggle-vs-tabs was discussed and
  decided against — not adopting it, not revisiting. The note→study bridge in
  ChapterView and the font self-host are also done now (see Done). Mobile nav
  priority is closed as a deliberate decision (see Done). What's left is
  optional polish only:

  - **Elevation-over-borders + cross-surface max-width polish.** Optional refinement:
    apply the `--elev-*` scale to reader/journal/study cards (currently border-led)
    and reconcile the library vs. journal vs. book-detail max-widths for a fully
    consistent measure across every page. Optional, skip for the deploy pass.

- **Accent-as-text contrast sweep (measured 2026-07-21).** The category fix
  above introduced `--accent-ink` and used it for the observation pill, but
  roughly **19 other `color: var(--accent)` sites** — links, buttons, active
  states — were left alone. As text on the light canvas `--accent` measures
  about **4.25:1**, below the 4.5:1 AA floor, so those are genuinely
  non-compliant today. The token to fix them already exists; what stopped it
  being done in the same pass is that `--accent` is the app's primary colour and
  swapping it across every link and button is a visible design change that
  should be looked at, not merged sight-unseen. Note some of those sites sit on
  `--surface` (white in scholarly/modern) rather than the canvas, where the
  ratio is better — so this needs a per-site measurement, not a blanket
  find-and-replace.
- **Telemetry: hand HQ the bearer token, and re-verify after the first real
  deploy.** The endpoint is live and verified (see Done), but two things are
  outstanding. (1) `HQ_TELEMETRY_TOKEN` is set as a Supabase secret on the
  `berean` project and the value was handed to Dennis in-session — it is not in
  the repo, not in `.env`, and not recoverable from the dashboard, so if it is
  lost, generate a new one and `supabase secrets set` it again. HQ's ingest is
  P2 and not built, so nothing consumes it yet. (2) Source-map upload has only
  been exercised with a hand-set `COMMIT_SHA`; on Cloudflare Pages the sha comes
  from `CF_PAGES_COMMIT_SHA`, and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  must be added to the Pages build environment or every deploy silently skips
  the upload and symbolication degrades to raw frames. **That skip is by design
  and is not an error**, so it will not fail a build — check the build log for
  `[sourcemaps] uploaded N/N` after the first deploy rather than assuming.

- **Offline write outbox.** Queue failed mutations locally and replay them on
  reconnect. `docs/proposals/offline-write-outbox.md` researched this in full
  and recommended waiting: the narrower, actually-dangerous gap (in-progress
  note content lost on tab close/reload before a failed save can be retried)
  is closed — see Done, "Persist in-progress note drafts." What's left here is
  the full queue-and-replay design: idempotent upserts on the create methods,
  replay-on-reconnect, and conflict handling / last-write-wins (or better)
  reconciliation given client-set timestamps. Revisit when either a second
  device becomes a real regular pattern for a user, or draft-persistence
  alone turns out not to be covering real losses (see the proposal's own
  "Trigger to revisit" section).

- **NIV provider — researched, not recommended yet.** `docs/proposals/translations-esv-niv.md`
  (2026-07-22) found a free non-commercial path exists (API.Bible / American
  Bible Society) but NIV is the worst fit of the three translations it
  examined: commercial use is blocked outright with no published unlock
  price, Biblica's approval process is heavier and more subjective than
  Crossway's, it's genuinely unclear whether a full reading app is even the
  "quotation" use case Biblica's blanket permission covers, and no local-
  storage/caching cap distinct from the per-query limit was confirmed (so the
  cache design can't be fully scoped yet). Recommendation: don't build until
  a real user asks for NIV specifically and Dennis is willing to get Biblica's
  direct written confirmation that an app is a licensable use — see the
  proposal's "Trigger to revisit." **Superseded on the licensing question by
  `docs/proposals/translations-path-to-esv-niv.md` (2026-08-30)**, which
  enumerates eight routes to ESV and/or NIV. **Corrected 2026-08-31:** the
  brief's Australian angle (NIV rights sitting with Bible Society Australia)
  is a dead end — BSA holds a PRINT publishing licence only, and Biblica Inc.
  holds rest-of-world digital rights directly. See the corrections section at
  the top of that brief.

- **Two unanswered ESV licensing questions — ask Crossway before they bite.**
  `docs/proposals/translations-path-to-esv-niv.md` (2026-08-30) found both, and
  both are cheap now and expensive later. (1) Crossway's free tier defines a
  non-commercial site as one that "does not charge for access to any part of the
  site", so on the plain reading **any** paid feature anywhere in Lantern ends
  ESV eligibility, not just a paid scripture feature; a plain donate button is a
  closer call and also unresolved. (2) Crossway's policy is to "license to
  organizations, not to individuals or solo developers", and it is unresolved
  whether an Australian sole trader with an ABN clears that or whether a
  separate legal person (Pty Ltd, $636 + $342/yr) is genuinely required. The
  brief recommends emailing `licensing@crossway.org` first, before spending
  anything, and ships the ready-to-send draft. **Question (2) is now ANSWERED,
  2026-08-31:** Crossway's ESV Digital Licensing Proposal form states on its
  first field that "we do not license to individuals; such requests will be
  automatically declined", and requires a legal organization name, a history of
  the organization, and a signatory with a position. An entity is mandatory,
  not merely preferred, and the wording is "organization or ministry" — which
  in Australia points at an incorporated association rather than the Pty Ltd
  the brief costed. **Do not submit that form as an individual**; a decline
  spends the first contact. Blocks nothing today: api.esv.org explicitly
  permits use in mobile apps and other digital media WITHOUT formal permission,
  so the current integration is lawful and stays that way indefinitely as long
  as Lantern charges for nothing. Dennis's call 2026-08-31: not pursuing the
  publisher enquiries for now; only the peer enquiry to Harvous was sent.

- **Groups / shared workspaces.** `docs/proposals/groups-shared-workspaces.md`
  (2026-07-22) researched this in full and found the "no migration" framing
  above was only half true: the `workspace_id`/`workspace_members` tables and
  the passages/sessions/notes RLS pattern really are already in place, but the
  member-list visibility policy is deliberately own-rows-only (recursion
  avoidance), `role` is unenforced by any CRUD policy, `workspace_members` has
  no INSERT/UPDATE/DELETE policy at all (membership writes need new
  `security definer` RPCs, same pattern as the signup trigger), and
  `SupabaseBereanApi` resolves one hard-coded personal workspace at
  construction with no multi-workspace concept anywhere in the client. The
  proposal recommends a staged MVP (member-visibility fix + invite/accept →
  conflict-safe `updateNote` → role enforcement → leave/remove + privacy/terms
  updates) rather than one migration, and to wait for an actual expressed want
  for shared study before starting. Revisit per the proposal's own trigger.

- **AI features over notes.** Summaries, thematic linking, question-answering
  across a user's own notes and passages. Needs an embedding/index strategy and a
  cost model.

- **A lightweight, non-intrusive "what's new" / patch log.** Captured
  2026-08-24 during the mobile-notes redesign session: a way for users to see
  that Lantern is actively shipping and what changed, reachable from
  Settings/Profile (a quiet, dismissible entry or a subtle dot revealing a
  simple reverse-chronological list) — deliberately **never** a launch modal or
  a nagging badge. Lantern has a few real users, not zero, so this has genuine
  value, but a changelog must never intrude on the devotional moment; it should
  read as calm and optional, in keeping with the app's taste-first ethos. Not
  speced yet — capture-only, brainstorm the surface with Dennis before building.

- **Audio / TTS.** Read scripture and/or notes aloud. Lives behind `platform/` so
  a native wrapper can substitute a device TTS engine.

- **Full-Bible offline prefetch.** Optionally cache the entire BSB into IndexedDB
  up front, rather than lazily per chapter, for guaranteed offline reading.
  Still the real answer for offline readers and for `bible.helloao.org` being
  down (see the availability risk below): the cache is lazy, so today a user only
  holds chapters they have already opened, and `HelloaoBibleProvider` *throws* on
  a failed fetch rather than degrading.
  **Partially mitigated in dev only** (2026-07-15): `FixtureBibleProvider`
  (`src/bible/fixture.ts`) bundles the four chapters `seedMemoryApi` seeds, and
  `FallbackBibleProvider` serves them when the network is unreachable. It is
  gated on `import.meta.env.DEV` and tree-shakes out of production, so it does
  nothing for real users — it exists so contributors and agents in sandboxes
  without egress see real verses instead of a thrown fetch. Four chapters is a
  fixture, not a Bible; this item stands.
  **Availability half now solved (2026-07-20):** the complete BSB is bundled and
  shipped as `public/bible/bsb.json.gz` (see "Self-hosted BSB fallback" under
  Done), so a helloao outage no longer throws — `SelfHostedBibleProvider` serves
  the missing chapter. What remains of *this* item is the **prefetch** proper:
  the bundle already exists, so guaranteed up-front offline reading is now reduced
  to hydrating the IndexedDB cache from that bundle (decompress once, populate
  `berean-bible-cache`) instead of downloading anything new.
  **Do not mistake the availability fix for an offline fix (verified 2026-07-21).**
  They are different failure modes and only the first is solved. If helloao is
  down but the user is ONLINE, the fallback works: the bundle is fetched from our
  own origin. If the user is genuinely OFFLINE, scripture outside the lazily-cached
  chapters still fails — the bundle is deliberately excluded from the service-worker
  precache (`globIgnores` in `vite.config.ts`) and no `runtimeCaching` rule matches
  it (the only rule is Supabase `NetworkOnly`), so `fetch('/bible/bsb.json.gz')`
  fails offline just like helloao does. That exclusion is correct — precaching it
  would push ~1.2 MB onto every first load — so the fix is an explicit, opt-in
  "download for offline reading" action, not a change to the precache glob. This
  is exactly what makes this item cheap now: the asset already exists and is
  already served, so the remaining work is caching one file on purpose plus the
  UI to trigger and report it.

- **Scripture full-text search (verse-text search).** Search v1 (UX overhaul,
  workstream 6) only *parses* a query into a reference jump ("mat 2:13" →
  Matthew 2) via `parseScriptureQuery`; it does NOT search the words of
  scripture. Searching verse text depends on having the full BSB available to
  index (the Full-Bible offline prefetch item above) plus a client-side index
  strategy. Deferred deliberately.

- **Multiple study instances over the same verses — UI-only follow-up shipped
  in `BookDetailPage`; ReadingMode's equivalent secondary affordance still
  deferred.** This item previously proposed a nullable `study_id` stamp on
  notes and was described as "the one part of the model that needs a schema
  touch." That was wrong, and `docs/proposals/study-id.md` (2026-07-20) proves
  it by driving the running app rather than reasoning about it — both halves of
  what `study_id` was going to buy (distinct second studies, merge-by-overlap
  reading) were already provided by `notes → sessions → passages`; no column,
  no migration.
  What actually remained was the one small **UI-only** gap the proposal
  identified: `BookDetailPage`'s selection-driven "Start study on {ref}" and
  "Study chapter" always *reopened* an overlapping passage while still saying
  "Start"/using neutral wording, with no way to reach a genuinely new study
  short of retyping the reference in `+ Study`. **Fixed:** both buttons now
  read "Continue…" when `findOverlappingPassage` finds a match (unchanged
  "Start study on {ref}" / "Study chapter" wording when it doesn't), and the
  overlap case shows a subordinate "Or start a new study on these verses" link
  that takes the same no-`passageId` path `+ Study` already used.
  `ReadingMode`'s selection button had the identical label bug (it always
  resolves to the currently-open passage, so it always said "Start" while
  always resuming) — also fixed, unconditionally reading "Continue study on
  {ref}" now. Its secondary "start a new study" link was deliberately **not**
  added — doing so needs a new prop/`App.tsx` wiring change (rather than the
  `BookDetailPage` in-component branch), so it's left here as the remaining
  optional follow-up if Dennis wants it discoverable from the per-study
  reading view too.
  **MOOT as of the note-centric model (2026-08-26).** `StudyMode` and the
  "start a new distinct study" question it's about are gone — there is no
  longer a "study instance" to start, continue, or disambiguate; a chapter
  just has the notes it has. `docs/proposals/study-id.md` is marked superseded
  accordingly. Not carrying the remaining `ReadingMode` follow-up forward.

- **Postgres full-text index for note search.** `SupabaseBereanApi.searchNotes`
  is a case-insensitive `ilike '%q%'` scan (v1, acceptable per the plan). For
  larger workspaces, replace with a `tsvector` column + GIN index and
  `websearch_to_tsquery` — a schema/migration change, hence deferred. The
  `BereanApi.searchNotes` seam and both implementations already exist, so this is
  purely an implementation swap behind the interface.

- **Capacitor mobile wrap.** Package the web app as a native iOS/Android app
  reusing the same code. Platform capabilities (export, TTS) get native
  implementations behind their `platform/` interfaces.

- **Tauri desktop wrap.** Same idea for desktop, replacing the frozen Electron
  app. The web code is the source of truth.


- **Paid tier considerations.** If/when hosting or AI costs warrant it: what's
  free vs paid, billing, quota enforcement. Design the free single-user
  experience so it never feels crippled.

## Done

- **Highlights as bodiless notes (DONE 2026-08-31, mobile capture; desktop
  gesture still open).** `note-object.md` §2: a highlight is a note with no
  body — same anchor, same categories, same colour, same Journal, same export.
  No new table, no `kind` column; emptiness is already the truth, so the kind
  is DERIVED (`src/utils/noteKind.ts`) and a mark that later gains a body
  simply stops being one. Adds the missing bottom rung for the moment you
  notice something and have no words for it yet.
  **The subtlety that nearly broke it:** a mark is NOT stored as an empty
  string. `composeNoteContent` always writes the anchor and tag, so a mark on
  verse 4 is `v4 @personal`. Testing `content === ''` classified every mark as
  a written note whose text had gone missing. `isHighlight` now tests for
  PROSE, reusing the parse the Journal already did (that duplicated logic is
  now shared rather than copied).
  Wired through every consumer so a mark is never silently dropped: the Journal
  keeps it and shows a quiet italic "Marked" rather than an empty row; export
  writes "*(marked)*" rather than a bullet trailing into nothing; and the
  Journal gains a third filter axis (Notes / Marks), offered only when the
  reader actually has both. Capture is the existing mobile composer with no new
  button — picking a category without writing changes the Save label to "Mark",
  so it is discoverable without competing with Save.
  **Not done:** the desktop gesture. Desktop capture is free-form text with
  inline `@category` tags, so "mark without writing" has no obvious equivalent
  there and needs a design pass. **Not verified in-browser:** the end-to-end
  mobile capture gesture — the pane stopped accepting synthetic pointer events
  this session. The predicate is unit-tested against the real stored format (9
  tests) and everything downstream is typechecked, but the create path itself
  wants a real-device pass.

- **Journal retrieval, step 3 of 5: chapter note marks (DONE 2026-08-31).**
  Turned out to be far smaller than the brief assumed, because most of it
  already existed: `BookDetailPage` already computed `chaptersWithNotes`,
  already rendered a neutral `chapter-note-dot` under chapters with notes, and
  already showed "N with notes" in the header. What was missing was the colour.
  Dennis's call (design/chapter-note-count.html then -v2.html): the pip now
  carries the chapter's DOMINANT category, so the strip answers both "which
  chapters have I written in" and "what kind of work was it" at the moment you
  are choosing where to go. Deliberately ONE pip, not a stack — several would
  turn a navigation control into a chart, noisy on Psalms. Deliberately NO
  count in the strip: presence, not quantity. Logic in
  `src/utils/chapterNoteMarks.ts`, 10 tests. Also fixed a real bug found on the
  way: the strip read `chapter_start` directly, so a note with an
  `anchor_chapter_override` marked the WRONG chapter and left the right one
  unmarked. The header's "N with notes" stays — it is a book-level summary the
  scrolling strip cannot show at a glance, so it complements the pips rather
  than duplicating them. Remaining in the arc: step 5, saved filters.

- **Journal retrieval, step 4 of 5: EXPORT rebuilt as a trust artifact (DONE
  2026-08-31).** Per `journal-retrieval.md` §4, which frames export as a trust
  PRECONDITION rather than a feature: the durable anger in this category is
  from people whose years of notes were trapped in a discontinued or
  re-platformed product, and that anger is about custody. Three problems fixed
  at once. (1) It was a backup of an obsolete model — one file per `passages`
  row, so a reader opening the zip saw folders named after storage rows. Now
  `notes/{Book}.md`, canon order, grouped by chapter. (2) It lost fidelity —
  category (the axis people actually index on), timestamps and sub-note
  nesting were all dropped. Markdown now carries reference, category and date,
  nesting survives as list indentation, and a `notes.json` holds every field
  verbatim so a future import never asks anyone to re-key years of work.
  (3) It did 401 round trips for 400 passages; now ONE `getAllNotes()`.
  Serialization is pure and unit-tested (18 tests, fidelity-focused).
  `NoteWithPassageInfo` gained `book_number`, which the query already selected.
  Also added the one calm line the brief asks for, in Profile next to the
  action: "Your notes are yours. Export them any time, as plain files." — said
  before anyone needs it, because export only builds trust if people know it
  exists. NOT done, per the brief: import, scheduled export, cloud
  destinations. Remaining in the arc: step 3 (surface the passage-centric view
  — the reading-header note count is a TASTE call for Dennis) and step 5
  (saved filters).

- **Journal retrieval, step 2 of 5: SEARCH lands you at the VERSE (DONE
  2026-08-31).** `journal-retrieval.md` §3.2 called this "the single
  highest-value line of the whole brief", because it turns search from "find a
  note" into "get back to the place". A note result used to call
  `onOpenStudy(passage_id)`, but under the note-centric model a passage is
  invisible interim storage, so that was never an honest destination. Results
  now resolve to book + chapter + the note's anchored verse (`noteLanding()`,
  pure and tested — 8 cases including numbered and multi-word book names and
  the chapter override), and land there highlighted and scrolled into view.
  The brief said the verse-scroll hook was the real work; it turned out to
  already exist (`initialHighlightVerses`), just never wired from App — the
  comment claiming otherwise was stale and is fixed. Falls back to opening the
  study when an anchor cannot be resolved, so a result is never a dead end.
  ALSO: search no longer truncates silently. It asks for one more than it
  shows, and when the extra arrives it says "Showing the first 50 matches" and
  marks the count "50+". `searchNotes` now takes the caller's limit, in both
  the real API and the memory stub. Remaining: surface the passage-centric
  view, upgrade export, saved filters.

- **ESV cache now persists across reloads (DONE 2026-08-31).** `esv-cache.ts`
  was in-memory only, a deliberate conservatism its own comment called
  "stricter than the letter of the license requires", which meant every reload
  refetched. It now persists via `esv-store.ts`, strictly inside the SAME
  500-verse cap (a licence term, not a tuning knob), in its own IndexedDB
  database so `purgeEsvStore()` can remove every stored verse in one call if
  the licence ever changes. This is quota-POSITIVE as well as faster: fewer
  refetches means a lighter draw on the per-application ceiling shared by all
  users. The cap is re-enforced on hydration rather than trusting what was on
  disk. Dennis approved the disk-write tradeoff. 5 new tests.

- **Scripture falls back to BSB instead of a dead end (DONE 2026-08-31).**
  When a translation fails (ESV quota exhausted, proxy down), the chapter
  reader now serves BSB rather than showing "not available". Deliberately
  OPT-IN per call site via `getBibleVerse(ref, translation, { fallbackTo })`,
  because substituted text is only honest if the surface says so and not every
  caller has somewhere to say it — `CrossRefPill`, `ReadingMode` and the API
  layer keep the previous null behaviour. Where it is on, two things say so:
  an inline notice above the text, and the translation footer, which names and
  attributes the translation ACTUALLY shown. That second part matters: showing
  Crossway's ESV copyright notice over BSB text would be a false attribution,
  worse than the outage it papers over.

- **Add NET Bible as the third offline translation (DONE 2026-08-31).** Shipped
  as `NET`: helloao `eng_net` PRIMARY (cache-forever, keyed 'NET') with a
  self-hosted `public/bible/net.json.gz` bundle as FALLBACK, mirroring the KJV
  composition. Needed no network provider of its own — `HelloaoBibleProvider`
  already takes a translation code. Bundle built by
  `scripts/build-net-bundle.mjs`: 66 books, 1,189 chapters, 31,085 verses,
  1.29 MB gzipped. Attribution renders in `TranslationFooter`'s FinePrint with
  the "(NET)" link the free-app terms require. The licence grants the TEXT
  ONLY; the ~60k NET translator notes are excluded and must not be shipped.
  Also: guests get NET automatically (`GUEST_TRANSLATIONS` was already written
  as a rule, not a list — free and self-hostable, unlike metered ESV), the
  PWA precache ignore was widened to `**/bible/*.json.gz` so a fourth bundle
  cannot silently opt in, and `FallbackBibleProvider`'s console message no
  longer claims the fallback text is "real BSB".

- **Pure black (OLED) boot splash + browser chrome + visible app version
  (2026-08-28).** Two small prod-polish items. (1) **OLED reaches the paint
  surfaces outside the app.** `index.html`'s synchronous boot script now reads
  `berean-pure-black` alongside the theme, so when dark + pure-black the splash
  and initial `theme-color` paint true `#000000` instead of the theme's ordinary
  near-black (no flash of `#17140f` before React boots). At runtime a shared
  `syncBrowserChrome()` helper in `useDarkMode.ts` sets `theme-color` +
  `apple-mobile-web-app-status-bar-style` from the live DOM flags (`body.dark`,
  `data-pure-black`); both `useDarkMode` and `usePureBlack` call it, so toggling
  pure-black alone (dark mode unchanged) still updates the chrome. Verified live:
  dark+OLED → `#000000` everywhere, dark-only → `#17140f`. (2) **App version in
  Profile.** `package.json`'s version is injected via a Vite `define`
  (`import.meta.env.VITE_APP_VERSION`) and shown as a quiet, faint
  "Lantern v2.0.0-dev" line at the foot of the Profile page.

- **Note-draft persistence reconnected — quiet "recover" prompt (2026-08-28).**
  `src/offline/draft.ts` (IndexedDB write/read/clear) was dead code after the
  note-centric refactor; it is now wired into both capture surfaces so an
  accidental reload/tab-close no longer silently loses an in-progress note. The
  low-level store is reused unchanged (its tests stay green): a note's canonical
  `content` line ("v10 @observation prose") already carries anchor + category, so
  a draft is just `{lines:[{text: content, noteId?}]}` keyed per chapter
  (`chapter:${bookNumber}:${chapter}`). Persistence is **host-owned** in
  `BookDetailPage.ChapterView`: `MobileNoteComposer` and `StudyWorkbench` each
  emit an `onDraftChange` as the reader types (only once genuinely dirty); the
  host debounces (400 ms) and writes, and clears on save/discard/cancel.
  Recovery is Dennis's chosen **quiet, dismissible prompt** (`.draft-recover`, a
  calm surface card — never a modal or a nagging badge): on chapter load a
  leftover draft with real prose surfaces "You have an unsaved note on John
  3:16 · Recover / Discard". Recover reopens the mobile composer on the draft's
  anchor (restored body + category) or hands the draft to the desktop workbench
  (opening Study if needed); Discard clears it. **Guests are excluded** — their
  session is already ephemeral, so a reload-surviving IndexedDB draft would
  contradict "nothing you write here is kept" (gated via `useIsGuest`). Verified
  live on both surfaces (memory stub): typing writes the debounced draft with
  the anchor preserved, reload shows the recover chip, Recover restores the
  editor, and Save clears the draft on both mobile and desktop.

- **Guest cleanup: BSB/KJV-only translations + dead-CSS sweep (2026-08-28).**
  The two mechanical loose ends from the guest-is-the-App change. (1) **Guest is
  limited to BSB/KJV.** A `GuestContext` (`src/utils/guestContext.ts`) is
  provided at the App root from the presence of the `guestSignIn` callback; two
  guest-aware hooks in `useTranslation.ts` consume it — `useTranslationOptions`
  (returns `GUEST_TRANSLATIONS`, i.e. BSB/KJV only, when guest) drives both
  pickers (`TranslationFooter`, `ReadingPrefs`), and `useReadingTranslation`
  (coerces the read value via `toGuestTranslation` when guest, but the setter
  still writes the true preference) replaces the raw `useTranslation` read at
  every scripture-fetch site (`BookDetailPage` ×2, `ReadingMode`). So a browser
  that already chose ESV while signed in never hands a guest a translation they
  can't fetch — the guest reads BSB and signing in later lands back on ESV. The
  Bible-language switcher in `ReadingPrefs` is also hidden for guests (English
  public-domain only). Verified live in guest mode: stored ESV → footer and aA
  popover both offer BSB/KJV only, BSB scripture loads (no ESV degrade), no
  language switcher. (2) **Dead `guest-*` CSS removed** — the old `GuestReader`
  chrome (`.guest-topbar*`, `.guest-icon-btn`, `.guest-chapter-label`,
  `.guest-scripture-error`, `.guest-entry-fab`, and their `@media` rules) is
  gone from `main.css`; `.guest-signin-btn` (still used by `NavBar`) was kept.
  Note: `.chapter-flow-*` was listed as dead but is LIVE (cross-chapter nav in
  `BookDetailPage`) — left untouched.

- **Guest is now the real App on an ephemeral backend (2026-08-27, `c6e18b9`).**
  The separate `GuestReader` tree (rendered outside `ApiProvider`, the old §4
  structural boundary) is **deleted**. The `guest` phase in `Root.tsx` now mounts
  the actual `App` inside `<ApiProvider api={createMemoryApi() /* unseeded */}>`,
  so a guest gets the whole product — the real `NavBar` (Bible · Journal ·
  + Study), `BookDetailPage`, the desktop Read/Study workbench, the Journal —
  backed by an in-memory API that forgets on reload. A guest can create notes
  (they render inline and appear in the Journal) and study; nothing persists and
  there is no account. A `guestSignIn` prop threads through `App` → `NavBar`
  (swaps the account avatar for a "Sign in" button) and `ProfilePage` ("Trying
  Lantern · Nothing here is saved yet · Sign in to keep your notes"). The memory
  API has no credentials, so letting guest reach it leaks nothing — this
  supersedes the maintain-forever isolation boundary. This makes the guest UI
  impossible to drift from the signed-in app: it IS the signed-in app.
  **Supersedes G1 (isolated guest reader) and G2 (ephemeral sandbox editor)
  below** — they are historical now, not the shipped shape.
  Follow-ups this created (see Deferred): limit guest to BSB/KJV (the full app's
  translation picker still offers ESV, which needs a key a guest doesn't have),
  and sweep the now-dead `guest-*` CSS (`.guest-topbar`, `.guest-scripture`,
  `.guest-chapter-label`, `.chapter-flow-*`, etc. — ~19 lines in `main.css`).

- **Prod polish + dark-mode contrast sweep (2026-08-27).** A run of small
  prod-facing fixes: the PWA update pill and the verse-selection bars no longer
  stack (`:has()` offsets the pill; hidden while composing); restored button
  press feedback after the OS tap-flash was killed; a selected verse keeps its
  accent on hover instead of a grey box; the desktop verse-action-bar was
  invisible (position:fixed trapped by `.chapter-deck`'s permanent
  `transform` — now portaled to `<body>`); the `@`-tag dropdown's lower items
  were painted over by later verses (`.reading-verse-block:has(.tag-dropdown)`
  z-index); the PWA update pill is hidden on desktop (it's for the installed
  mobile PWA). Plus a dark/OLED contrast sweep: the "+ Study" nav pill rendered
  invisible text (a `body.dark …nav-tab.active` rule forced `--accent-ink`,
  which in dark IS `--accent`, onto the accent fill); an automated auditor found
  the same failure-mode family and fixed it (`.study-btn-save`,
  `.study-btn-danger`, `.study-note-act .is-yes`, `.guest-signin-btn`,
  `.offline-toast`) — all ≥ 4.5:1 in both themes now.

- **Desktop Read/Study focus toggle; StudyMode retired (2026-08-26).** Studying is
  now a mode you switch on while reading a chapter, not a page you navigate to.
  At wide desktop widths (`>=1160px`) the reading page carries a Read/Study
  segmented toggle: Study slides a notes workbench (`StudyWorkbench.tsx`) in
  beside the scripture and moves the chapter's notes into it, leaving the reading
  column clean. The layout change is a pure `transform` on the reading column and
  its chrome — combined with the FIXED scripture measure the hide-notes control
  already relies on, the verse text never re-lays-out or re-wraps mid-animation.
  The workbench edits the note's stored content line directly, so the existing
  `RichEditInput` gives live `v4-6` pills and the `@` category dropdown for free,
  and the existing `useVerseMarquee` drag re-aims the draft's anchor (replacing
  the leading token, never appending). The standalone `study` destination and
  `StudyMode.tsx` are gone: the Study nav tab and every "open this study" entry
  point now land in the reading page with the workbench open. Mobile is untouched
  — it keeps the inline composer, and the mode cannot be turned on there.
  Along the way this fixed a real pre-existing bug: `createAnchoredNote` handed
  `findOverlappingPassage` the whole-Bible `getPassages()` list, and that check
  compares chapter/verse keys only — so a note on John 1:4-6 could be written
  onto the Genesis 1:1-5 passage and disappear from John. The lookup is now
  scoped to the book being read.
  **Follow-up fix, same day:** the first cut of this slice left two live mobile
  regressions, both traced to the toggle's `studyOpen` flag leaking onto phones
  — fixed by gating all study behaviour behind `studyMode = studyOpen &&
  !isMobile`. (1) A tapped verse on mobile ran the study-aim path instead of
  select→selection-bar, so verses highlighted with no way to make a note. (2)
  The bottom-bar "+ Study" tab set `studyOpen` and landed on a bare Bible page
  with no mobile study surface to show — removed; the mobile bottom nav is now
  Bible · Journal · Profile, three tabs, and desktop keeps the Read/Study
  toggle.

- **Journal as a reflective, derived history (2026-08-26).** Part of the
  note-centric model (see the desktop toggle entry above and
  `docs/ARCHITECTURE.md`'s decision log). `JournalPage` no longer indexes saved
  study containers; it's rebuilt entirely from `getAllNotes()`, with no
  passage/session concept surfacing in the UI at all. Per-chapter entries sort
  newest-first into soft local-day buckets (Today / This week / Earlier this
  month / Older); a Notes/Chapters view toggle switches between showing note
  text (collapsing after 3 per chapter) and a chapter-level summary (reference +
  count + category dots); a category filter slices the notes and hides chapters
  left with none. Tapping an entry opens that chapter's reading view through the
  existing jump-to-chapter handler. Deliberately reflective, not a scoreboard —
  no streaks, targets, or totals, and the old per-study delete affordance is
  gone along with the study container it used to delete.

- **Mobile note capture: select-first + keyboard-aware inline composer
  (2026-08-26).** Part of the note-centric model (see above). Replaces the old
  quick-note path on mobile: tapping a verse selects it directly (no separate
  "select mode"), tapping more verses extends a contiguous range, and a bottom
  selection bar's **Note** button opens `MobileNoteComposer` — a keyboard-aware
  inline editor that keeps a consistent, flash-free position above the on-screen
  keyboard (cached keyboard height per device, `preventScroll` focus, a single
  deterministic scroll, `prefers-reduced-motion` respected). Category is a
  single optional selection that colour-brands the note's rail; saved notes
  render inline under their verse and re-open the same composer to edit, with a
  confirm on delete and on discarding a dirty draft. Desktop reading was
  untouched by this slice. **Follow-up fix, same day:** `createAnchoredNote`
  resolved an existing passage against every passage in the library while the
  overlap check only compares chapter/verse — so a note captured on, e.g., John
  1:5 could match an unrelated seeded Genesis 1 passage on the bare numbers,
  save under its session, and then vanish (`getNotesByBook` for John never
  returned it). Fixed by scoping the lookup to the book actually being read and
  taking the book number from the open chapter rather than re-deriving it from
  a display name with a silent Genesis fallback — this also fixed the same
  latent bug in the desktop quick-note path, which shares the function.

- **Reading display popover — the "aA" quick settings (2026-08-19).** Changing a
  reading preference used to mean leaving the chapter for Profile → Settings and
  navigating back. Every reading surface (BookDetailPage, ReadingMode, StudyMode's
  scripture pane) now carries an "aA" icon in its own controls cluster that lays
  Appearance / Scripture text size / Translation over the passage — a bottom sheet
  on mobile, a popover anchored to the icon on desktop (`DisplaySettings.tsx`,
  positioning in `displayPopover.ts`). The controls themselves are ONE
  implementation (`ReadingPrefs.tsx`) used by both the popover and SettingsModal, so
  the two can't drift and a future Bible-language switcher slots in as one more
  section in both at once. The full Settings page keeps the rare things (hide all
  notes, export, privacy, account). The chapter-footer translation switcher was
  deliberately left alone pending Dennis's call on whether it stays.

- **ESV provider — LIVE in prod (built 2026-07-28, deployed + verified
  2026-08-18).** `BibleProvider` implementation using Crossway's ESV API, per
  `docs/proposals/translations-esv-niv.md`. The ESV API authenticates ONE
  application-level key (`api.esv.org/account/`), never a key per end user, so
  there is no per-user settings UI. What shipped: a Deno edge function
  (`supabase/functions/esv-proxy`) that holds `ESV_API_KEY` server-side and
  fails closed with a "not configured" response when unset; a client
  `EsvBibleProvider` (`src/bible/esv.ts`) that calls ONLY the proxy, never
  `api.esv.org` directly; a size-bounded LRU cache (`src/bible/esv-cache.ts`,
  500-verse cap, LRU since 2026-08-04) instead of the cache-forever layer BSB/KJV
  use; and `ESV` added to `TranslationId` (`provider.ts`) with its own
  no-fallback composition in `service.ts` (no self-hosted bundle exists for ESV,
  and none legally can). ReadingMode, BookDetailPage, and StudyMode all show the
  required Crossway attribution wherever ESV text renders, and a distinct "ESV
  isn't available yet" message (never a raw error) when the proxy has no key or
  is unreachable. Unit tests (`src/bible/esv.test.ts`) cover response parsing,
  cache eviction, and the no-key / offline / 429-quota degrades. Dennis set
  `ESV_API_KEY` and deployed the function; **verified live 2026-08-18** — the
  proxy returns ESV text (HTTP 200). ESV is selectable in the Settings
  translation switcher and the chapter-footer switcher.

- **ESV usage metering — LIVE (built 2026-08-03, deployed 2026-08-18).**
  `supabase/functions/esv-proxy` meters every real upstream call (a client cache
  miss, never a cache hit) into `public.esv_api_usage`
  (`supabase/migrations/0008_esv_usage.sql`) — timestamp + coarse
  ok/quota/error status only, never a passage, book, chapter, user, or install
  id, so `public/privacy.html` needed no change. Metering is fire-and-forget
  (`EdgeRuntime.waitUntil`, errors swallowed) so it can never slow or fail a
  chapter fetch; rows are pruned after ~48h by an hourly pg_cron job. Two
  scalars, `esv_api_queries_24h` / `esv_api_queries_1h`, are exposed via
  `hq_telemetry_scalars()` to watch against the shared 5,000/day + 1,000/hour
  Crossway caps. Deliberately NOT routed through the `telemetry_events` buffer,
  whose per-install caps would drop real usage at the volume this measures.
  Deployed alongside the ESV provider (migration pushed + `esv-proxy`
  redeployed); now recording real usage.
- **PWA install: a permanent menu entry + one commitment-timed nudge
  (2026-08-16).** The browser's own install popup fires on a first-ever visit,
  before anyone knows what Lantern is, so it gets swiped away and never returns
  (a real Android reader installed nothing for exactly this reason). Now
  `src/platform/install.ts` captures `beforeinstallprompt` and
  `preventDefault()`s it — suppressing Chrome's mini-infobar — and stashes it to
  replay later; iOS Safari, which has no install API, gets a Share → Add to Home
  Screen hint instead; every other browser gets nothing rendered at all. Two
  surfaces: a permanent, never-nagging "Install app" / "Add to home screen"
  entry in the avatar menu and the Profile page, and ONE quiet popover shown at
  most once per browser profile. Its gate (`src/utils/installNudge.ts`,
  unit-tested) is deliberately conservative: 2nd-or-later session **and** a note
  actually saved, never standalone (both `display-mode: standalone` and
  `navigator.standalone`), never twice — "not now" is final, and the shown flag
  is written as it appears, not as it's answered. Telemetry `env` gained a
  `standalone` boolean so install rate is measurable (a new `kind` was not
  possible — that column is a closed CHECK set).

- **Reading-mode/header overhaul + chapter-nav polish + translation footer
  (2026-08-05, shipped to main `255910b`).** The whole reading-surface set landed
  in one merge. Three parts:
  - **Reading-mode/header overhaul + G4a + the three chapter-nav fixes** (built
    over the prior sessions on `claude/reading-mode-and-header` →
    `claude/mobile-chapter-nav-polish`, then independently audited). Reading Mode
    collapses the three stacked bars into one centered bar via animatable
    height/opacity (never `display:none`); the header centers the book+chapter
    reference with a chapter arrow each side; notes hide/show is a fade-then-
    settle on `--dur-4`/`ease-calm`. The three mobile nav fixes, each root-caused:
    one chapter highlight (a `body.dark .chapter-pill:hover` grey fill out-ranked
    `.chapter-pill.active`, so a tap's sticky hover repainted the active pill grey
    in dark mode while a swipe kept the accent), no settle flash (both deck panes
    keyed by chapter so a committed swipe reuses the neighbour's subtree instead
    of remounting), no top drift (`scrollIntoView({inline})` silently defaulted
    `block:'start'` and dragged the surface — replaced with a horizontal-only
    `scrollLeft`). The audit also fixed four a11y/responsive bugs (collapsed
    chrome left ~150 buttons in the tab order → `visibility:hidden` flipped at the
    end of the collapse; a 320px back-button/arrow overlap; a long book name under
    the controls at 390px; a lost entrance reveal on pill-jumping to a
    previously-swiped chapter).
  - **Translation footer (replaces the top-bar chip).** The translation indicator
    left the reading header entirely — see the superseded chip entry below. It is
    now a deliberately faint, centered, hairline-topped colophon
    (`TranslationFooter.tsx`) at the foot of every reading surface
    (`BookDetailPage`, `ReadingMode`, `StudyMode`), under the prev/next nav. It
    doubles as the switcher (opens upward), names the translation for a glance,
    and carries Crossway's required ESV attribution ONLY on ESV — BSB/KJV show
    just the abbreviation. It stays available even in the ESV-unavailable state so
    a reader can switch back without a trip to Settings (the old "Switch in
    Settings" copy is gone). Switching also still lives in Settings. `TranslationChip`
    is deleted; the `.translation-chip-*` menu classes stay (GuestReader reuses them).
  - **Long book-name abbreviations in the one-bar reading header**
    (`readingShortBookName` in `bibleBooks.ts`): `1 Thessalonians` → `1 Thess.`
    etc. for the ~13 long-named books, so the centered reference never crowds the
    chapter arrows on a narrow phone. Full names everywhere else.
  - **Chrome-synced bottom tail + scroll-oscillation fix.** The reading surface's
    bottom reservation now collapses with the auto-hiding tab bar (76px→20px) so
    it no longer strands an empty band under the footer, and `useChromeAutoHide`
    ignores scroll samples caused by that layout change — the tail shrink at the
    bottom used to clamp `scrollTop` and read as an upward scroll, re-revealing the
    chrome in a hide/show oscillation.
  Gate green throughout (tsc, 219 tests, lint baseline 3/9, build, prettier 0).
  NOT confirmed in-code: the swipe FEEL and the latest tail-glide/oscillation
  motion still want Dennis's on-device pass on prod (taste, unmeasurable headless).

- **Stale-chunk production crash + verse-action-bar centring (2026-08-03).** Two
  unrelated fixes from a real user report (an international friend-of-a-friend
  opened a shared link in a WhatsApp in-app browser on iOS and got the
  full-screen "Something didn't load right" boundary).
  - **The crash.** Telemetry showed an `app-boundary` `TypeError` with a **null
    stack** on the current build — a synchronous render-time throw, `code
    UNKNOWN_ERROR` (a raw JS error, not one of ours). Root cause, confirmed
    against live production: `Landing` is the app's only lazy `import()` and is
    loaded **only on the signed-out path** (so the signed-in friend never
    exercised it). When a client runs a stale `index.html` whose hashed chunk a
    newer deploy has purged, the request for that chunk hits the SPA catch-all in
    `public/_redirects` (`/*  /index.html  200`) and returns the **HTML shell
    with a 200, not a 404** (verified: `curl` of a nonexistent
    `/assets/Landing-DEADBEEF.js` → `200 text/html`). `import()` then receives
    HTML where it expects a JS module and throws — in Safari a `TypeError` with
    no usable stack — which nothing caught. A cold client (in-app webview, no
    service worker) is the most exposed. **Reproduced live** while verifying the
    deploy: the browser fetched the new `index.html` before this edge had served
    the new `Landing` chunk, hit the exact error, and recovered seconds later
    once the chunk propagated — so even a *fresh* navigation in the brief
    per-deploy propagation window triggers it, not only stale caches. **Fix,
    defense-in-depth:** (1) `public/_redirects` now 404s a missing `/assets/*`
    instead of letting the SPA catch-all serve it back as HTML — the root evil:
    a missing chunk was returning a cacheable HTML-200, and (found the hard way)
    under the immutable `Cache-Control` in (2) the browser would cache that
    broken HTML for a **year**, so even a reload couldn't recover; a real 404 is
    clean and uncacheable. A tiny `public/404.html` is its body (never rendered
    for a module fetch — the browser just sees the 404 and fails the import
    cleanly). (2) new `public/_headers` serves `index.html`/SPA routes
    `Cache-Control: no-cache` (the default was already `max-age=0,
    must-revalidate`, so this strengthens it for misbehaving in-app caches) and
    `/assets/*` `immutable`; (3) a `vite:preloadError` handler in
    `src/telemetry/globalHandlers.ts` does a **one-time** guarded
    `location.reload()` (reload, not same-URL retry; a 10s `sessionStorage`
    cooldown unit-tested via the pure `shouldReloadOnChunkError`; skips the
    reload when storage is blocked so it can never loop; deliberately does NOT
    `preventDefault()` — that made `__vitePreload` resolve `undefined` and
    `React.lazy` then threw a confusing second `TypeError` on `.default`); (4)
    the same handler reports under its own `chunk-load-error` boundary label so
    this mode is unambiguous in HQ next time — the original occurrence was
    indistinguishable from any other `TypeError` because telemetry strips
    messages for privacy and the Safari stack came through null.
    **Standing lessons:** the SPA catch-all makes a missing asset look like a
    200-HTML *success*, not a 404 — so exclude `/assets/*` from it and keep
    `index.html` `no-cache`; NEVER let a path that can transiently 404-as-HTML be
    `immutable`-cached; and a dynamic-import failure is a caching/deploy problem
    first, a code bug second.
  - **The centring.** Unrelated bug found the same session: the floating
    verse-selection action bar rendered right-of-centre on desktop (and wrapped
    its buttons at narrower widths). `springIn` in `motion.css` set the
    `transform` shorthand in its `to` frame, and with `animation-fill-mode: both`
    that stuck after the entrance, overriding the bar's base
    `transform: translateX(-50%)`. Same landmine the `.bottomnav` boot animation
    hit. Fixed at the root: `springIn` now animates the independent
    `translate`/`scale` properties, which compose with the base `transform`
    instead of replacing it (the other springIn users have no base transform, so
    they render identically). Verified live via computed style: settled bar
    centre offset 0px.

- **ESV proxy rate limiting (2026-08-03).** `supabase/functions/esv-proxy`
  was live with no JWT check (`--no-verify-jwt`, by design) and no caller
  limit, so any bot holding the bundle's public anon key could burn the
  entire shared Crossway quota (5,000/day, 1,000/hour, 60/minute, per
  application) by itself — flagged by
  `docs/proposals/guest-preview-mode.md`. Fixed with a coarse per-IP fixed-
  window cap (20 req/min, well under Crossway's 60/min ceiling) that runs
  BEFORE the upstream fetch in a new `handler.ts`/`ratelimit.ts` split (same
  DI shape as `hq-telemetry/symbolicate.ts`, so the limiter and the whole
  request flow are unit-testable under vitest with no live deploy —
  `ratelimit.test.ts` / `handler.test.ts`). Over-cap requests get the same
  429 JSON shape Crossway's own quota 429 already used, so `src/bible/esv.ts`
  needed no change — it already degrades any 429 to the existing "ESV isn't
  available right now" state with no retry (extended `esv.test.ts` to cover
  the rate-limit body specifically, not just Crossway's). A rejected request
  is never metered into `esv_api_usage`, so `esv_api_queries_24h/_1h` keep
  reflecting only real Crossway consumption. The limiter is in-memory, per
  warm function instance, keyed on a non-reversible hash of the caller's IP
  (never the raw IP) — deliberately no new table and no DB round trip on the
  hot path; nothing IP-derived is ever persisted anywhere (no row, no log),
  so `public/privacy.html` needed no update. Being per-instance rather than a
  single global counter is a known trade for staying off the request's fast
  path; the escalation if it ever proves insufficient is still
  session-required ESV, as the proposal above already named.
- **Account-synced preferences (jsonb on `profiles`) (2026-08-03).** From
  `docs/proposals/guest-preview-mode.md` §2b. The four preferences (theme/dark
  mode, visual theme, translation, "hide all notes") now sync across devices
  for signed-in users via a `settings jsonb` column on `profiles`
  (`supabase/migrations/0009_profile_settings.sql` — no new table, no new RLS;
  `profiles_select`/`profiles_update` already cover it) plus a typed
  `getSettings`/`updateSettings` pair on `BereanApi`, implemented in both
  `SupabaseBereanApi` (merge-patch read-modify-write) and the memory stub.
  `localStorage` stays the write-through cache — every read is still instant
  and network-independent. On sign-in (`Root.tsx`'s profile-load point), the
  account is fetched once: an empty account seeds itself from the signed-in
  device's current local values ("your settings came with you"); a non-empty
  account hydrates local instead (`resolveSettingsAdoption` in
  `src/api/types.ts`, unit-tested against the memory stub). Every later change
  patches the account, debounced 500ms (`src/App.tsx`). Guests (no session)
  are untouched — `localStorage` only, zero API calls, no second data model.
  **Activation**: `supabase db push` to apply the new migration to the live
  `berean` project — not run as part of this change.
- **Translation-version chip in the top bar (2026-08-03) — SUPERSEDED 2026-08-05
  by the translation footer (see the reading-mode overhaul entry at the top of
  Done).** The chip was removed from the reading header on every surface and
  `TranslationChip.tsx` deleted; the translation indicator + switcher now lives in
  the quiet chapter footer instead. Kept here for history — the reasoning below is
  why a switcher-anywhere (not Settings-only) affordance exists at all; only its
  placement changed. A minimal,
  always-visible YouVersion-style chip (`TranslationChip.tsx`) shows the active
  translation's abbreviation and doubles as a quick switcher — tap it, pick
  BSB/KJV/ESV, done, no trip to Settings. It reads and writes the same
  `useTranslation` store Settings does (the `TRANSLATIONS` list), so there is
  one preference either surface can change and both stay in sync live. Lives in
  `NavBar`'s top-right chrome rather than being duplicated per surface: it's
  gated on the same "reading surface" flag that already shows the Focus toggle
  (a chapter or a saved passage), plus Study's own reading pane, so it appears
  consistently across ReadingMode, BookDetailPage's chapter view and StudyMode
  without three separate placements to keep in sync. Because it's a child of
  `.topnav`, it automatically hides/shows with the rest of the auto-hiding
  chrome on mobile (mobile reading mode) for free — no separate wiring needed;
  Study has no auto-hiding chrome of its own, so there the chip just stays put.
  The picker menu reuses the existing `.nav-menu`/`.nav-menu-item` dropdown
  styling (same as the workspace/profile menus) rather than inventing new
  chrome.
- **Cross-chapter reading — swipe + prev/next with preloaded neighbours
  (2026-08-03).** Reading on no longer means stopping to pick from the chapter
  strip. A horizontal swipe (touch only — a mouse drag over scripture is
  already the marquee verse selection), persistent edge arrows, and a named
  end-of-chapter control ("Next: John 4") all turn the page, and the adjacent
  chapters are fetched at idle through the existing provider seam so the
  incoming chapter is real text on its first frame rather than a skeleton.
  Explicitly NOT infinite scroll — that was considered and rejected because
  notes are anchored per chapter and a continuous scroll makes "whose notes am
  I looking at" ambiguous: exactly one chapter is current, at most one
  neighbour is mounted, and only for the length of the transition. The
  resolution (book boundaries; a graceful stop at Genesis 1 and Revelation 22)
  and the gesture feel (axis lock, flick-vs-drag commit, edge rubber-band) are
  pure functions in `src/utils/useChapterNavigation.ts` with 17 unit tests; the
  drag writes a transform straight to the track (never through React state), so
  the finger and the page move in the same frame. App owns the chapter now, so
  a book-crossing swipe, the chapter strip and a search jump are one state
  change and the view state always names the chapter on screen. Reduced motion
  swaps instantly with no slide and never mounts a neighbour. ESV is excluded
  from the preload on purpose — it is metered upstream per query, and a chapter
  the reader never opens must not spend their quota. NOT DONE here: restoring
  the last-read chapter across a full page reload (nothing persists reading
  position today — a separate item if it's wanted).
- **Mobile reading mode — auto-hiding chrome + distraction-free reading
  (2026-08-03).** On a reading surface (a chapter, or a saved passage) the top
  bar and bottom tab bar now slide away as you scroll down and come straight
  back the moment you scroll up. The mechanism is mobile Safari's, not a
  toggle's: the bars OVERLAY the scroll container (`.topnav` fixed, the book
  header + chapter strip fused into one sticky `.book-detail-chrome` inside a
  now-scrollable `.book-detail-layout`), so hiding them is a transform on
  compositor-only properties and moves no scripture at all — no reflow, no
  content jump. The scroll decision is a pure reducer (`nextChromeState` in
  `src/utils/useScrollDirection.ts`, 10 unit tests): it accumulates travel since
  the last direction flip rather than reacting per event, so a flick hides once
  and jitter does nothing; revealing costs less travel than hiding; rubber-band
  overscroll is clamped away; and content that barely overflows never hides at
  all. Two note-visibility controls, deliberately separate: a persisted **Hide
  all notes while reading** checkbox in Settings (`berean.hideAllNotes`), and a
  transient **Focus** pill in the top bar that hides notes AND widens the
  measure for the session only. Reduced motion falls out of motion.css's
  existing kill-switch plus the structural/motion split (main.css owns the
  translated end state, motion.css only the slide), so a reduced-motion reader
  still gets the space back, instantly. One pre-existing trap fixed on the way:
  `.bottomnav`'s boot animation used `animation-fill-mode: both`, which kept
  contributing `translateY(0)` forever and outranked any later transform —
  switched to `backwards`. DEFERRED from this pass: cross-chapter navigation
  (its own chained task), and any auto-hide behaviour on desktop (the rules are
  scoped to `max-width: 768px` on purpose).
- **Dark-mode status bar / theme-color on mobile (2026-08-02).** The `theme-color`
  meta was a single static light cream, so the browser chrome / status bar
  stayed light on phones even after switching to dark mode in-app. Since
  Lantern's dark mode is an explicit toggle (`berean-theme` via
  `useDarkMode.ts`), not just `prefers-color-scheme`, a media-query-only fix
  wouldn't track it — `useDarkMode.ts`'s existing effect (the one that
  toggles `body.dark`) now also flips `theme-color` between the dark canvas
  token from tokens.css (`body.dark`'s `--bg: #17140f`) and the light
  `#f4f0e8`, live, on every toggle. `apple-mobile-web-app-capable` +
  `apple-mobile-web-app-status-bar-style` were added to `index.html` (that
  meta only accepts `default`/`black`/`black-translucent`, no arbitrary hex,
  so it flips to `black` in dark) for the installed-PWA/iOS-standalone status
  bar. The manifest `theme_color` in `vite.config.ts` is untouched on
  purpose — it's a single static value baked into the installed manifest and
  can't be media-queried live. Verified with Playwright dark-mode emulation
  at mobile width; real-device confirmation of the iOS standalone status bar
  is still outstanding.
- **KJV + translation switcher (2026-07-22).** Closes the item deferred above.
  `docs/proposals/translations-esv-niv.md`'s KJV verdict ("identical legal
  shape to BSB, self-hosted static bundle fully legal") is now the shipped
  second `BibleProvider`. `BibleProvider`/`getBibleVerse` (`src/bible/provider.ts`,
  `service.ts`) took a `TranslationId` ('BSB' | 'KJV') parameter — BSB's
  composition and behavior are unchanged; KJV gets the same
  `FallbackBibleProvider(CachedBibleProvider(HelloaoBibleProvider), SelfHosted)`
  shape against `bible.helloao.org`'s `eng_kjv` endpoint
  (`src/bible/kjv.ts`), with a self-hosted complete-KJV bundle fallback
  (`scripts/build-kjv-bundle.mjs` → `public/bible/kjv.json.gz`,
  `src/bible/kjv-self-hosted.ts`) built from the same public-domain source
  KJV's live endpoint serves, plain verse text only. A translation switcher
  (`src/utils/useTranslation.ts`) lives in Settings, persists to
  `berean-translation` (following the `berean-theme` localStorage
  convention), defaults to BSB, and is read by every reading surface
  (`BookDetailPage`, `ReadingMode`, `StudyMode`). Notes stay anchored by
  verse number regardless of translation — only the displayed text changes.
  **ESV is the recommended follow-on** (see the Deferred entry above) — the
  seam this item built is what ESV needs too, but ESV additionally needs a
  quota-aware evicting cache, a server-side key proxy, and a no-offline-
  fallback degrade path that KJV's public-domain shape didn't require.
- **Telemetry loop proven end to end, producer ↔ HQ ingest (2026-07-21).**
  Closes the "hand HQ the token / re-verify after first deploy" follow-up, which
  is now fully done rather than outstanding. What was verified against the LIVE
  system, not asserted:
  - **Source-map upload on a real Cloudflare deploy.** `SUPABASE_SERVICE_ROLE_KEY`
    is in the Pages build environment (`VITE_SUPABASE_URL` was already there and
    the upload script falls back to it, so no second URL var was needed). The
    deploy at commit `a4b38f5` uploaded all three maps to the private bucket
    within ~40s; production served zero `sourceMappingURL` references and the
    maps are unfetchable both anonymously and with the anon key. The build-log
    line to confirm on future deploys is `[sourcemaps] uploaded N/N` — the skip
    path is silent by design, so check it rather than assume.
  - **HQ ingest, end to end.** HQ pulled the live endpoint and confirmed: auth
    (wrong/missing → 401, bad `since` → 400, right token → 200), all 7 scalars
    in the contract shape ingested into `project_metrics`, `since` treated as a
    cursor with scalars always a snapshot, and — the last unexercised path — a
    real error event fingerprinted, stored in `project_events`, and raised as
    exactly ONE deduped inbox card. The events path was loaded by posting three
    identical error rows through the PUBLIC anon write path (same path a browser
    uses, not a service_role hand-seed) with a stack pointing at a real position
    in the live bundle; the endpoint symbolicated each
    `index-Du28reZL.js:74:59833` → `src/bible/helloao.ts:144:9` on the way out,
    and the three shared one fingerprint so HQ's dedup had a genuine test. All
    test rows deleted afterward; buffer back to zero.
  - **`HQ_TELEMETRY_TOKEN`** remains a Supabase secret on the `berean` project,
    handed to Dennis in-session. Write-only and unrecoverable from the dashboard
    — if lost, regenerate and `supabase secrets set` it again, then re-issue to
    HQ. Nothing in the repo or `.env` holds it.
  **Telemetry is now live and collecting in production** (client errors,
  scripture-fallback serves, draft recoveries), disclosed on the privacy page,
  default-on with a working opt-out, bounded and self-pruning (0007 pg_cron,
  daily 03:17 UTC).
- **Accent-as-text contrast sweep applied (2026-07-22).** Closes the item
  deferred above. Every `color: var(--accent)` site in `main.css` and
  `landing.css` — links, buttons, active nav/tab states — switched to
  `color: var(--accent-ink)`. **The real site count was 64 `color:` +
  `*-color:` occurrences of `var(--accent)`, not the ~19 the entry
  estimated**; of those, exactly **47** are the literal `color:` property
  (44 in `main.css`, 3 in `landing.css`) — the rest are `background`,
  `border-color`, `border-left-color` and `accent-color`, which are
  non-text and correctly left untouched. All 47 were switched uniformly, on
  purpose: some already passed individually (e.g. the `modern` theme's
  topnav tab sits on a background where bare `--accent` already cleared
  4.5:1), but switching only the failing ones would leave two different
  accent-text darknesses depending on background, which reads worse than a
  single consistent accent-text colour.
  Measured live via computed styles in a real browser (Playwright against
  the in-memory stub, `.env` untouched since none was present), before/after,
  across all 4 themes × light/dark × desktop/mobile, walking each element's
  ancestor chain and alpha-compositing backgrounds rather than reading the
  nearest `background-color` alone (a 13%-tint pill over the canvas is not
  the tint colour alone):

  | site | theme | before | after |
  |---|---|---|---|
  | topnav/bottomnav active tab | berean | 3.89 | 4.88 |
  | topnav/bottomnav active tab | scholarly | 4.32 | 4.98 |
  | topnav/bottomnav active tab | paper | 3.12 | 4.94 |
  | topnav/bottomnav active tab | modern | 4.74 (already passing) | 4.96 |
  | `.bible-book-count` pill text | berean | 3.72 | 4.67 |
  | `.bible-book-count` pill text | scholarly | 4.10 | 4.71 |
  | `.bible-book-count` pill text | paper | 2.93 | 4.63 |
  | `.bible-book-count` pill text | modern | 4.45 | 4.66 |
  | `.btn-study-chapter` | berean | 3.91 | 4.90 |
  | `.btn-study-chapter` | scholarly | 4.30 | 4.96 |
  | `.btn-study-chapter` | paper | 3.12 | 4.94 |
  | `.btn-study-chapter` | modern | 4.69 | 4.92 |
  | `.book-detail-back:hover` | berean | 4.25 | 5.33 |
  | `.book-detail-back:hover` | scholarly | 4.64 | 5.34 |
  | `.book-detail-back:hover` | paper | 3.36 | 5.31 |
  | `.book-detail-back:hover` | modern | 5.09 | 5.33 |

  Every light-theme site measured now clears 4.5:1 (4.63–5.34); the two
  outliers below 4.5 in the raw sweep were `topnav`/`modern` and
  `.bible-book-count`/`modern`, both already-passing before the switch and
  unaffected in direction. Dark themes confirmed unchanged **by
  construction, not just by spot check**: `--accent-ink` aliases straight to
  `--accent` in all 4 dark blocks (`tokens.css`, out of scope here and
  untouched), and computed-style dark colours were verified byte-identical
  to each theme's `--accent` hex (e.g. berean dark resolved to
  `rgb(164,156,240)` = `#a49cf0`, its own `--accent`). One pre-existing,
  unrelated quirk found and left alone: `body.dark .book-detail-back` sets
  `color: var(--text-faint)` and wins over `.book-detail-back:hover`'s
  `--accent-ink` on specificity order in dark mode — predates this change,
  never used `--accent`, out of scope.
  `npm test` (124/124), `npm run build`, and `prettier --list-different`
  all clean. No layout or functional change — screenshots (light/dark ×
  desktop/mobile, library + book-detail) attached to the PR for the
  ship-gate look-at-it review this item was deferred for.

- **Interpolated-throw guardrail widened to all leak shapes (2026-07-21).** The
  guardrail added just above (`errors.guardrail.test.ts`) only caught
  `throw new Error(` + template literal — the exact letter of the spec it was
  built from, but string concatenation, `TypeError`/`RangeError`, and
  assign-then-throw (`const e = new Error(...); throw e`) all defeated it just
  as easily. Closed with a new `no-restricted-syntax` override on `src/**` in
  `.eslintrc.cjs`: two selectors match any `NewExpression` of a native
  `Error`/`TypeError`/`RangeError`/`EvalError`/`ReferenceError`/`SyntaxError`/
  `URIError` constructor whose first argument is an interpolated template
  literal or a `+` string concatenation. Matching the construction itself
  (not its parent `throw`) catches subclasses and assign-then-throw for free,
  and it's AST-based so it's comment-safe — a matching string inside a `//`
  comment or a string constant does not false-positive (checked). `CodedError`
  is never matched. Scoped to `src/**` only, so `scripts/migrate-sqlite.ts`
  (which does interpolate into thrown errors, and is out of scope) is
  unaffected. Verified as four separate NEGATIVE tests, each temporarily
  injected into `src/utils/bibleBooks.ts` and reverted: template literal
  (`579:9`), string concatenation (`579:9`), `TypeError`+`RangeError`
  (`579:9`+`583:9`), assign-then-throw (`579:13`) — all four failed lint and
  named the file:line, and lint returned to the 3 pre-existing baseline errors
  (`scripts/migrate-sqlite.ts` ×2, `src/utils/richText.ts` ×1) after each
  revert. The telemetry-only `detailForConsole()` override needed the same two
  selectors duplicated into it, since ESLint's per-file rule cascade replaces
  a rule wholesale rather than merging overlapping overrides. The older
  regex-based `errors.guardrail.test.ts` was deliberately kept rather than
  removed: it is the one check that runs under `npm test`, which is what
  `.status.yml`'s automated health probe actually executes — the new ESLint
  rule is strictly broader but only runs under `npm run lint`, which nothing
  currently automates.

- **Telemetry: user-facing opt-out toggle (2026-07-21).** A "Privacy" section
  in Settings (`SettingsModal.tsx`, between Export and Account) with a "Send
  diagnostic reports" checkbox, checked by default. Unchecking it calls
  `setTelemetryOptedOut(true)` in `src/telemetry/client.ts`, which stores
  `berean.telemetry-optout`; `send()` returns before any network call when
  that key is set. Absence of the key means opted IN, matching the privacy
  page's description of the default — this is an explicit opt-out, not an
  explicit opt-in. `public/privacy.html` updated in the same commit to
  disclose the control and where to find it, per the standing rule.

- **Telemetry pipeline — buffer, endpoint and symbolication (2026-07-21).**
  The Lantern side of `D:/Projects/hq/TELEMETRY.md`, built end to end. HQ's
  ingest is P2 and NOT built, so every piece is designed to be inert standing
  alone: nothing in the app reads the endpoint, and nothing degrades if HQ never
  calls it.
  - **The buffer (`0004_telemetry_buffer.sql`)** with flood defence at the
    project boundary, because the contract's correction matters here: pulling
    rather than accepting pushes does NOT remove the flood risk. The client
    still writes into this table with the same public anon key; pull moves the
    untrusted writer one hop upstream. So five server-side defences, all
    assuming a hostile writer holding a valid anon key — an RLS insert policy,
    CHECK-enforced payload caps, a per-install burst limit, a hard daily
    ceiling, and sampling above a soft per-hour threshold. The rate limiting
    counts on `created_at` (server time), never `occurred_at` (client-claimed),
    so a client cannot evade a limit by lying about when something happened.
    **The table is write-only:** there is an INSERT policy and deliberately no
    SELECT policy, so the public anon key can add rows and never read one back.
    Two details worth not undoing: the insert policy constrains `occurred_at` to
    a plausible window, because a far-future timestamp would push HQ's `since`
    cursor past events that haven't happened and silently skip every real one
    written before it caught up; and sampling stamps a `sample_weight` so
    aggregates scale back up with `sum(sample_weight)` instead of quietly
    reading low exactly when volume was high enough to matter.
  - **The scalars (`0005_telemetry_scalars.sql`)** as one `security definer`
    function returning the contract's `{key, value, unit, window}` shape, so the
    edge function stays a thin transport with no SQL in it. Each of the seven is
    annotated with the decision it changes — the contract's standard, since a
    number that changes no decision generates opinions. `median_session_ms`
    stays rejected. Scalars 6 and 7 are the two that Postgres cannot compute
    from app data (a fallback serve and a draft recovery leave no trace in any
    table), which is why they ride the events channel as non-error kinds — so
    `kind` is genuinely not always `"error"`.
  - **The endpoint (`supabase/functions/hq-telemetry`)**: bearer auth with a
    constant-time compare, failing CLOSED when the token is unset (an unset
    secret must never mean "no auth required"), `since` filtering events while
    scalars are always the current snapshot, a ~7-day retention sweep that can
    never fail a pull, and an explicit `truncated` flag so a capped response is
    never mistaken for a complete one. It computes no fingerprint: that is HQ's
    job, so the logic can improve without every project redeploying.
  - **Symbolication (piece E)** resolves the contract's trap. Symbolicating in
    the BROWSER would require publicly fetchable source maps — publishing the
    app's source to the entire internet to avoid showing frames to HQ. Instead
    maps go to a PRIVATE Supabase Storage bucket at build time
    (`0006_sourcemap_bucket.sql`, no storage policies at all, so only
    service_role reaches them) and the edge function maps frames on the way out.
    HQ never sees a `.map`. The Base64-VLQ decoder is written out rather than
    pulled from npm, to keep a whole class of "does this package work under the
    edge runtime" failure out of a function whose job is to be boring; it is
    tested against a real esbuild-generated map, not a hand-built fixture, since
    a fixture would only prove the decoder agrees with its author.
    `scripts/upload-sourcemaps.mjs` uploads and then **always** deletes maps
    from `dist/`, including when the upload is skipped or fails — `dist/` is
    what Cloudflare Pages serves, so the failure mode must be "symbolication
    degrades to raw frames", never "the source is public". Its guard earned its
    place immediately: it caught that vite-plugin-pwa emits its OWN
    service-worker maps with `sourceMappingURL` comments regardless of
    `build.sourcemap`, and refused to ship. Fixed at the source with
    `workbox.sourcemap: false`.
  - **`public/privacy.html` updated in the SAME commit as the collection code**,
    per the contract's explicit checklist step. No new processor (the data goes
    to Supabase, already the processor for notes and auth), so the "no
    third-party advertising or behavioral tracking" claim is untouched. The
    "does not record what you read" claim also survives, and this is the
    load-bearing bit: it is now backed by construction rather than by promise,
    because a passage reference cannot reach a report even if someone later
    writes a new error message mentioning one. A user-facing opt-out is
    deliberately deferred — see Deferred.
  - **Verified against the LIVE hosted project**, not reasoned about. Docker
    could not start in this session (WSL reported no installed distributions),
    so the `supabase db reset` path that verified the 0002 views was
    unavailable; with the owner's approval, migrations 0002-0006 were pushed to
    the `berean` project instead and the function deployed. All five migrations
    are idempotent by construction (`create or replace` / `if not exists` /
    `on conflict`), which is what made re-applying 0002 — recorded locally but
    absent from the remote migration history — safe rather than a gamble.
    What the live run actually proved:
    - Wrong bearer token → 401. Missing header → 401. Bad `since` → 400.
    - Correct token → all seven scalars in the contract's exact
      `{key, value, unit, window}` shape, with `signups = 1` (a real row).
    - `since` genuinely filters: epoch → 2 events, first event's own timestamp
      → 1, a future timestamp → 0.
    - Two deliberately-thrown errors carrying passage references in their
      MESSAGES ("...404 Not Found (JHN 3)" and a note-shaped
      "Genesis 1:1 the darkness has not overcome it") arrived with
      `code: UNKNOWN_ERROR`, the class, and frames only. The RAW response body
      was then grepped — not asserted on parsed fields — for JHN, John,
      Genesis, darkness, overcome, helloao, 404, "Not Found": **zero hits.**
    - RLS is genuinely write-only: anon INSERT → 201; anon SELECT → 401,
      `42501 permission denied for table telemetry_events`.
    - Every payload guard rejects: far-future and far-past `occurred_at` (401,
      policy), malformed `install_id`, unknown `kind`, and a 9,000-character
      stack (400, CHECK).
    - A hostile client-supplied `sample_weight: 9999` was accepted and stored
      as **1** — the trigger's override working as intended.
    - Burst limit exact: 25 rapid inserts from one install, **20 stored, 5
      silently dropped**, and all 25 POSTs returned success to the client,
      which is the required fire-and-forget behaviour.
    - Both non-error kinds flowed through and moved their scalars to 1,
      confirming `kind` is not always `"error"` end to end.
    - Symbolication end to end through PRIVATE storage: a raw frame
      `index-B3wapBga.js:74:59833` came back as
      `at getChapter (src/bible/helloao.ts:144:9)` — the actual
      `throw new CodedError` site. The maps were confirmed unfetchable both
      anonymously and with the anon key (400 both ways), absent from `dist/`,
      and untracked by git.
    All test rows and test maps were deleted afterwards; the buffer is back to
    zero. **The function must be deployed with `--no-verify-jwt`** — HQ presents
    a bearer token, not a Supabase JWT, so the platform gateway would otherwise
    401 every legitimate call before our own constant-time check ran. This is
    documented at the top of the function; redeploying without the flag breaks
    the endpoint while looking like a tightening.
  - **Retention no longer depends on a consumer that does not exist
    (`0007_telemetry_retention.sql`).** The original design swept old rows
    inside the edge function's pull. Sound, but insufficient alone: the sweep
    only runs during a pull, and HQ's ingest is P2, so until something called
    the endpoint nothing aged out and `public/privacy.html`'s "kept for about
    seven days on Lantern's side" was backed by a caller that did not exist.
    Not a capacity problem — the guard trigger caps an install at 500 rows a day
    and a healthy app generates roughly none — a correctness one. A pg_cron job
    now runs `public.prune_telemetry_events()` daily at 03:17 UTC regardless of
    whether anyone pulls. The extension check is defensive (a migration that
    hard-fails on a missing extension would block every later migration), and it
    reports via `raise notice` so the outcome is visible at apply time rather
    than inferred; the live apply printed `pg_cron: scheduled
    prune-telemetry-events daily at 03:17 UTC`. The edge-function sweep is
    KEPT — cron covers nobody-is-pulling, the in-request sweep covers cron being
    disabled, and neither depends on the other. Verified live: two rows in (one
    current, one backdated 9 days), prune returned 1, the current row survived;
    and both `prune_telemetry_events` and `hq_telemetry_scalars` reject anon
    with `42501 permission denied`. Note the backdated row had to be inserted
    with service_role because the RLS policy correctly refuses to let anon
    backdate — an incidental re-confirmation of that guard.

  - **Verified on the real deploy (2026-07-21, commit `1c593a2`).** The push
    landed, Cloudflare picked up `SUPABASE_SERVICE_ROLE_KEY`, and all three maps
    uploaded to the private bucket under the full commit sha within ~40s of the
    build (`index-*.js.map` 2.1 MB, `Landing-*.js.map` 85 KB,
    `workbox-window.prod.es5-*.js.map` 13 KB). Production 200 on `/` and
    `/privacy`; zero `sourceMappingURL` references in the deployed bundle.
    **Method lesson worth keeping: on this host you CANNOT test "is the source
    map public?" with a status code.** `public/_redirects` has a SPA catch-all,
    so Cloudflare Pages answers *every* unmatched path with `HTTP 200` and
    `Content-Type: text/html` — the app shell. A first check asserting "the
    `.map` URL must 404" therefore looked like a leak when nothing was leaking.
    The correct test is to compare bodies: `/assets/index-<hash>.js.map` returns
    **byte-identical** content to a deliberately nonsensical path
    (`/assets/total-nonsense-xyz.map`), 5,100 bytes of HTML in both cases, and
    neither parses as JSON. Same family of trap as the `_redirects` 308 loop
    recorded under the Cloudflare Pages entry: this host's routing makes
    status-code assertions misleading, so assert on content.

  - **A real bug was caught before it shipped.** The insert policy originally
    asserted `sample_weight = 1` to stop a client setting its own weight.
    PostgreSQL evaluates a policy's WITH CHECK expression AFTER BEFORE ROW
    triggers, so that would have rejected exactly the rows the sampling branch
    had just legitimately stamped — sampling would have failed closed under
    load, which is precisely when it is needed. The guard now forces the weight
    to 1 at the top of the trigger instead, making a client-supplied value
    irrelevant by construction rather than a failed insert.

- **Telemetry indexes — migration 0003 (2026-07-21).** Three additive indexes
  (`notes(created_at)`, `notes(created_by)`, `profiles(created_at)`) that four of
  the seven agreed telemetry scalars need to avoid a full table scan: weekly
  active writers, median notes per writer, returned-studies % and 30-day signups
  all filter or group on a column with no index. `notes` had only
  `notes_session_idx`; `profiles` had nothing beyond its primary key. Purely
  additive — no table, column, policy, trigger, function or row touched — and
  every statement is `if not exists`, so re-running the file is safe. Deliberately
  two single-column indexes rather than one `notes(created_by, created_at)`
  composite: between them they serve more query shapes, and index maintenance on
  insert is irrelevant at this row count. See `D:/Projects/hq/TELEMETRY.md`,
  "Known cost before adopting".

- **Thrown errors split into machine `code` + local `detail` (2026-07-21).**
  SAFETY-CRITICAL groundwork, landed deliberately BEFORE any code that transmits
  anything. Every interpolated `throw` in `src/` was re-enumerated (six, not the
  five previously recorded — `fixture.ts` was missed by the earlier audit) and
  three of them embedded a passage reference, i.e. what the person was reading in
  a private study journal:
  `helloao fetch failed: 404 Not Found (JHN 3)`.
  Those messages were written for developer debugging long before telemetry
  existed and are correct for that purpose, which is exactly why a convention
  could not have caught them — a convention cannot reach backwards into code
  written before it, and regex scrubbing fails because "JHN 3" is not safely
  pattern-matchable.
  **The fix is structural, in three layers** (`src/errors.ts`): (1) a
  `CodedError`'s `message` IS its stable machine code and nothing else, so any
  generic `.message` reader — `window.onerror`, an error boundary, a logging
  wrapper someone adds next year — gets `BIBLE_FETCH_FAILED` without having to
  know the rule exists; (2) the human detail lives in an ES `#private` field,
  unreachable by every generic mechanism a payload builder would use (`{...err}`,
  `JSON.stringify`, `Object.keys/entries`, `err['detail']`, structured clone);
  (3) the only bridge to the telemetry layer is `toTelemetrySafe()`, which
  returns a NEW plain object of exactly `{code, errorClass, stack}` — the payload
  builder's signature takes `TelemetrySafeError` and never `Error`, so it does
  not merely decline to read the detail, it never holds the object the detail is
  attached to. Layer 3 is the load-bearing one; 1 and 2 hold the guarantee on
  paths that don't go through it.
  **Two non-obvious leaks closed along the way.** `toTelemetrySafe()` never reads
  `.message` even for foreign errors — Postgres echoes submitted values back
  inside constraint-violation messages, so a Supabase error's message is
  untrusted text. And it strips the `"Name: message"` header from `stack`, or the
  message would smuggle itself back in through the field next to the one we just
  refused to read; frames are matched POSITIVELY (a line must look like a frame
  to survive) rather than by dropping the first line, because a multi-line
  message defeats a drop-the-first-line rule. Positive matching fails closed.
  Verified live in a real browser, not just asserted: with `fetch` stubbed to 404
  for helloao, reading John 9 logged `message = BIBLE_FETCH_FAILED` with
  `detailForConsole() = "404 Not Found (JHN 9)"`, and the self-hosted fallback
  still served the real chapter. 11 new tests (116 total, was 105), including
  end-to-end ones over the real throw sites that would have caught the original
  bug without anyone remembering to check a particular string.

- **Error code/detail discipline made self-enforcing (2026-07-21).** The
  CodedError split above (see the entry directly above) was correct only as
  long as every future contributor remembers it — and the entry itself proves
  a human audit already failed once (`fixture.ts` was missed and "five" got
  recorded where there were six). This closes that gap with two build-time
  guardrails instead of a convention:
  1. `src/errors.guardrail.test.ts` scans every non-test file under `src` for a
     native `throw new Error(` called with a template literal — the exact
     shape of the original leak — and fails the build naming the offending
     file and line. Passes clean on the current tree (all six real sites use
     `CodedError`). Verified as a NEGATIVE test, not just a passing one: an
     interpolated throw was temporarily added to `src/utils/bibleBooks.ts`,
     confirmed the guardrail failed and named `utils/bibleBooks.ts:579`
     exactly, then reverted.
  2. A new ESLint `no-restricted-syntax` override on `src/telemetry/**`
     forbids calling `.detailForConsole()` from that directory, pointing the
     reader at `src/errors.ts` in the message — the one place a future
     telemetry change could reach for the human detail by mistake.
  `src/errors.ts` itself was deliberately not touched — the guarantee it
  provides was already correct; this only makes the build catch a regression
  of it. One new test (124 total, was 123); lint's 3 pre-existing errors
  (2 in `scripts/migrate-sqlite.ts`, 1 in `src/utils/richText.ts`) are
  unchanged.

- **Category/accent text contrast fixed with an `-ink` token (2026-07-21).**
  Measured, not eyeballed. Every light theme failed WCAG AA for category text:
  2.98–3.68:1 on the pill's own 12% tint and 3.39–4.25:1 on the canvas, against
  a 4.5:1 floor. The pills are **12px/500**, nowhere near the large-text
  exemption that would have allowed 3:1. `--accent` shares the observation hue,
  so accent-coloured text failed too. Dark mode was never affected (4.65–6.72:1)
  because the weak tint composites over a dark surface rather than a near-white
  one.
  **The fix is a separate token, not a darker palette.** `--cat-X` also paints
  every solid fill, rail bracket, dot and left-border in the app, where contrast
  is irrelevant and the current hues are correct. Darkening it would have been a
  palette-wide design change to fix a text problem. Instead each theme gained
  `--cat-{observation,historical,application,personal}-ink` and `--accent-ink`,
  hue and saturation preserved with HSL lightness lowered until it passes, and
  the 14 `color:` sites were switched. Fields are byte-identical to before —
  verified in-browser that `--cat-application` still resolves to `#b5732a`
  (default), `#ba7517` (scholarly), `#c07b12` (modern). In the four dark blocks
  `-ink` aliases straight back to `--cat-X`, so dark is untouched by
  construction rather than by coincidence.
  Verified live via computed styles in a real browser, not calculated: light
  went **2.98–3.46 → 4.64–4.65**, dark unchanged at **5.75–6.20**. The measured
  result beats the solved target because pills sit on a card surface rather than
  the canvas, so the solver was given the pessimistic case on purpose.
  **Rule going forward: `--cat-X` for backgrounds and borders, `--cat-X-ink` for
  text.** Documented in `tokens.css` at the declaration.
  Still open, and deliberately not swept here: roughly 19 other
  `color: var(--accent)` sites (links, buttons, active states) measure ~4.25:1
  as text on the light canvas. `--accent-ink` now exists for them, but switching
  primary UI colour app-wide is a visible design change that wants the owner's
  eye rather than a drive-by edit. See Deferred.

- **Point-of-use onboarding hints + Onboarding.tsx trim (2026-07-21).**
  Implements `docs/proposals/onboarding-hints.md`'s two recommended hints —
  none of its four rejected candidates (Alt-drag copy, `@`/verse tagging,
  study-vs-reading explainer, desktop marquee). Verse selectability:
  a dismissible tip in `BookDetailPage`'s `ChapterView`, shown once near the
  verse list until the reader's first real selection (localStorage
  `berean.verseSelectHintSeen`), with separate desktop/mobile click-vs-tap
  copy via the existing `.hint-text-desktop`/`.hint-text-mobile` split.
  Sub-notes via Tab: a second one-time popover in `NoteEditor`, triggered the
  first time a full-Study-mode note's line count goes from 1 to 2
  (`berean.indentHintSeen`), desktop-only — hidden at the mobile breakpoint
  since there's no Tab key on touch, and out of reach for Quick note, which
  is single-line by construction. Both reuse the `note-hint-popover`
  look/pattern. `Onboarding.tsx` dropped the two front-loaded Study-mode/
  Reading-mode explainer screens per the proposal's recommendation — their
  content is now taught in context by these hints and existing nav/library
  copy — keeping only the optional name step; `berean.onboarded` and its
  localStorage fallback gate are untouched.

- **Persist in-progress note drafts to IndexedDB (2026-07-20).** Closed the
  actual data-loss window `docs/proposals/offline-write-outbox.md` identified:
  a failed save left typed content only in `StudyMode`'s React `lines` state,
  so a reload or tab close before reconnecting destroyed it with no trace.
  `src/offline/draft.ts` (same shape as `mirror.ts`/`cache.ts`: one small
  IndexedDB store, write-through, best-effort) now persists the in-progress
  draft debounced as the user types, keyed by passage id once one exists or
  by the committed reference before that. Restored on return to the same
  study, cleared the moment a save actually reaches the server so a stale
  draft can never resurface and overwrite newer server state. A restored
  draft shows an explicit "nothing here is on the server yet" notice — never
  the per-line "saved Xh ago" stamp, which only ever reflects confirmed
  server content. This is deliberately the small first step the proposal
  recommended, not the full write outbox (queue/replay, idempotent retries,
  conflict reconciliation) — that remains deferred, see "Offline write
  outbox" above. `ErrorBoundary.tsx`'s "copy the text somewhere before you
  reload" line was deliberately left unchanged: draft protection only
  applies once a reference has been committed and the user has navigated
  back to the same study by hand (app-level navigation state itself doesn't
  survive a reload), so the instruction still holds rather than overpromising.

- **Privacy page brought back in line with reality, twice (2026-07-21).** The
  standing rule ("adding ANY analytics, or any new service touching user data,
  means updating the privacy page in the same change") was applied to two things
  that had drifted past it:
  - **The self-hosted BSB fallback.** The processor list named
    `bible.helloao.org` as the scripture source, which stopped being the whole
    truth once we began serving a fallback copy from `lanternword.com` itself.
    Now stated. No new third party, so the tracking claims were unaffected.
  - **Cloudflare Web Analytics, which was already live and undisclosed.** It was
    enabled in the Cloudflare dashboard around 2026-07-19 and had been counting
    traffic for two days. The 2026-07-20 privacy audit did not catch it, and
    structurally could not have: **that audit was run against `src/`, and no code
    audit can see behaviour the host injects at the edge.** Verified on a real
    production page load rather than assumed — no beacon script, no
    `cloudflareinsights` request, no `data-cf-beacon` attribute, one script tag
    total — so it is edge-side collection under "Automatic setup" with no
    third-party code in the visitor's browser, and the public "no third-party
    advertising or behavioral tracking" claim survives intact. Disclosed anyway,
    because the rule is about disclosure, not about whether a claim technically
    holds. **Standing lesson: auditing the repo is not auditing the deployed
    system.** Anything enabled in the Cloudflare or Supabase dashboards is
    invisible to `grep` and needs its own periodic look.

- **Outline the wordmark to SVG paths (2026-07-20).** `Wordmark.tsx` now
  renders static `<path>` geometry instead of a live text node, so it no
  longer depends on the self-hosted static Source Serif 4 having loaded.
  Generated in the runner (not a repo dependency): HarfBuzz shaped the literal
  string "Lantern" against the self-hosted 600-weight woff2 so the real GPOS
  kerning and `.wordmark`'s `-0.02em` letter-spacing are baked into the glyph
  coordinates, then fontTools' `SVGPathPen` traced each glyph outline; the
  seven glyphs were composited into one path at their shaped positions. `fill`
  stays `currentColor` on the `.wordmark` class, so `color: var(--text)` still
  drives every theme exactly as before. No new package.json dependency —
  `fonttools`/`uharfbuzz` were used only as one-off generation tools, not
  shipped.

- **React error boundaries + recoverable failure UI (2026-07-20).** Found during
  backlog triage on 2026-07-20: a render-time throw anywhere in the tree blanked
  the whole app with no recovery. `src/components/ErrorBoundary.tsx` is a small
  class component (the one place React still requires a class) with two
  fallback variants, both built from existing design tokens only (no new color
  literals): `variant="app"` is a full-screen calm recovery card wired around
  both `Root.tsx` render paths (Supabase and memory-stub), with a "Reload"
  button; `variant="pane"` is a smaller in-place fallback wrapping the two
  scripture-rendering surfaces — `PassagePane` in `StudyMode` and `ChapterView`
  in `BookDetailPage` — with a "Try again" retry, so a chapter-load render
  failure degrades only that pane. Both boundaries are keyed on the data that
  produced the render (passage reference / book+chapter) so navigating to a
  different passage or chapter remounts a fresh boundary instead of getting
  stuck showing a stale fallback. No telemetry or error-reporting SDK added —
  out of scope by design, so `public/privacy.html`'s "no third-party tracking"
  claim needed no change. Verified with a deliberately thrown test error,
  screenshotted in light/dark at desktop/mobile widths, then reverted; `tsc
  --noEmit` clean, tests pass.

- **Self-hosted BSB fallback (2026-07-20).** `bible.helloao.org` is no longer a
  single point of failure on the scripture read path. `scripts/build-bsb-bundle.mjs`
  downloads the complete BSB from the publisher (`bereanbible.com/bsb.txt`,
  public-domain / CC0) and emits `public/bible/bsb.json.gz` (~1.2 MB gzip, all
  1,189 chapters). `SelfHostedBibleProvider` (`src/bible/self-hosted.ts`) serves
  any chapter from it, wired as the FALLBACK behind helloao via
  `FallbackBibleProvider` — fetched **lazily**, only after the primary throws,
  and memoized for the session. It sits outside the cache-forever layer (safe to
  cache since the text is real, but kept out so the cache mirrors helloao only —
  see the code comment). Excluded from the PWA precache via `globIgnores` so users
  don't download the whole Bible on first load. **BSB attribution shipped
  2026-07-21** in `public/about.html`'s footer (public-domain, so not legally
  required, but correct), and `public/privacy.html`'s processor list was corrected
  in the same change: it described helloao as the sole scripture source, which
  stopped being true the moment we started serving a fallback copy ourselves. No
  new third party is involved, so the "no third-party tracking" claims are
  unaffected — but the standing rule is that any change to what the app fetches
  gets reflected on that page in the same commit, and this is that.

- **Product usage analytics — read-only SQL views (2026-07-20).**
  `supabase/migrations/0002_analytics_views.sql` adds six views for the app
  owner: `analytics_total_signups`, `analytics_signups_per_week`,
  `analytics_notes_per_user`, `analytics_active_days_per_user`,
  `analytics_week2_retention` (per-signup-week retention, active = a note
  created in days 7-14 after signup), and `analytics_most_studied_books`
  (notes per USFM `book_number`, names mapped inline from
  `src/utils/bibleBooks.ts`'s order — deliberately not a table). No existing
  table/policy/trigger/function touched; no row written; every view uses
  `create or replace` so the migration is idempotent. **Security (the point of
  the task):** every view has `security_invoker = on` (so a BYPASSRLS
  migration-role owner can't silently bypass `notes`'/`profiles`' RLS for
  callers) AND has `select` explicitly revoked from `anon`/`authenticated` —
  belt-and-suspenders, since Supabase's default privileges would otherwise
  auto-grant `anon`/`authenticated` `select` on any new relation. Verified
  against a real local Postgres via `supabase db reset` (Docker), not just
  parsed: seeded two users with notes across two books, ran every view as the
  seeding role and got real, correct rows; then ran the same six `select`s as
  an authenticated non-owner JWT via PostgREST and got `permission denied`
  (`42501`) on all six, confirmed again after a legitimate
  `grant select ... to authenticated` to rule out a false-negative RLS
  masking bug. See `docs/BACKLOG.md` Deferred for the one follow-up this
  surfaced (a privacy-page re-check, out of this task's scope).

- **`design/` deleted (2026-07-20).** `design/README.md` always said the committed
  specs were temporary and should go once ported, and all three are: `lantern-hero`
  (the flythrough), `lantern-features` (the three clips), and `lantern-mockup`
  (layout/copy/login direction). They remain in git history if a spec ever needs to
  be re-read. Four *untracked* scratch files were removed at the same time
  (`mockup.html`, `landing-mockup.html`, `lantern-anim.html`, `lantern-logo.html`)
  — earlier-generation explorations, including the pictorial-mark study whose
  conclusions are already written up in the Lantern rebrand entry below, so nothing
  load-bearing was lost. Note for anyone re-reading the landing code: the loop
  machinery in `useClipLoop.ts` was ported from these specs and the clone +
  translateY compensation is load-bearing, so the *code* comments are now the only
  live explanation of why it works that way.

- **Repo normalized with Prettier (2026-07-20).** Done as its own commit, alone,
  exactly as this item required: `npm run format` rewrote **39 files
  (+2919/-1171)** in `src/`. The line growth is mostly compact multi-declaration
  CSS in `tokens.css` splitting one-per-line, not new code. Purely mechanical —
  verified `tsc --noEmit` + vite build clean, **87/87 tests pass**,
  `prettier --list-different` now reports 0 files, and both theme cascades still
  resolve correctly in the running app (dark `#a49cf0`/`#ece4d6`/`#211d17`, light
  `#6b62d6`/`#201e1a`/`#fbf9f4`). ESLint reports the same 3 errors as before the
  sweep, so none were introduced; two of them are `node:crypto`/`node:process` in
  `scripts/migrate-sqlite.ts`, which is a legitimate Node script **outside**
  `src/` — the `no-restricted-imports` rule is just scoped repo-wide rather than
  to `src/`, worth tightening if it ever gets noisy.

  **The sweep also surfaced a real bug**: `src/assets/dark.css` had been
  syntactically invalid since the dark.css prune (59f6e3e), which deleted the
  comment, selector and declaration of `body.dark .wn-version-chip` but left its
  closing brace (87 open / 86 close). Browsers discard a stray top-level `}` via
  error recovery so there was no visual regression, but Prettier refused to parse
  the file, which is how it came to light. Fixed in its own commit first. Lesson
  worth keeping: a formatter doubles as a syntax checker for CSS, which nothing
  else in this toolchain was doing — `tsc` and vite both built happily around it.

  Policy going forward is documented in CLAUDE.md under **Repo hygiene**: run the
  formatter freely, never mix a reformat with a feature change, and don't widen
  the `src/**/*.{ts,tsx,css}` glob (the HTML under `public/`, `supabase/templates/`
  and `index.html` has constraints the formatter doesn't know about).

- **Launch-readiness closeout (2026-07-20).** The last four open items from the
  deploy/auth milestone, all now resolved:
  - **Google identity linking VERIFIED.** The acceptance test finally ran: signing
    in with Google on the same address as an existing email account showed the
    same notes, so Supabase linked the identities into one `auth.users` row and
    the signup trigger did NOT mint a duplicate workspace. This was the one
    remaining correctness gate on the auth work — a failure here would have
    silently split a user's data across two workspaces.
  - **`hello@lanternword.com` routes.** Cloudflare Email Routing is configured as
    a catch-all forwarding all `@lanternword.com` mail to the owner, so the
    contact address published on the live `/privacy`, `/terms` and `/about` pages
    is real. (Receive-only: replying *as* `hello@` would need Gmail "Send mail as"
    over the existing Brevo SMTP credentials.)
  - **Legal pages reviewed and finalised.** Contact address resolved as above.
    Governing law deliberately stays NEUTRAL ("the laws applicable at the
    operator's place of residence") rather than naming a venue — for a
    personal-scale, single-operator app with no payments and no corporate entity
    that is a valid choice-of-law clause and naming a specific jurisdiction buys
    little; revisit if Lantern ever incorporates or takes payment. The privacy
    claims were checked against the actual code, not assumed: the only
    third-party host `src/` contacts is `bible.helloao.org`, runtime deps are
    react/react-dom, `@supabase/supabase-js`, `fflate` and two self-hosted
    `@fontsource` packages, and there is **no analytics, telemetry or tracking SDK
    anywhere** — so "no ads / no third-party tracking" is accurate as written.
    Standing constraint recorded in each file's header: adding ANY analytics, or
    any new service touching user data, means updating the privacy page in the
    same change.
  - **`prefers-reduced-motion` VERIFIED** (previously "never verified live").
    Audited rather than assumed: **32 of 32** `animation`/`transition`
    declarations in `motion.css` sit inside a `prefers-reduced-motion:
    no-preference` guard (zero outside), backed by a global
    `*:not(.upd-spinner)` kill-switch using `!important` near-zero durations; and
    the JS side is covered too — `usePrefersReducedMotion()` reads the flag at
    mount and `useClipLoop` skips the script entirely. The resting states were
    then inspected by temporarily forcing the flag in dev: all three feature
    clips render real laid-out content at 498x290 (verse text, the four note
    categories, the search-and-return result) and the hero renders its full
    scene — none blank, collapsed or half-built. The temporary override was
    reverted.

- **Google OAuth live + consent-screen branding verified (2026-07-20).** Google
  sign-in works end to end, and brand verification finally PASSED, so the consent
  screen shows "Lantern" and the logo instead of the raw `…supabase.co` host.
  Getting there took six rejections; the durable lessons, because they are not
  obvious and cost a lot of time:
  - **A client-rendered SPA is invisible to the checker.** The served
    `index.html` was an empty `#root`, so the reviewer saw no app name and no
    purpose. `<meta>`/`<title>` do NOT count as homepage content, and
    `<noscript>` is hidden whenever JS runs. The fix that works is REAL visible
    markup in the served HTML (now a fallback inside `#root` that `createRoot`
    replaces on mount), plus a static page — `public/about.html` — that never
    depends on JS at all.
  - **The privacy link on the homepage must be ABSOLUTE and byte-match the
    consent-screen value.** The requirement says the link "should match the link
    you added on your consent screen configuration"; every link on our pages was
    relative (`/privacy`) so it never matched `https://lanternword.com/privacy`.
    This was the last blocker and the least obvious one.
  - **An orphan page is never crawled.** `/about` reported "URL is unknown to
    Google, Last crawl: N/A" with "Referring page: None detected" — nothing
    linked to it, so the checker had nothing to read no matter what it contained.
    Search Console → **URL Inspection** is the tool that reveals this, and should
    be the FIRST diagnostic next time, not the last.
  - **Brand verification checks the name AND the logo**, and the logo must be the
    same file that was uploaded (`icon-512.png`), rendered on the page next to the
    exact app name.
  - **Full app verification is NOT required** for non-sensitive scopes
    (email/profile/openid) — only the lightweight *brand* verification. Ignore the
    Audience page's generic "submit your app for review" banner; that is the heavy
    sensitive-scope path.
  - Also fixed along the way: `/robots.txt` was being served as the app's HTML by
    the SPA catch-all (`public/robots.txt` + `public/sitemap.xml` now exist).
  Incidental: Cloudflare **Email Obfuscation** rewrites `mailto:` links on the
  static pages into `/cdn-cgi/l/email-protection` plus a decoder script — harmless,
  but proof Cloudflare mutates served HTML; check Rocket Loader is off if crawler
  rendering ever looks wrong. Full blow-by-blow is in git history.

  **Standing decision — keep BOTH Google and email, not Google-only.** Google is
  the prominent one-click default; email OTP stays as the fallback ("or continue
  with email"). Do not "simplify" this away: (1) account-lockout risk — if
  something goes wrong on Google's side there would be no way back into the app's
  own data; (2) a real minority of users specifically avoid Google-linked sign-in
  for a personal spiritual-journal app; and (3) Apple's App Store guidelines
  require offering Sign in with Apple as a parallel option if Google sign-in is
  offered, so a Google-only app would be forced to add a *third* auth method just
  to ship on iOS (see the Capacitor mobile wrap item), whereas keeping email as the
  neutral fallback never trips that rule.

- **Custom SMTP auth email templates (2026-07-19).** `supabase/templates/
  magic-link.html` (the one that matters — `signInWithOtp` with
  `enable_confirmations = false` routes through the "Magic Link" template for both
  new and returning users) and `confirm-signup.html` (defensive duplicate). Both
  lead with the 6-digit `{{ .Token }}` and offer `{{ .ConfirmationURL }}` as the
  fallback, matching `SignIn.tsx`'s code screen; styled to the design tokens
  (table layout, all-inline styles, Georgia serif, Psalm 119:105, entities for
  curly quotes so no mojibake). Verified live end to end: a real email arrives from
  `no-reply@lanternword.com`, renders correctly in a real Gmail inbox, and the code
  signs in. **Bug the live test caught:** the hosted Supabase project was issuing
  an **8-digit** OTP while `SignIn.tsx` caps the field at `maxLength={6}`, so a
  real user could only type 6 of 8 and sign-in would fail. Fixed at the source
  (owner set the hosted Email OTP length to 6 — `config.toml` drives only the local
  CLI) and re-verified with no bypass. Brevo remains the send pipe; note Brevo SMTP
  keys die after 90 days of *zero* sending, so if auth email ever stops silently,
  regenerate the key first.

- **Cloudflare Pages deploy — live (2026-07-19).** `lanternword.com` is registered
  at Cloudflare Registrar with DNS, the Pages project builds `dnav0/lantern`
  (`npm run build` → `dist`), the custom domain is attached, and the `*.pages.dev`
  origin is `lantern-5jf.pages.dev`. `supabase/config.toml` `site_url` /
  `additional_redirect_urls` point at production + preview + localhost, and the
  hosted Supabase Auth → URL Configuration allowlist was confirmed to match.
  **Decided: Pages, not Vercel** — `public/_redirects` is already Cloudflare/Netlify
  format; Vercel would need a `vercel.json` rewrite for no gain. Gotchas worth
  keeping: Cloudflare's Git-import defaults to the **Workers** flow
  (`npx wrangler deploy`, expects a Worker we don't have) — the correct path is the
  **Pages** product; and do NOT add explicit `/privacy` → `/privacy.html` rewrites
  to `_redirects`, because Pages already serves static files at their extensionless
  URL and 308-redirects `.html` → clean, so an explicit rewrite causes an infinite
  redirect loop (this actually shipped and broke the live legal pages for a few
  minutes).

- **Alt-modifier escape hatch so verse text can be copied (2026-07-19).** The
  desktop marquee deliberately took click-drag away from native text selection
  over verse text (drag = box-select). Now holding **Alt at pointerdown**
  suppresses the marquee for that one gesture, so the browser's native text
  selection runs and the verse text copies with Ctrl+C. The decision lives in a
  pure, DOM-free `shouldStartMarquee()` predicate in
  `src/utils/useVerseMarquee.ts` (unit-tested) that `containerPointerDown` calls
  before touching `user-select`/`preventDefault` — the mode is fixed once at
  pointerdown, so pressing/releasing Alt mid-drag can't flip it. Because the guard
  is in the hook, both consumers (ReadingMode and BookDetailPage/ChapterView) get
  it for free. A quiet inline hint ("Hold Alt and drag to select the text to
  copy") sits inside the existing verse-selection action bar — not a new
  persistent banner — and is hidden on the touch layout where Alt/marquee don't
  apply. Replaces the two deferred "modifier-to-copy" entries.

- **dark.css redundancy prune (2026-07-19).** Removed 40 `body.dark …` rules
  (122 lines, 472 → 350) that only restated a value the `tokens.css` `body.dark`
  reassignment already produces via an always-applied `main.css` base rule of the
  identical `selector { property: var(--token) }`. NOT a blanket sweep — most
  `body.dark` rules survived because they do real work, and three traps were
  caught: (1) **real overrides** where dark uses a *different* token than the base
  (`.verse-text` light `--text` → dark `--text-muted`; every `::-webkit-scrollbar-thumb`
  light `--border` → dark `--surface-2`; `.reading-meta`/`.se-icon-btn`/`.bible-book-name`
  muted→faint; `.reading-note-card.highlighted` weak→weaker; etc.) or a raw
  dark-only value (`.note-timestamp #c4c1ba`, all the `rgba(255,255,255,…)` hairlines,
  the `#3a3654` bracket default); (2) **specificity traps** where deleting a matched
  rule would let a *kept* higher-specificity `body.dark` rule take over — the
  `.rail-bracket.cat-{historical,application,personal}` rules must out-specify the
  kept `body.dark .rail-bracket {background:#3a3654}` default, and
  `.verse-action-btn.primary(:hover)` must out-specify the kept generic
  `body.dark .verse-action-btn`, and `.reading-verse-row.highlighted` must win over
  the kept `body.dark .reading-verse-row:hover` in the combined state — all kept;
  (3) **competing override** — `body.dark .welcome-title` also exists in `main.css`
  (`#f0ede8`), so the dark.css copy is load-order-load-bearing, kept. Two
  `body.dark` rules whose only base declaration lives inside a `max-width:768px`
  block (`.study-scripture-toggle-hint`/`-chevron`) were kept conservatively. No
  change to `tokens.css`; deletion-only diff. Screenshot-verified the dark reader
  view is visually unchanged.

- **Terms + Privacy pages, login-card fine print, and prod deploy wiring
  (2026-07-19).** Three things that were gated on "the pages don't exist yet":
  - **Standalone legal pages.** `public/terms.html` and `public/privacy.html` —
    self-contained (own inline CSS, no build step, no app bundle) so they render
    identically regardless of the SPA and give stable, crawlable URLs for a
    future Google OAuth app verification. Styled to the landing's language: warm
    cream canvas, Georgia serif headings/wordmark (the app's documented fallback
    for the self-hosted Source Serif 4, which a standalone page can't load),
    indigo accent, Psalm 119:105 footer. Content is grounded in the ACTUAL
    architecture (Supabase auth by email/Google, notes stored with per-account
    RLS, Brevo for sign-in email, Cloudflare hosting, BSB via
    bible.helloao.org cached locally; no ads, no third-party tracking).
    The extensionless URLs (`/terms`, `/privacy`) come from Cloudflare Pages'
    native static-first + clean-URL handling — NOT from `_redirects`. A first
    attempt DID add explicit `/privacy`→`/privacy.html 200` rewrites, which caused
    an infinite 308 loop on the deployed pages: Pages auto-redirects
    `/privacy.html`→`/privacy` while the rewrite sent `/privacy`→`/privacy.html`.
    Removed; `public/_redirects` now holds only the SPA catch-all, with a comment
    warning against re-adding those rewrites. Verified live BOTH on the dev server
    (light mode, desktop + mobile: correct palette, 9/10 sections, cross-links, no
    mojibake, no horizontal overflow) AND on production after deploy
    (`lanternword.com/privacy` and `/terms` serve real content, 200, no loop; the
    app root and SPA fallback still work). **Owner still to review the substance** before public
    launch: contact address (`hello@lanternword.com` — ensure it routes), the
    governing-law line, and the effective date; flagged in each file's header
    comment.
  - **Login-card fine print restored.** `SignIn.tsx`'s email step now shows "By
    continuing you agree to the Terms and Privacy Policy" (new `.ll-legal` style
    in `landing.css`), linking to `/terms` and `/privacy` in a new tab. Held back
    originally because the links went nowhere; now they don't. Verified rendering
    in the live dialog.
  - **Prod deploy wiring.** `supabase/config.toml` `site_url` /
    `additional_redirect_urls` moved off localhost to
    `https://lanternword.com` + `https://lantern-5jf.pages.dev` + localhost. The
    hosted-dashboard allowlist confirmation remains an owner step (see the
    Cloudflare Pages item under Deferred).
  Build (`tsc --noEmit` + vite) clean; `dist` emits both html pages + the updated
  `_redirects`.

- **PWA PNG icons regenerated from the new mark, plus a browser favicon.** The
  three manifest icons (`public/icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`) still carried the retired Berean book mark; they're now
  rasterised from `public/icon.svg` (serif "L" on brand navy). The maskable
  variant is full-bleed navy with the L scaled to 80% so it survives an aggressive
  platform mask; the other two keep the rounded-rect tile. Rendered with `sharp`
  in an isolated scratchpad (no project dep added — the earlier "agent can't
  rasterise" note was wrong: sharp does SVG→PNG natively, no Chromium), verified
  visually at size. Also added the browser-tab favicon that was simply missing:
  `index.html` now links `/icon.svg` (SVG favicon) and `/icon-192.png`
  (apple-touch-icon for iOS home screen). The regen script is
  `scratchpad/render-icons.mjs` if these ever need redoing.

- **Landing pass 2 — spacing, the button model, and the anti-SaaS turn.** Owner
  review of pass 1: slightly cramped (especially on wide displays), the buttons
  were confusing, and "Get started free" implied a SaaS pricing model.
  - **The buttons were one action wearing two labels.** "Get started" and "Sign
    in" both opened the same dialog, because first sign-in *is* sign-up
    (`shouldCreateUser: true`) — there is no separate signup path to send anyone
    down. That pair is a SaaS funnel convention (free tier vs returning
    customer) borrowed into a product with no funnel. **Decided: the only real
    choice is *how* to sign in, so that is the only one offered.** Nav is a
    single "Sign in"; the hero is "Continue with Google" + "Continue with email"
    (which is what the approved mockup always specced); the CTA is one button.
    `SignIn` takes `emailFirst` so the hero's email choice isn't re-asked inside
    the dialog.
  - **Anti-SaaS.** "Get started free" → "Start your first study", CTA heading →
    "Ready when you are.", and the hero's "Free to use" → "Nothing to buy" (the
    word *free* only needs saying where a paid tier is implied). Added a **"The
    name" section**: Psalm 119:105, why a lantern (carried, lights one step), and
    a short first-person note on why the tool exists. This also restores the
    mockup's "The name" nav link, which pass 1 dropped as a dead link.
  - **Spacing.** `--wrap` opens 1140 → 1320px at ≥1440 (one step, not endless
    scaling — prose still wants a readable measure); hero padding 76 → 104/128px,
    feature padding 40 → 72/88px, gaps 44 → 64/96px, clip frames 290 → 330px on
    wide.
  - **Google's mark needed the spec's white chip.** Dropped onto the accent-fill
    hero button it read as broken (Google requires the official multicolour G, so
    it cannot be recoloured to the palette). `lantern-mockup.html` had already
    solved this with a white `g-chip`; pass 1 missed it.
  - Verified live at 1728/1440/360px, light + dark: no horizontal overflow, the
    name section stacks, the dialog shows Google over the email divider.

- **Public landing page.** `Root.tsx`'s `signedOut` phase rendered a bare
  `SignIn` screen: an unauthenticated visitor got an email field and no
  explanation of what the app was. It now renders a real landing page
  (`src/components/landing/`, `src/assets/landing.css`), with sign-in moved
  behind its CTAs as a dialog over the page. Ported faithfully from the approved
  specs (`design/lantern-mockup.html` layout/copy, `design/lantern-hero.html`
  hero, `design/lantern-features.html` clips); structure is nav → hero
  flythrough → the three feature clips → CTA → footer.
  - **The specs disagreed with each other, and the newest won.**
    `lantern-mockup.html` predates two later decisions, so porting it literally
    would have undone them: it draws the **retired book+beacon pictorial mark**
    in the nav, footer, and login card (identity is wordmark-only — now
    `<Wordmark />`), and its hero is a **static card superseded by**
    `lantern-hero.html`'s flythrough. Its static "Four lenses" and "Read. Note.
    Return." sections were replaced by the three clips (owner's call — one of the
    clips *is* Four lenses, so keeping both duplicated a section). The hero clip's
    topbar lamp icon (same retired mark) became the wordmark, matching the real
    app's top bar. The login card dropped its separate mark: with a wordmark it
    would render "Lantern" twice, stacked, above "Welcome to Lantern".
  - **Two real bugs the live check caught, both invisible to a build:**
    1. **The landing could not be scrolled at all.** `main.css` locks the app
       shell (`html, body, #root { height:100%; overflow:hidden }`) — right for
       the app, fatal for a 2300px page: everything below the fold was
       unreachable. `.landing` is now its own scroll container, which keeps the
       fix local (nothing to unwind on sign-in, no unlocked body leaking into the
       app). Note for whoever adds the next full-page surface: scripted
       `scrollIntoView` still "works" on an `overflow:hidden` container, so it
       masks this — a wheel is the only honest test.
    2. **The hero's loop visibly jumped on phones.** The spec collapses the
       verse-1 note after a hardcoded 210px of scroll, which clears it on a
       600px-wide card but leaves it in plain sight at 360px (measured: note
       bottom at 285px), so the compensation fired on visible content. That
       distance is now **measured** (`noteBottom + CONFIG.noteClearance`), which
       reproduces the spec's 210px at desktop and adapts elsewhere. The mobile
       clip also steps down its type/rail (the 190px rail crushed scripture to
       ~125px and 7-line verses).
  - **The loop machinery is ported, not rewritten** (`useClipLoop.ts`) — the
    specs' imperative `while(true)` scripts run as-is, since the sequences are
    the approved artifact and the hero measures real layout (see
    `design/README.md`: the clone + translateY compensation are load-bearing).
    Added around them: cancellation (a loop can't outlive its component or stack
    up) and IntersectionObserver gating (four always-running loops is the
    difference between a calm page and a hot laptop). The landing is
    `React.lazy`-loaded, so signed-in users never download it (26 kB JS + 15 kB
    CSS, a separate chunk).
  - Verified live at 1440px and 360px, light + dark, on a real (visible) browser:
    the flythrough types both notes and glides the chapter; **the seamless splice
    was measured, not eyeballed** — sampling a verse's screen position every
    frame across a full scroll showed a steady ~1.05px/frame and **zero
    discontinuities** at either width, matching the spec's "0px shift" claim.
    Clips 1–3 all run; the login dialog opens from every CTA. No horizontal
    overflow at 360px. Build (`tsc --noEmit` + vite) clean.
  - **Not verified live:** the `prefers-reduced-motion` resting states. The
    available browser tooling can't emulate that media query, and the flag is read
    at mount, so it can't be toggled in-page. The paths render statically by
    construction (each clip has a resting state; every loop is skipped) but no one
    has actually looked at them — worth a manual pass with the OS setting on.

- **GitHub repo renamed `dnav0/berean` → `dnav0/lantern`.** Finishes the
  user-visible rebrand outside the code. The local remote was repointed; GitHub
  redirects the old URL, so existing clones keep working. The local folder stays
  `D:\Projects\berean` deliberately (the path is fine, renaming it buys nothing).

- **Lantern rebrand (user-visible) + wordmark identity.** The app is now
  **Lantern**, not Berean. Driver: "Berean" collides in-category with the
  **Berean Standard Bible** — the very translation the app displays — so app-store
  and search results are a wall of "Berean Study Bible" apps, and every good
  domain is taken by Bible ministries. "Lantern" ties to Psalm 119:105 ("your
  word is a lamp to my feet"), and its only real collisions are out-of-category
  (a censorship VPN), so it's far more ownable inside Bible study. Domain
  decided: **`lanternword.com`** (brand-word first, so people read "Lantern" as
  the name; "Word" = Scripture, which resonates with the audience; and it dodges
  the `lanternstudy`/`lanternstudy.com` reversal confusion). Verified available;
  note the GoDaddy connector reports premium/aftermarket domains as "available"
  even at $10k+, so `inthemargin.com`/`illumined.com` were mirages.
  - **The identity is wordmark-only** (`src/components/Wordmark.tsx` +
    `.wordmark` in `main.css`), set in the app's own scripture serif so the
    brand speaks in the voice the app reads Scripture in. This followed a long
    exploration in which **every pictorial mark failed a concrete test**, and
    those findings are worth keeping so nobody re-treads them: a **lantern
    object** is too complex to reduce (stripped down it reads as a bag/bell/jar);
    an **open book** is depth-ambiguous at mark size (four renderings — outlined,
    solid, edge-on, page-stack — all failed; you can't tell a closed back cover
    from an open book); a **lamp** contradicts the name (a lantern is *carried*,
    a pendant is *fixed*); and a **flame on a book** risks reading as a *burning
    Bible*, which is disqualifying for this product. A wordmark is unambiguous,
    timeless, and makes the mark and the name one thing by definition.
  - **Changed:** `Wordmark` replaces the retired `AppLogo` (book+beacon, deleted)
    in `NavBar`, `SignIn`, `Onboarding`; `index.html` title; PWA manifest
    `name`/`short_name` in `vite.config.ts`; `package.json` name; the default
    theme's visible label ("Berean" → "Lantern"); and `public/icon.svg` is now a
    serif "L" on the brand navy, drawn as **outlined shapes rather than `<text>`**
    because a favicon renders in isolation where the self-hosted font isn't
    guaranteed. Verified live on the memory stub: title reads "Lantern", the
    wordmark resolves to Source Serif 4 600, and no "Berean" text remains in the
    UI. `tsc --noEmit` clean. See Deferred for the leftover PNG icons, the
    outlined-wordmark step, and why internal `Berean*` identifiers stayed.

- **Journal entry delete.** `JournalPage.tsx` rows had no delete affordance;
  added one per row without threading through `App.tsx` (the page already holds
  `useApi()` + its own entries state). Each entry is now wrapped in a
  `.journal-entry-row` so a `.se-icon-btn.se-icon-danger` delete button sits as
  a *sibling* of the row `<button>` (never nested — invalid HTML), overlaid at
  the right edge, hover/focus-revealed (`opacity 0→1`) on pointer devices and
  always visible under `@media (hover: none)` for touch; the card reserves
  `padding-right: 40px` so neither the date nor the preview runs under the icon.
  Confirmation uses the existing modal `ConfirmDialog` (matching how larger
  deletes are confirmed) — "Delete this study?" with the reference label and a
  correctly-pluralized note count, `Cancel` (ghost, autofocused) / `Delete`
  (danger). Delete calls `BereanApi.deletePassageAll(passageId)` (cascade
  removes sessions/notes in both impls) and drops the row from local state on
  success rather than refetching; a failed delete leaves the dialog and row in
  place. Verified live on the memory stub (`.env` moved aside): the seeded
  "John 1:1-5" study's delete button renders with the right classes/aria, the
  dialog shows the correct copy + singular "1 note", confirming removes the row
  and reveals the empty state, and the button inherits the correct
  `--text-faint` icon color in dark mode. `tsc --noEmit` clean. UI-only — no
  schema/`BereanApi` change.

- **Design sweep closeout: note→study bridge in ChapterView, self-hosted
  scripture fonts, mobile nav priority decision.**
  - **Note→study "Open study" bridge in `BookDetailPage`'s ChapterView.**
    Note cards there previously only had Edit/Delete; `ReadingMode` already had
    a third "Open study" button (`onOpenStudy` → `App.tsx`'s
    `handleOpenStudy(passageId)`). `ChapterView` now has the same button,
    resolved per-note via a new `resolveNotePassageId` helper that reuses the
    existing `findOverlappingPassage` (already used by "Start study on {ref}"/
    "Study chapter") against `bookPassages` — no new matching logic. Threaded
    `onOpenStudy: (passageId: string) => void` through `ChapterViewProps` →
    `BookDetailPageProps` → `App.tsx` (`onOpenStudy={handleOpenStudy}`, same
    handler `ReadingMode` already uses). If a note's range doesn't overlap any
    known passage, the button is hidden rather than left as a dead click
    target. Verified live (memory stub, `.env` moved aside): clicking "Open
    study" on the seeded John 1:1 note correctly opens `StudyMode` on the
    existing "John 1:1-5" passage with its note loaded, both at desktop
    (1280px) and mobile (375px) widths. Build (`tsc --noEmit` + vite) clean.
  - **Self-hosted scripture fonts.** `index.html`'s Google Fonts `<link>` +
    preconnects for Source Serif 4 (400/500/600) and Newsreader (400/500) are
    gone, replaced with `@fontsource/source-serif-4` and `@fontsource/newsreader`
    (static per-weight CSS, only the weights `tokens.css` actually references),
    imported in `main.tsx`. Both packages register the same family names
    already used by `--scripture-font`, so `tokens.css` needed no changes — a
    variable-font (`@fontsource-variable/*`) alternative was tried first but
    registers under a different family name (`"Source Serif 4 Variable"`) and
    was dropped in favor of the static packages to avoid touching tokens.css.
    `vite.config.ts`'s PWA precache glob already included `woff2`, so no config
    change was needed — confirmed via `npm run build`, which emits the font
    files under `dist/assets/` and precaches them (36 entries). Georgia stays
    as the fallback for genuine load failures. Verified live: font requests
    resolve to `localhost` (not `fonts.googleapis.com`), and `.verse-text`'s
    computed `font-family` resolves to `"Source Serif 4"` in both light and
    dark mode.
  - **Mobile nav priority — closed as uniform-at-rest, deliberately.** Three
    distinct mechanisms were tried and reverted across earlier passes: accent
    color on the Study icon (read as "permanently selected"), a filled badge on
    Study (still read as "off"), and opacity de-emphasis on Journal/Profile via
    a `nav-tab-low` class (removed entirely). Rather than attempt a fourth
    treatment, the decision is that uniform-at-rest is fine: priority already
    shows up through real usage (Bible as the landing destination, Study
    reachable from several entry points — chapter button, verse selection,
    nav) without needing an icon-level cue that has three times now read as
    visual noise instead of signal. No further code change; this closes the
    item.

- **F4 — motion layer.** Entrance/press/spring micro-interactions built on
  `tokens.css`'s `--ease-*`/`--dur-*`/`--elev-*` scale, in a new
  `src/assets/motion.css` (imported last in `main.tsx`) so its additive
  `transform`/`animation` rules layer on existing hover-state rules without
  restating them. Pure CSS throughout — no animation library. Landed across
  several rounds of live-feedback iteration (the blow-by-blow is git history,
  not repeated here); what shipped:
  - **Where motion lives.** A shared tactile hover-lift/press-settle on every
    repeat-use clickable surface (book rows, search results, verse action
    buttons, nav tabs, the avatar, note cards, dialog/settings buttons). The
    quick-edit card (`QuickEditCard.tsx` — see below) and the verse-selection
    action bar spring in on open. The desktop search box
    (`.global-search--bar`) travels from its resting top-bar slot to a
    centered, page-dimmed command-palette position on focus, closes on a
    second "/" (which also clears the query), and supports arrow-key
    navigation + Enter through its results. Scripture (`ScriptureSkeleton.tsx`)
    and Journal show a shimmering placeholder instead of bare "Loading…"
    text, and scripture reveals top-down verse-by-verse once loaded
    (`--stagger-i`-keyed, capped so a 176-verse chapter doesn't cascade for
    seconds). The mobile study scripture panel's expand/collapse actually
    animates now and supports a manual drag-resize handle
    (`.study-resize-handle`) to any height, not just the two presets. Desktop
    nav has a measured sliding indicator between Bible/Journal
    (`.topnav-tab-indicator`, `NavBar.tsx`); Study is deliberately excluded
    from the slide (its own accent-filled active look doesn't compose with a
    shared highlight) and fades in/out at wherever the indicator last was
    instead. The app shell fades in once, calmly, at true boot only
    (`.topnav`/`.bottomnav`, plus Bible Library specifically since it's the
    default landing destination — gated by a module-level `hasBooted` flag
    in `BibleLibrary.tsx`, not timing-sensitive React state, so it can't be
    cut short by an unrelated re-render).
  - **Where motion deliberately does NOT live, and why.** Per-item stagger
    and entrance fades on Library/Journal content, and a fade on every
    tab-switch, were all tried and then removed. These are frequently
    revisited screens/actions (every tab switch, every drill-down back out
    of a book) — motion well-tuned for a first look still becomes friction
    once you're sitting through it dozens of times a session. The motion
    budget is spent on rare/one-time moments (app boot) and on motion that
    communicates an actual state change (quick-edit opening, verse
    selection, search), not on decorating a list simply appearing. Journal
    specifically also delays showing its loading skeleton at all for 150ms
    (`SKELETON_DELAY_MS` in `JournalPage.tsx`) — a fetch that resolves faster
    than that never shows a skeleton, avoiding the classic "flash of loading
    state" on the common fast path; only a genuinely slower load shows it.
  - **Reduced motion.** Every rule above lives inside
    `@media (prefers-reduced-motion: no-preference)`; a global kill-switch in
    `motion.css` (near-zero `animation`/`transition-duration`, not `none`, so
    `animationend`/`transitionend` still fire) is the backstop for anything
    not explicitly wrapped, including pre-existing animations that had no
    reduced-motion handling at all before this pass (confirm dialogs,
    Settings, What's New, the offline toast). `.upd-spinner` is exempt —
    it signals real async work, not decorative motion.
  - **Gotchas worth knowing before touching this file again:**
    - An element with an `animation` targeting `opacity`/`transform`
      establishes a CSS stacking context **permanently**, for as long as the
      rule matches — regardless of whether the animation has finished
      playing. `.topnav` learned this the hard way: its boot-fade trapped
      the search backdrop/popover and the profile/workspace dropdown menus
      (all `position: fixed`/`absolute` descendants nested inside it) into
      an undefined stacking position, silently painting them *below*
      `.main-area`'s later content regardless of their own `z-index`.
      Fixed by giving `.topnav` an explicit `position: relative; z-index:
      140`. If you add an animation to a new ancestor element, check what's
      nested inside it.
    - Giving an ancestor of a `position: fixed` element ANY `transform`
      value — even a no-op `translateY(0)`, even only for an animation's
      duration — establishes a new containing block for that descendant,
      repositioning it relative to the ancestor instead of the viewport.
      This is why `.topnav`'s boot animation is fade-only (no transform):
      `GlobalSearch`'s fixed-position box lives inside it.
    - A CSS animation's keyframe `transform` (e.g. `springIn`'s
      translateY/scale) permanently overrides any separately-cascaded static
      `transform` on the same property — so `left: 50%; transform:
      translateX(-50%)` centering tricks silently break on any element that
      also has an entrance animation touching `transform`. Center via
      `left: calc(50vw - half-width)` instead when both are needed.
    - Measuring an element's position/size for later use (`GlobalSearch`'s
      `--rest-*`, the desktop nav indicator) must happen in
      `useLayoutEffect`, not `useEffect` — the latter runs after the
      browser's first paint, so a CSS fallback value gets painted for one
      real frame and then visibly animates to the correct position once the
      effect catches up.
    - A custom property can't be reassigned in terms of itself on the same
      selector (`--scripture-size: calc(var(--scripture-size) * …)` is a
      self-reference cycle, invalid per spec) — `--text-scale` multiplies
      `--scripture-size` at the point of use (`.verse-text`) instead.
  - Also landed alongside the motion pass: a from-scratch quick-edit note UI
    (`QuickEditCard.tsx`, replacing a bare textarea + text-link buttons with
    a bordered card, category accent, and real labeled icon buttons, used
    for both creating and editing a note) with a matching inline delete
    confirmation (`InlineDeleteConfirm.tsx`, replacing a modal `ConfirmDialog`
    for this one case); a more prominent mobile search entry point in the
    Bible Library header for the "find a reference fast, mid-service" case;
    and a user-adjustable Settings "Scripture text size" picker
    (`useTextSize.ts`, mirroring `useTheme.ts`'s pattern) plus a ~10% mobile
    size reduction, since the desktop "hero" scripture size ate most of a
    375px line width.
  Verified live throughout (puppeteer-driven pointer sequences and
  computed-style/CSSOM inspection) at desktop and mobile widths, light +
  dark, across all 4 visual themes where relevant. Build
  (`tsc --noEmit` + vite) clean.

- **Library spacing correction, mobile nav priority reverted, mobile study
  empty-state.**
  - **Library grid was still cramped** after the max-content column fix — the
    real culprit turned out to be `row-gap: 1px` (rows nearly touching) plus
    tight `.bible-book-row` padding, not just the column gap. Row-gap raised to
    4px, row padding 5px/8px → 7px/10px, column gap 64px → 88px (a second, larger
    pass after 64px still read as tight).
  - **Mobile nav priority (opacity de-emphasis on Journal/Profile) reverted.**
    Didn't land as a good strategy on review — removed the `nav-tab-low` class
    and its CSS entirely. The underlying priority question (Bible = home,
    Journal = rare, Study = action) is unresolved and left for a fresh pass
    later rather than iterating further on this mechanism now.
  - **Mobile Study empty-state scripture panel.** Before any reference was
    committed, the pinned panel still reserved its full ~34vh peek height to
    show placeholder copy ("Type a reference...") that sat in a spot the user
    isn't actually meant to interact with — the real input is the reference
    field below. It now collapses to just the header bar
    (`.study-right--empty`, keyed off `!passage && !loadingPassage`) with the
    "Tap to expand" hint/chevron hidden (nothing to expand yet) and the
    toggle inert; it grows to the normal peek at the exact moment a reference
    loads, which is a direct, expected result of the user's own Enter press,
    not a surprise pop-in.
  - **"Press Enter or Tab..." hint is desktop-only copy now** — "or Tab" only
    makes sense with a physical keyboard. Split via `.hint-text-desktop`/
    `.hint-text-mobile` at the existing mobile breakpoint, mirroring how the
    rest of the app splits responsive copy (no UA sniffing).
  Verified live at 2000px and 390px: library spacing looks open rather than
  cramped, mobile nav is back to uniform weight across all four tabs, the
  empty scripture panel collapses correctly and expands the moment a valid
  reference loads. Build clean.

- **Mobile study editor, blank-save guard, existing-note timestamps, mobile
  nav priority.**
  - **Note editor's chip row no longer causes "moving dead space."** It was
    `position: sticky` inside `.notes-list`'s own scroll box — sticky only
    holds an element at an edge once scrolling would carry it past that edge,
    so with just a couple of short lines it sat in normal flow right after
    them, and the gap before the Save buttons changed size as you typed.
    Restructured `NoteEditor` to return the chip row as a true flex sibling of
    `.notes-list` (not its last scrolled child) — it now has a fixed position
    directly above `.study-actions`; the notes list scrolls independently in
    whatever space remains above it.
  - **Blank-study save guard.** Saving a brand-new study with a reference typed
    but zero real note lines silently created an empty `Passage`+`Session` — a
    dead Journal entry with nothing in it. Both Save buttons are now disabled
    (with an explanatory `title`) when there's no note content AND no
    `initialPassageId` — editing an *existing* study down to zero notes is left
    alone, since that's a legitimate delete-the-study action that should
    correctly cascade-delete the now-empty session/passage.
  - **Existing-note timestamps in the editor.** At scale, it's easy to lose
    track of what you just typed this session vs. what was already there. A
    note line now shows a subtle "saved Xh ago" (reusing the established
    `formatRelativeTime`/`.note-timestamp` pattern from `ReadingMode`'s note
    cards) — but ONLY while its content still exactly matches what's actually
    persisted; the moment you edit it, the stamp disappears, since showing
    "saved" on since-changed content would be misleading. Its *absence* is
    itself the "new or changed this session" signal. `NoteEditor` gained an
    `existingNotes` prop (the same `Map<string, Note>` `StudyMode` already
    hydrates from).
  - **Library grid gap widened** (40px → 64px) — tighter, content-hugging
    columns (from the earlier max-content fix) needed more breathing room
    between them or adjacent names read as cramped.
  - **Mobile nav: reverted the Study icon to a plain line icon**, matching
    Bible/Journal/Profile's style. Two prior special treatments (accent color,
    then a filled badge) both still read as "off" — an odd-one-out among
    otherwise-consistent icons draws the eye for the wrong reason, and kept
    causing more issues than it solved. Priority is now communicated by
    opacity alone: Bible stays full weight (the "does everything" home); Journal
    joins Profile at `opacity: 0.72` at rest (both visited rarely, per
    discussion), returning to full weight when actually active — same
    established mechanism, no new visual language.
  Build (`tsc --noEmit` + vite) clean throughout; verified live at 2000px and
  390px, light + dark — including the overlap-matched existing-note timestamp
  showing correctly and disappearing on edit, and the disabled Save state.

- **Start-study overlap matching + a round of mobile/library follow-up fixes.**
  - **"Start study on {ref}" / "Study chapter" now reopen an existing passage**
    when one overlaps the selected verses, instead of always starting blank.
    `BookDetailPage` now loads `getPassagesByBook` alongside notes
    (`bookPassages`, threaded into `ChapterView`); a new
    `findOverlappingPassage` (interval overlap, not exact-range match — a note
    anchored anywhere inside the selection should surface, per discussion) finds
    a match, and its own `reference_label` (not the freshly-dragged selection)
    is passed alongside `passageId` so `StudyMode` — which only ever reads the
    reference from the passage-id fetch once one is set — doesn't race between
    two different scripture ranges. Verified live: selecting verses inside the
    seeded "John 1:1-5" passage reopens it with its existing note loaded;
    selecting outside it still starts blank. `onStudy`/`onStudyChapter` signatures
    threaded an optional `passageId` from `ChapterView` → `BookDetailPage` →
    `App.tsx`'s existing `handleStudyFromReading(reference, passageId?)`. Also
    unblocks most of the "Note→study bridge in ChapterView" deferred item (see
    Deferred) — the passage data it needed is now loaded.
  - **Library grid: content-hugging columns.** Fixed-width columns
    (`minmax(0, 230px)`) were still wider than most book names, so the
    left-aligned text's per-column trailing whitespace dragged the grid's visual
    center left of its geometric one (~120px off on a wide screen). Switched to
    `minmax(0, max-content)` so each column shrinks to its own longest name;
    measured text-mass center is now within 6px of true center (was ~120px).
  - **Mobile top-bar search icon was rendering dead-center**, not right-aligned.
    Root cause: `.topnav-tabs` is `display:none` on mobile, and CSS Grid removes
    `display:none` items from the grid entirely — auto-placement then packed the
    remaining visible children (`.topnav-lead`, `.topnav-right`) into columns 1
    and 2 of the `1fr auto 1fr` template instead of 1 and 3. Fixed by giving each
    child an explicit `grid-column`, confirmed via `getBoundingClientRect` (the
    middle "auto" track measured exactly 34px — the button's own width — before
    the fix).
  - **Mobile "+ Study" tab redesigned.** The badge was accent-colored, which is
    also this app's "active/selected" language everywhere else, so it looked
    permanently "selected" regardless of which tab was actually active — a
    second correction after the first pass (which only fixed a doubled "+" and
    moved the color from label to icon, not the underlying color-reuse problem).
    Now differentiated by SHAPE (a filled neutral-ink circle, fixed colors not
    `currentColor`) instead of color, so "this is the compose action" and "this
    is the current page" stay two independent signals; the label follows the
    exact same muted/accent active-state rule as its siblings. Mobile label
    changed to plain "Study" (the badge already carries the "+"); desktop's
    text-only "+ Study" pill is unaffected. Profile — the lowest-priority of the
    four mobile tabs (an occasional account destination, not primary content or
    the primary action) — now sits at `opacity: 0.72` at rest, full weight when
    actually active.
  - **StudyMode passage-pane empty-state copy** said "Type a reference above,"
    which was directionally wrong on desktop (the field is beside the pane, not
    above it) and backwards on mobile (the pinned scripture panel sits ABOVE the
    reference field). Reworded to drop the directional claim.
  - **Mobile note editor had an oversized reserved bottom padding** (180px) on
    `.notes-list`, inherited from before the app had dynamic keyboard-aware
    scrolling (`scrollLineIntoView`'s `keyboardAware` mode, `NoteEditor.tsx`,
    already handles actual keyboard-open clearance via `visualViewport`) — with
    only a line or two of notes typed, that static reservation read as "the
    note box is tiny" above a large dead gap. Trimmed to 64px.
  - **Verse-tag auto-scroll in the passage pane.** Tagging `vN` in a note now
    scrolls that verse into view within the (often bounded/collapsed-on-mobile)
    scripture panel if it's out of view — `data-verse` attributes on
    `PassagePane`'s rows, `scrollIntoView({block:'nearest'})` scoped to the
    panel's own scroll container (never scrolls the whole page), triggered from
    `StudyMode`'s existing `handleCursorLine`.
  Build (`tsc --noEmit` + vite) clean throughout; verified live at 2000px and
  390px, light + dark.

- **Top-bar true centering + search/mobile-nav polish.** Fixed a real
  centering bug: `.topnav-tabs` used `flex:1; justify-content:center`, which
  centers tabs in the *leftover space* between the logo (left) and
  search-box+avatar (right) — correct only if both sides are equal width.
  They weren't (search box + avatar > logo), so the tabs sat visibly left of
  the true viewport center, exactly as flagged from a live screenshot. Fixed
  by switching `.topnav` to `display:grid; grid-template-columns: 1fr auto
  1fr` and grouping the search box/button + avatar into one `.topnav-right`
  wrapper (new, in `NavBar.tsx`) so the two outer columns are forced equal —
  tabs now land within 0.01px of true center (verified via
  `getBoundingClientRect`), independent of the two sides' own content width.
  Alongside that:
  - **"/" search shortcut** (desktop top-bar only): `GlobalSearch` listens for
    `/` on `window` and focuses its input, ignoring it while already inside an
    editable field (input/textarea/select/contenteditable) or with a modifier
    held. A `/` `<kbd>` hint renders in the box at rest (hidden once there's a
    query) signaling the shortcut, Notion/Linear/GitHub-style. The always-on
    desktop search box also got a touch more visual weight (`--elev-1`
    resting shadow) — deliberately NOT promoted to a hero/landing element
    (see discussion: a study app's front door should invite reading, not
    priming lookup-and-leave search-engine behavior — the Bible library stays
    the deliberate landing surface).
  - **Mobile search button visibility.** It was `background: transparent`
    sitting on the header's own `--surface-2` background, so it visually
    disappeared into its own container — the literal cause of "hard to
    notice." Given a distinct `--surface` fill, hairline border, and resting
    shadow so it reads as a real tappable chip.
  - **Mobile "+ Study" tab.** The `nav-tab-action` class was already applied
    (shared `navTab()` helper) but had no bottom-nav-scoped styling. Added a
    light-touch treatment — permanently accent-tinted icon/label + slightly
    bolder label — at the *same* size/shape/position as the other three tabs
    (still one of four equal `flex:1` columns, no pill or badge), so it
    signals "this one's an action" without breaking the bottom bar's visual
    rhythm the way the desktop pill treatment would have.
  - **Font-size bump.** Top-bar nav tabs 13→14px, library/book-detail page
    titles 22→24px, library book names 14→15px, per a legibility pass against
    a real desktop screenshot.
  Verified live at 2000px and 390px, light + dark. Build clean. No
  schema/`BereanApi` change.

- **Page-shell centering on wide viewports (two passes).** The Bible Library and
  the book/chapter view (`BookDetailPage`) had no max-width, so on wide monitors
  their content pinned to the left edge with a large dead right margin. First
  pass added a shared `--shell-max` token (`tokens.css`) and centered
  (`max-width` + `margin: 0 auto`) the library header/testament sections and
  `BookDetailPage`'s header + chapter-pill row (new `.book-detail-header-inner` /
  `.chapter-selector-wrap-inner` wrapper elements so section-divider borders
  stay full-bleed while their content centers) — initially at 1180px, on the
  theory of a wide "masthead" over a narrower reading column. **Live feedback
  correction:** that still looked off — a left-aligned block (page title, a
  pill row, a grid) inside an *overly wide* centered box still reads as
  left-anchored, because the eye tracks the ragged content edge, not the
  invisible box; centering the container without the content filling it just
  relocates the dead space rather than removing the asymmetry. Fixed by
  shrinking `--shell-max` to 920px (a snug column, Notion/Basecamp-style,
  rather than a separate wide masthead width) and adding
  `justify-content: center` to the chapter-pill row specifically, since a short
  pill cluster (e.g. a 21-chapter book) is much narrower than even a 920px box
  and otherwise clusters left within it — verified this doesn't break the
  horizontal-scroll case for long books (Psalms, 150 chapters). The with-rail
  reading-column widths (`.book-chapter-content`, `.reading-content` when a
  margin rail is present) were also pulled in from 980px/1020px to 940px so
  they don't exceed the shell. Also tokenized two inline-style color literals
  found in `BookDetailPage.tsx` (`#7F77DD`→`var(--accent)`,
  `#BBB`→`var(--text-faint)`) missed by the earlier CSS-only migration since
  they lived in TSX, not a stylesheet. **Third correction:** the library grid
  itself still read left-skewed after the shell fix, because
  `.bible-books-grid` used `repeat(3, 1fr)` — equal-fraction columns much wider
  than the (short, left-aligned) book names, so each column's visual "ink"
  clustered toward its own left edge with a large empty trailing gap, worst in
  the rightmost column. The section box was centered, but its content wasn't,
  so the block still read left-heavy. Fixed by sizing columns to content
  (`repeat(3, minmax(0, 230px))`) and centering the column group itself
  (`justify-content: center`) — the "OLD/NEW TESTAMENT" divider stays at the
  shared shell width above it, while the names now form a tighter, genuinely
  centered block within it. No wrapping on the longest names (Song of Solomon,
  1/2 Thessalonians) at this column width. **Fourth correction:** that still
  left the "OLD/NEW TESTAMENT" label (and its divider rule) at the wider shell
  width while the grid beneath had become narrower, so the label no longer
  lined up with "Genesis" underneath it — the same mismatch one layer up.
  Rather than keep two different widths in play, gave the library page its own
  snug content width computed directly from the grid's own sizing
  (`--library-content-w: calc(3 * --library-col-w + 2 * --library-col-gap)`,
  scoped as CSS custom properties on `.bible-library`) and applied it to the
  header, testament label, and grid alike — one consistent, aligned column, not
  the shared (wider) `--shell-max` used by `BookDetailPage`. Verified live at
  2000px, light + dark: "OLD TESTAMENT" and "Genesis" now share the same left
  edge, the divider matches the grid's width exactly.

- **Theme picker in Settings.** Users can now choose a visual theme independent of
  light/dark mode: **Berean** (default, warm cream + indigo), **Scholarly Serif**
  (paper-white, quiet), **Warm Paper** (cream + amber, Newsreader scripture), and
  **Quiet Modern** (cool near-white, sans-serif scripture — the one direction that
  deliberately doesn't use a serif reading face). `src/utils/useTheme.ts` (mirrors
  `useDarkMode.ts`'s pattern) sets `data-theme` on `<html>` and persists to
  localStorage (`berean-visual-theme`, independent of the existing `berean-theme`
  light/dark key). `tokens.css` gained `[data-theme="…"]` light blocks plus dark
  variants scoped as `html[data-theme="x"] body.dark` — a descendant selector that
  out-specifies the generic Berean-dark `body.dark` block with no `!important`, so
  light/dark and theme compose correctly in all 8 combinations. `SettingsModal`
  renders a 4-row swatch picker (each row previews its *own* theme's canvas/accent
  colors so all four are comparable regardless of which is active), threaded through
  `App.tsx` alongside the existing dark-mode toggle. Newsreader font added to
  `index.html` alongside Source Serif 4 (Warm Paper needs it). Verified live:
  switching themes re-themes the whole app instantly, persists across reload, and
  each theme × dark mode renders correctly with no cross-theme color bleed. Build
  clean. No schema/`BereanApi` change.

- **Design-token layer (F1 — foundation of the visual polish pass).** Introduced
  `src/assets/tokens.css` (imported first in `main.tsx`, before `main.css`/`dark.css`)
  as the single source of truth for color, elevation, spacing, radii, motion, and
  scripture type. `:root` holds the research-backed **"Berean"** default — a warm
  cream reading canvas (`--bg #f4f0e8`), near-white surfaces, indigo accent
  (`--accent #6b62d6`, decoupled from the warm canvas because amber reads as
  "warning" as a primary UI accent), the four note-category hues, a soft layered
  `--elev-*` scale, and `--ease-*`/`--dur-*` motion tokens. `main.css`'s raw color
  literals for the **unambiguous** families were rewired to `var()`: accent + tints,
  category colors, page backgrounds (`#fafafa`/`#f7f6f3`→`--bg`), subtle fills
  (→`--surface-2`), borders (→`--border`), and primary ink (`#1a1a1a`→`--text`).
  Deliberately **left as literals for later** (see Deferred): `#fff` (contextual) and
  the gray-text ramp, plus the legacy `.welcome-*` navy (frozen desktop screen).
  `body.dark` reassigns the tokens to values **matching the app's existing cool dark
  palette**, so dark mode is unchanged by F1 while light mode adopts the cream+indigo
  canvas; the warm-tinted Berean dark + `dark.css` collapse is the deferred F1b step.
  A `[data-theme]` seam is documented in `tokens.css` for the future Settings theme
  picker. Direction chosen from `design/mockup.html` (a throwaway token-swap artifact
  comparing four directions), backed by reading-UX/color-psychology research. Build
  (`tsc --noEmit` + vite) clean; verified live in a real browser at 1280px, light +
  dark, on the reader/library/study surfaces — `--bg` resolves to `#f4f0e8`, accent
  to `#6b62d6`, dark mode visually identical to pre-F1. No schema/`BereanApi`/
  component change — CSS-only.

- **Post-sweep fixes: action-bar contrast bug + wider reading column.** Live
  testing caught a migration bug: `.verse-action-btn` ("Start study on {ref}")
  had `color: var(--surface-2)` — text mistakenly mapped to a background token,
  rendering it near-invisible (light-on-light) in the verse-selection floating
  bar. Fixed to `var(--text)` on a `var(--surface-2)` fill, plus tokenized the
  bar's remaining literals (`--border`, `--elev-3`). Swept `main.css`/`dark.css`
  for the same `color: var(--surface*)` pattern — no other instances. Also
  widened the desktop reading column (`.reading-content` 680→760px,
  `.book-chapter-content` 640→720px, their no-rail-widened variants +40px each)
  per feedback that scripture felt narrow on desktop. Verified live, light +
  dark; build clean.

- **Design polish sweep (F2/F3/#4/#6/F1b — static pass on the F1 token layer).**
  The visual/interaction quality pass on top of the token layer, everything up to
  (but not including) the F4 motion pass:
  1. **F2 reading typography.** Scripture is now the hero: `.verse-text` (shared by
     `ChapterView`, `ReadingMode`, and the StudyMode passage pane) renders in the
     serif reading voice (`--scripture-font` Source Serif 4, ~19px, `--scripture-lh`
     1.72) in **primary ink** — previously it was 13px sans in `--text-muted`, dimmer
     and smaller than the UI chrome. Verse numbers baseline-align as small print-style
     markers. Passage pane dialed to 16.5px. Font loaded in `index.html` (Georgia
     fallback; self-host backlogged).
  2. **Note-card weight (#4).** Inline notes went from a filled gray box to a
     transparent, category-ruled **annotation** (left border + label + verse chip),
     so notes read as marginalia against the Word. Reader column centering (`.no-rail`)
     was already correct.
  3. **Full color tokenization (F3 groundwork).** `main.css` + `dark.css` raw hex
     migrated to `var()` — including the `#fff` (contextual surface vs on-accent) and
     gray-ramp cases F1 had deferred. Every `var()` resolves to a `tokens.css` token;
     build + undefined-token checks clean.
  4. **F3 contrast.** `--text-muted` darkened to ~4.8:1 on cream (was ~3.8:1, below
     AA); **library book names** promoted from `--text-muted` to primary `--text`
     (they were ghosted). Added a UI **type scale** (`--text-xs…2xl`) to `tokens.css`.
  5. **UX (#6).** `+ Study` is now a distinct accent **action pill** (via a
     `nav-tab-action` class) rather than looking like a third destination tab; the
     `?` top-right is the account-menu avatar (placeholder initial in the stub), left
     as-is.
  6. **F1b warm dark.** `body.dark` tokens flipped to the warm-tinted Berean dark;
     the remaining legacy cool dark literals in `main.css` `body.dark` chrome blocks
     (nav menu, settings modal, toasts) tokenized so dark mode is cohesively warm with
     no cool/warm clash. `dark.css` was already fully token-driven.
  Frozen `.welcome-*` navy and the danger/amber-alert schemes left as literals
  (no semantic token yet). Build (`tsc --noEmit` + vite) clean throughout; verified
  live at 1280px on reader/library/study/settings, **light + dark**. CSS/token +
  one NavBar class + `index.html` font link; no schema/`BereanApi`/data change.
  Direction from `design/mockup.html` (throwaway compare-artifact) + reading-UX/
  color research. Remaining design work (F4 motion, font self-host, theme picker)
  is in Deferred.

- **Reading-view interaction hardening.** Five fixes to the study-Bible reading
  layout (`BookDetailPage` ChapterView + `ReadingMode`), from live testing across
  three commits (`30854f2`, `18573dc`, `de054fd`):
  1. Range-note rail brackets now span their full verse range — the `.rail-note`
     grid item fills its `grid-row` span via `align-self: stretch` (the grid's
     `align-items: start` had shrunk it to content height, so the bracket only
     covered the note text).
  2. Overlapping range notes get side-by-side lanes via greedy interval coloring
     (`assignRailLanes`, `LANE_STEP`).
  3. Note-highlight (`highlightedVerses`/`highlightedNoteIds`) and range
     selection (`selAnchor`/`selFocus`) are mutually exclusive and fully
     clearable — a plain click on empty scripture whitespace and Escape both
     clear everything, and the stale `onMouseEnter` hover-highlight was removed.
  4. The marquee drag origin moved twice: first from `.scripture-grid` to the
     centered reading column (`30854f2`), then to the full-width surface around
     it — `.reading-layout` in `ReadingMode`, a new `.chapter-marquee-surface`
     wrapper in `ChapterView` (`18573dc`) — so a drag can start in the side
     margins outside the centered column, not just inside it.
  5. The marquee hit-test now requires the drag box to overlap a verse row on
     BOTH axes, not just vertically (`de054fd`) — previously a box drawn
     entirely in the side whitespace, at the same height as some verses but
     never crossing their text, still selected them, because verses were
     effectively treated as spanning the full width. `hitTest` now also checks
     horizontal overlap and clears the selection when the box hits no rows.
  Also (`de054fd`): mobile range notes (no rail there) now render inline right
  after their LAST anchored verse instead of stacking at the bottom of the whole
  chapter — `.mobile-range-notes` replaces the old bottom `.mobile-note-stack`,
  keyed per-verse via `mobileRangeByVerse`, styled light + dark. Build/test/lint
  clean; verified live in a real browser (puppeteer-driven pointer sequences,
  not synthetic `dispatchEvent` alone) at both desktop and 390px, light + dark,
  on both surfaces.

- **Marquee (box) verse selection (desktop).** Replaces the earlier
  gutter-only click-drag (retired `useVerseDragSelect`) with a Windows-style
  marquee: `useVerseMarquee` (`src/utils/useVerseMarquee.ts`), used by both
  `ReadingMode` and `BookDetailPage`'s ChapterView, without touching
  `selAnchor`/`selFocus` ownership (the hook only calls back into it).
  `onPointerDown` on the `.scripture-grid` container begins a drag *unless* it
  lands on an interactive child (`button, a, input, textarea, [contenteditable],
  [data-no-drag]`); it tracks a rectangle from the start point to the current
  pointer, renders a subtle accent-tinted overlay (`.verse-marquee`, dark-mode
  variant in `dark.css`), and hit-tests every registered verse row via
  `verseRowRefs` — any row whose `getBoundingClientRect` overlaps the box
  vertically is selected, and `min..max` of those verse numbers drives the same
  selection state as the tap gesture, so the floating action bar ("Quick note"
  primary / "Start study on {ref}") appears and works unchanged. On `pointerup`
  the overlay is removed and the range is committed. **Tradeoff (user-chosen):**
  click-drag over verse text now marquee-selects instead of doing native
  text-copy; native selection is suppressed for the duration of a drag
  (`document.body` `user-select: none`, restored on release) and the initiating
  `pointerdown` is `preventDefault`ed. A modifier-to-copy escape hatch is
  backlogged (see Deferred). **Stale-state guards** (learned from the prior
  gutter-drag "selection drops to 0" bug): per-gesture refs
  (`dragMoved`/`justDragged`/rects) reset at the START of every `pointerdown` so
  nothing leaks across gestures; a small `DRAG_THRESHOLD` keeps an accidental
  micro-move from being read as a drag (so a plain click still falls through to
  tap-anchor/tap-extend); `suppressNextClick()` is a one-shot consume that
  swallows exactly the one trailing `click` a real drag emits (whichever element
  it lands on) so a stray post-drag click can never clear the just-made range.
  Touch (`pointerType === 'touch'`) and non-primary buttons are ignored — the
  tap gesture is untouched. Listeners are window-scoped and cleaned up on
  unmount; `pointercancel` ends the drag like `pointerup`. Verified against a
  manually-started `vite --port 5238 --strictPort` (with `.env` moved aside per
  the memory-stub convention) at 1280px (light + dark) and 390px, driving a real
  pointer sequence through the actual verse elements on BOTH surfaces: a visible
  box appears, the covered verses select, the action bar shows the correct
  `{ref}` (e.g. `John 3:1-4`, `John 3:3-5`), a plain tap immediately after a
  marquee correctly extends the range (no stale suppression), and a
  single-verse-only chapter shows `.scripture-grid.no-rail` (centered column,
  no rail). No schema or `BereanApi` change.

- **Note placement by anchor width (inline vs rail).** Refinement of the margin/
  span-notes layout below, from live user testing: verse-anchored notes are now
  split by how many verses they span. **Single-verse notes** (`anchor_start_verse
  === anchor_end_verse`, or `anchor_end_verse` null) render **inline beneath their
  verse row** (an `.inline-verse-notes` group in the scripture column), with their
  indented sub-notes inline too — the way inline notes read before the
  margin-rail change. **Multi-verse range notes** (`anchor_end_verse >
  anchor_start_verse`) keep the right-hand rail with the category bracket spanning
  the anchored rows (the grid-row mechanism below). **Anchorless notes** stay
  passage-level (top block, never bracketed). The **rail only appears when there
  is at least one range or passage-level note** (`hasRail`); if every note is
  single-verse (or there are none) the `.scripture-grid.no-rail` path collapses
  the margin column and the scripture column centers as a block. On mobile,
  single-verse notes stay inline under the verse and only range notes appear in
  the stacked list (bracket + `vv.x-y` chip). Applied to BOTH ChapterView and
  ReadingMode; all prior behaviours (category pills/labels, timestamps, the
  note→study bridge, quick-note creation, cross-ref pills, bidirectional
  hover/click highlight, dark mode) preserved. Verified with a real pointer drive
  at 1280px + 390px, light + dark. No schema or `BereanApi` change.

- **Margin / span notes.** Both reading surfaces — `ReadingMode` (saved-passage
  reader) and `BookDetailPage`'s ChapterView (Bible-home chapter reader) — now
  render verse-anchored notes as a study-Bible layout. (Superseded in part by the
  inline-vs-rail split above: single-verse notes moved back inline; the rail is
  range/passage notes only.) **Desktop (>768px):** a
  two-column CSS grid (`.scripture-grid`) — scripture in column 1, a 260px margin
  rail in column 2. Each verse row is placed on an explicit numeric grid row
  (`gridRow: index+1`, assigned in JSX); a rail note anchored to `[start..end]` is
  placed at `grid-row: startRow / endRow+1`, so its accent bracket (`.rail-bracket`,
  category-coloured) spans EXACTLY the anchored verse rows — a single-verse note
  brackets one row, a v4-15 note brackets that whole span. **Numeric grid-row
  placement was chosen over DOM-offset measurement** because it is declarative and
  reflow-proof: it survives font-size/zoom/wrap changes with no ResizeObserver and
  no measurement race (commented at the `.scripture-grid` CSS block and at both
  components' row-map). **Mobile (<=768px):** the grid collapses to a single column
  (`display:block`); each spanned verse row carries a `.verse-span-bracket` accent
  indicator, and anchored notes render in a stacked list (`.mobile-note-stack`,
  desktop-hidden) each with a `.note-range-chip` ("v4" / "vv.4-15") that scrolls to
  the anchored verse row (ref-map linkage). **Anchorless notes** (`anchor_start_verse
  === null`) are handled as passage-level notes: rendered in a `.rail-passage-notes`
  block above the grid (a "Passage notes" label), never bracketed. Highlight linkage
  is preserved and bidirectional: hovering/clicking a rail note highlights its verses
  (`onMouseEnter`/`handleNoteClick` → `highlightVersesForNote`) and clicking a verse
  highlights its notes. **Centered passage column:** the scripture column is centered
  as a block with a comfortable reading measure while verse *text* stays left-aligned
  — `.reading-content`/`.book-chapter-content` get `margin: 0 auto` (widened via
  `:has(.scripture-grid)` when a rail is present), and `PassagePane` gained a
  `.passage-pane-col` centered wrapper for the StudyMode passage pane; mobile stays
  full-width. All existing behaviours preserved: the note→study bridge (Edit note
  primary / Open study / Delete), quick-note creation, category pills/colours, subtle
  timestamps, verse-range selection + floating action bar, cross-ref pills, dark mode
  (rail brackets/chips themed in `dark.css`). Pure re-presentation — no schema,
  `BereanApi`, or note-data change; reused the existing anchors. Verified with
  puppeteer at 1280px and 390px, light + dark: desktop rail with a correctly
  3-row-spanning v2-4 bracket, mobile bracket + "vv.2-4" chip, centered column,
  bidirectional hover/click highlight, and the bridge actions intact on both
  surfaces. NOTE for the drag-to-select workstream: the desktop grid changed the
  verse-row DOM (rows are now `.scripture-grid > .reading-verse-block` grid items
  with an inline `gridRow` style, and each row registers a `verseRowRefs` entry and
  may contain a `.verse-span-bracket` child) — verse-selection creation logic
  (`handleVerseClick`/`selAnchor`/`selFocus`) was left untouched, but any drag
  handler must account for the new grid wrapper and the bracket child element.

- **Search breadth in the scripture section (Studies & Notes model,
  workstream 3).** `parseScriptureQuery` (`src/utils/noteParser.ts`) now
  returns `ScriptureQuery[]` instead of a single-or-null result, so early and
  partial queries surface jump targets instead of nothing: a bare book name or
  unambiguous prefix ("matthew", "matt", "rom", "1 cor") yields a single
  book-level result (`kind: 'book'`, chapter 1, verse null); "book + chapter"
  and "book + chapter:verse" keep returning exactly one result as before
  (`kind: 'chapter'` / `'verse'`); an ambiguous prefix ("j", "jo") yields up to
  `MAX_SCRIPTURE_RESULTS` (5) ranked results via a new `rankBookCandidates`
  helper — exact alias match first, then startsWith, then contains, ties
  broken by canonical `BIBLE_BOOKS` (USFM) order. No new alias table; reuses
  `findBookByAlias`/`BIBLE_BOOKS` from `bibleBooks.ts` entirely. `GlobalSearch`
  (`src/components/GlobalSearch.tsx`) renders the scripture section as a list
  (0..N results, "Open book" vs "Open chapter" label per kind) instead of a
  single button; the notes section (independent debounced `searchNotes` call)
  is untouched and still populates on its own. No schema or `BereanApi`
  change — pure client-side parsing. Test coverage extended in
  `noteParser.test.ts` for bare book, unambiguous prefix, ambiguous prefix
  (ordering + cap), book+chapter, book+chapter:verse, and empty/garbage query.
  Verse-text search remains out of scope/backlogged (see below).

- **One selection gesture + notes-as-front-door (Studies & Notes model,
  workstream 2).** In `BookDetailPage`'s ChapterView (the Bible home reader),
  the standalone per-verse "+" quick-note button is gone — verse selection is
  now the single gesture. Tapping a verse selects it and the floating action
  bar (already existing from the UX-overhaul verse-range work) appears
  immediately, even for a single verse, since `selAnchor`/`selFocus` are both
  set on the first tap. The bar's button order/emphasis flipped: **Quick note**
  is now the primary (`.verse-action-btn.primary`, filled accent) button and
  **"Start study on {ref}"** is secondary — same underlying handlers
  (`handleQuickNoteFromSelection` / `handleStartStudyOnSelection`), only the
  visual weight and DOM order changed. Verse numbers (`.verse-number`) gained a
  tappable affordance: an accent tint on `.reading-verse-row:hover`/`:active`/
  `.selected`, in both `main.css` and `dark.css` — CSS-only, no new state. In
  `ReadingMode` (the saved-passage bridge), the note action row reordered/
  re-emphasised: **inline quick-edit (pencil) is now visually primary**
  (`.se-icon-btn.se-icon-primary`, accent-tinted at rest, not just on hover) and
  listed first; **"Open study" is now unconditional** (`onOpenStudy` changed
  from optional to a required prop — `ReadingMode` is only ever rendered from
  `App.tsx` where it's always supplied via `handleOpenStudy`, so this is a type
  tightening, not a behavior change) and always shown between Edit and Delete.
  No schema or `BereanApi` change; reused all existing methods and the WS1
  `handleOpenStudy` path. Verified with puppeteer at 390px/1280px, light+dark:
  single-verse tap shows the bar with Quick note emphasised, range-extend
  updates the {ref} label live, Quick note creates a verse-anchored note,
  Start study opens `StudyMode` on the exact range, and the reading-view bridge
  correctly opens the existing passage (no duplicate) via Open study.

- **Search v1 (UX overhaul, workstream 6).** One search box with two
  independently-populating result sections. Section 1 (scripture reference) is a
  pure client-side parse — `parseScriptureQuery` in `src/utils/noteParser.ts`
  reuses the book-alias table (`findBookByAlias`) to turn "mat 2:13" / "john 1" /
  "1 cor 13:4" into a `{ bookNumber, bookName, chapter, verse }` jump target
  (chapter clamped to the book's real count). Bare book names/prefixes and
  ambiguous-prefix multi-result ranking were added later in workstream 3 above
  — see that entry for the current `ScriptureQuery[]` shape.
  Clicking navigates the Bible view to that book+chapter (App gained a
  `selectedChapter` and `handleJumpToChapter`; `BookDetailPage` gained an
  `initialChapter` prop). Section 2 (notes) is an additive `BereanApi.searchNotes`
  method — case-insensitive substring over note content, implemented in BOTH
  `memory.ts` (workspace scan) and `berean-api.ts` (SupabaseBereanApi: `ilike`
  joined notes→sessions→passages, workspace-filtered, newest-first, limit 50);
  clicking opens the study in context via `handleOpenStudy`. The
  `GlobalSearch` component (`src/components/GlobalSearch.tsx`) renders as a top-bar
  popover on desktop (`variant="bar"`) and a dedicated full-screen surface on
  mobile (`variant="surface"`, opened from a top-bar search button since the
  desktop box is hidden under 768px). The two sections are decoupled — section 1
  is a synchronous `useMemo`, section 2 an independently-resolving debounced
  effect — so neither blocks the other and a future staggered-populate animation
  can key off each mounting on its own (structure only; no motion yet). Test
  coverage: `parseScriptureQuery` cases added to `noteParser.test.ts`. No schema
  change. Scripture verse-text search and a Postgres FTS index for note search are
  backlogged above.

- **Mobile study layout (UX overhaul, workstream 5).** On mobile (<=768px) the
  scripture pane is now a pinned, collapsible panel at the TOP of the study view
  (`StudyMode`): it peeks (~34vh) by default and expands (~62vh) on tapping its
  header, which shows the loaded reference + a chevron. It scrolls internally and
  never scrolls fully off-screen; notes render below it and scroll independently.
  Achieved with CSS only (flex `order: -1`, bounded `max-height`, a
  `.study-scripture-body` wrapper that is `display: contents` on desktop so the
  side-by-side layout is untouched) plus one `scriptureExpanded` state + toggle
  header in `StudyMode`. Desktop side-by-side (`.study-left`/`.study-right`) is
  unchanged (toggle hidden). Caret-visible-above-keyboard: `NoteEditor`'s
  `scrollLineIntoView` gained a `keyboardAware` mode that clamps the effective
  container bottom to `visualViewport.offsetTop + height`; a `visualViewport`
  resize/scroll listener (keyed to the focused line) and the input handler re-run
  it so the caret stays above the soft keyboard as lines wrap/add. No-op where the
  API is absent (desktop). Add-on: an extremely subtle note timestamp
  (`.note-timestamp`, muted 10px, trailing edge) rendered on note cards in
  `ReadingMode` and `SessionEditor` via a shared `formatRelativeTime` helper
  (`src/utils/relativeTime.ts`), using `updated_at` (falling back to
  `created_at`). No schema or `BereanApi` changes. NOTE for future: timestamps are
  intentionally NOT shown on the ephemeral `NoteEditor` editing lines (those rows
  carry no persisted timestamp) — only on rendered/persisted note cards.

- **Editor behaviors (UX overhaul, workstream 4).** Reference field commits on
  Enter/Tab and moves focus to the first note line *immediately* (synchronous —
  never on the async verse fetch); parse failure keeps focus in the field and
  shows an inline error; `enterKeyHint="go"` for mobile. `ReferenceInput.onSubmit`
  now returns a boolean so the field can decide focus-vs-error, and `StudyMode`
  bumps a `focusNonce` prop the `NoteEditor` watches to imperatively focus the
  target line. Outdent rules in `NoteEditor` keydown: Enter on an empty bullet at
  indent > 0 outdents in place (keeps the bullet, no new line); Enter on an empty
  level-0 bullet is a no-op; Backspace at the start of an empty indented bullet
  also outdents; Shift+Tab unchanged. The keydown *decisions* were extracted to a
  pure module (`src/utils/noteKeydown.ts`) so they're unit-testable without a
  contenteditable — tag parsing stayed in `noteParser.ts`, layers kept separate.
  Tag discoverability (all passive): every empty note line shows the placeholder
  "Type your note — @ for a category, v4 to tag verse 4"; recognized tags render
  as pills as parsed (already the case); a one-time first-use hint popover fires
  on first note-line focus (localStorage flag `berean.noteHintSeen`); a mobile
  chip row above the keyboard offers tap-to-insert for verse/category tags (same
  data model, input method only — desktop hides it). Test infra added: Vitest
  (`npm test` → `vitest run`), covering the keydown decisions and a regression
  pin on `@`-tag + verse parsing. No schema or `BereanApi` changes.

- **Study entry points + verse-range selection (UX overhaul, workstream 3).**
  Renamed Capture→Study across UI copy and code (`CaptureMode`→`StudyMode`
  component/handle, App state `capture*`→`study*`, `.capture-*` CSS →
  `.study-*`, `btn-capture-chapter`→`btn-study-chapter`, Onboarding "Study
  mode", chapter button "Study chapter"). Three convergent entry points to the
  same `StudyMode`: blank from the nav, prefilled from the current chapter
  ("Study chapter"), and verse-range selection in the Bible chapter reader
  (`BookDetailPage` ChapterView) — tap a verse to start, tap another to extend,
  a floating action bar offers "Start study on {ref}" (prefills StudyMode with
  the exact range) and "Quick note" (opens the inline note input prefilled with
  the verse-range tag). Quick note reuses the existing session+note flow — no
  schema or `BereanApi` change. The floating bar clears via its × or by tapping
  the sole selected verse again; on mobile it floats above the bottom tab bar. Journal is a
  browseable index of studies grouped by book (newest first within a group;
  reference, date, note count, first-line preview) via a new
  `BereanApi.getJournalEntries()` (implemented in both `SupabaseBereanApi` and
  the memory stub); tapping a row opens the study in `SessionEditor`. Notes in
  `ReadingMode` now offer "Edit note" and "Open study" (jumps to the
  SessionEditor under the Journal destination).

- **Nav restructure (UX overhaul, workstream 1).** Sidebar/drawer removed; top
  nav (desktop) + bottom tab bar (mobile) with Bible · Journal · + Study ·
  Profile; workspace-selector stub ("Personal ▾"); avatar/profile menu absorbing
  the Settings entry point; Bible library is home. Journal is a placeholder
  until workstream 2.
