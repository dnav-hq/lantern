# Guest read-only preview + ESV endpoint protection

Status: **product direction decided, implementation plan below.** Dennis has
already settled the shape (see [Agreed product direction](#1-agreed-product-direction) —
this is not an open exploration of whether guests get local notes; that was
already considered and rejected. This document turns the decision into a
grounded implementation plan, an abuse-surface analysis, and the ESV-protection
design the decision requires.

## tl;dr

- **The read path is cheap; the write path is where the risk lives.**
  `BookDetailPage`/`ChapterView` render scripture through `getBibleVerse`
  (`src/bible/service.ts`), a seam with zero dependency on auth or `BereanApi`
  — but the *same component* also calls `useApi()` on mount to load notes and
  passages (`BookDetailPage.tsx:1104-1107`, `ChapterView`'s inline-note calls).
  A guest cannot reuse `BookDetailPage` as-is; it needs a stripped, API-free
  reading surface, not a permission check bolted onto the existing one.
- **RLS already blocks a guest from writing a row, independent of anything the
  UI does.** Every write policy on `passages`/`sessions`/`notes` resolves to
  `workspace_id in (select ... where user_id = (select auth.uid()))`
  (`supabase/migrations/0001_init.sql:139-174`); an unauthenticated request has
  `auth.uid()` = `null`, which matches no membership row. This is defense in
  depth the guest feature gets for free — it does not need to be built.
- **The ESV proxy is the one real, live exposure, and it predates this
  feature.** `supabase/functions/esv-proxy/index.ts` is deployed with
  `--no-verify-jwt` (required today because the client calls it with the
  *anon* key, not a session token — `src/bible/esv.ts:57`), and that anon key
  ships in the JS bundle served to every visitor, signed in or not, right now.
  Nothing about shipping guest preview makes this worse, but shipping guest
  preview is the reason to fix it now rather than later: more public surface
  area increases the odds something finds it.
- **Recommendation: require a real session at the proxy (redeploy with the
  platform's own JWT verification, switch the client to send the user's
  access token), layer a light per-user rate-limit trigger on top reusing the
  pattern `0004_telemetry_buffer.sql` already proved, and never offer ESV to
  guests at all.** Turnstile and pure per-IP limiting are considered and
  rejected below — see [§5](#5-esv-proxy-protection-the-live-exposure).
- **MVP slice: a new API-free `GuestReader` surface for the two public-domain
  translations, a sign-in gate on any write gesture, and the ESV fix shipped
  first and independently** — the proxy fix has no UI dependency and is worth
  doing today even if the guest UX slips. See
  [§8](#8-recommendation-mvp-and-what-to-defer).

## 1. Agreed product direction

Stated here as settled, not re-opened:

- A guest gets a **read-only preview** of scripture with **no account** and
  **no note-taking**.
- There is **one user model**: accounts. Deliberately **no guest data layer**
  and **no local note persistence** for unauthenticated visitors. Two reasons,
  both final: (a) never risk an unsaved reflection to a cache clear — a guest
  who writes something meaningful and loses it on a stray "clear site data" is
  a worse outcome than never having let them write at all; (b) avoid
  architecting every future feature around two user types (a guest data model
  and an account data model) when only one will ever matter long-term.
- The account is framed as a **benefit** (notes kept and synced across
  devices), gated at the write moment as a positive invitation — "begin your
  study" — **not** as a demo, and **not** with per-note loss-warning copy.
  There is nothing to lose because nothing was ever written; the CTA sells
  what signing in gets you, not what staying signed out costs you.

## 2. How an unauthenticated visitor is routed today

`Root.tsx` is a small phase machine: `'loading' | 'signedOut' | 'onboarding' |
'ready'` (`Root.tsx:16`). The only unauthenticated experience is
`phase === 'signedOut'`, which renders `<Landing />` alone
(`Root.tsx:87-93`) — a marketing page (hero, feature clips, the "why it
exists" section) with `<SignIn />` opened as a modal from four separate CTAs
(`Landing.tsx:61-64`, `83-90`, `142-145`). There is **no reading surface at
all** for a signed-out visitor today; `App.tsx` (which owns `BookDetailPage`,
`ReadingMode`, Journal, Study, Profile) only mounts once `phase === 'ready'`,
wrapped in `<ApiProvider api={api!}>` (`Root.tsx:107-111`) — i.e. today's app
shell assumes a live `BereanApi` exists before a single verse renders.

Guest preview needs a new branch in this machine — call it `'guestReading'` —
reachable from `Landing` without going through `SignIn`, that mounts a reading
surface with **no `ApiProvider`** wrapping it, because there is deliberately
no guest-facing `BereanApi` implementation (see §1: no guest data layer at
all, not even a stub).

## 3. Which reading surfaces are guest-viable

Grounded in `BookDetailPage.tsx`, `ReadingMode.tsx`, `src/bible/service.ts`,
and `App.tsx`'s four destinations (`bible`, `journal`, `study`, `profile` —
`App.tsx:81`, `237-254`).

**Scripture rendering itself has no auth dependency.** `getBibleVerse` is
imported directly from `../bible/service` in both `BookDetailPage.tsx:6` and
`ReadingMode.tsx:5` — *not* through `api.getBibleVerse`. `service.ts` composes
`BibleProvider`s only (`HelloaoBibleProvider` + `CachedBibleProvider` +
`SelfHostedBibleProvider` for BSB/KJV; the key-proxied `EsvBibleProvider` for
ESV) and touches Supabase only incidentally, through the ESV proxy's HTTP
call — never through `BereanApi`/RLS. This is the seam a guest surface should
depend on.

**But neither existing reading component is guest-safe to reuse as-is.**

- `BookDetailPage` calls `useApi()` and, on mount, `api.getNotesByBook` +
  `api.getPassagesByBook` (`BookDetailPage.tsx:1077`, `1104-1107`) to build
  the "chapters with notes" strip and the note rail. `ChapterView` inside it
  goes further: verse taps can call `api.getPassages()`, `createSession()`,
  `createNote()` (`BookDetailPage.tsx:437-473`) to write an inline note.
  Rendering this component at all today requires a live `BereanApi`; it isn't
  "notes are empty for a guest," it's "this component throws or breaks
  outside an `ApiProvider`" (`useApi()` throws by design —
  `context.tsx:20`).
- `ReadingMode` is worse-suited structurally: it takes a `passage: Passage`
  *prop* (`ReadingMode.tsx:19`) — i.e. it can only ever open a passage a
  `BereanApi` has already created. A guest, by definition, has never created
  one. There is no "guest mode" for `ReadingMode`; it simply doesn't apply
  until an account exists.
- `Journal`, `StudyMode` (note-taking), and `Profile` are unambiguously
  account-only — they *are* the note/account value the product sells. No
  analysis needed there beyond confirming the gate applies (§4).

**Conclusion: the guest reading surface is a new, minimal component, not a
permission flag on `BookDetailPage`.** Call it `GuestReader` — same chapter
grid/typography as `ChapterView` for visual continuity, but it never imports
`useApi()`, never renders a note rail, and never fetches passages/sessions.
Structurally unable to touch `BereanApi` is safer than a component that could,
if a future edit forgets a guard — this also matches the "no guest data
layer" decision at the architecture level, not just the UX level.

## 4. Where the sign-in gate triggers

Any *write* gesture is the trigger, precisely because RLS (§6) makes read vs.
write the only distinction that matters at the data layer too:

- Tapping a verse to start a note (`ChapterView.handleQuickNoteFromSelection`,
  `handleInlineSave` — `BookDetailPage.tsx:402-491`) → opens `SignIn` instead
  of the inline note editor.
- "Study chapter" / "Start study on {ref}" (`BookDetailPage.tsx:826-849`,
  `1014-1027`) → same gate.
- Any tap toward the `journal`, `study`, or `profile` nav destinations
  (`App.tsx:237-254`) → same gate; these destinations simply don't exist in
  the guest phase, so the nav itself should omit them rather than show a dead
  end (a guest's nav is scripture-only, per §7's landing-narrative framing).

The gate reuses the existing `SignIn` modal verbatim (`SignIn.tsx`) — it
already supports being opened contextually (`Landing`'s `openLogin` /
`openEmailLogin` pattern, `Landing.tsx:36-38`). Only the copy that invites it
changes (§7), not the mechanism.

## 5. Abuse-surface analysis

| Surface | Exposure today | Guest-safe? |
|---|---|---|
| BSB / KJV (network + self-hosted) | Public-domain text, `helloao.org` primary with a lazily-fetched self-hosted static-bundle fallback (`self-hosted.ts`); `CachedBibleProvider` caches every chapter forever client-side. No API key, no quota, no per-app ceiling — see `docs/proposals/translations-esv-niv.md` §1's KJV/BSB verdict. | **Yes.** Bot traffic here costs bandwidth, not a shared quota; nothing to protect beyond normal abuse-rate hosting hygiene. |
| Notes / Journal (writes) | `passages_all`, `sessions_all`, `notes_all` policies all resolve to `workspace_id in (select ... where user_id = (select auth.uid()))` (`0001_init.sql:139-174`). An unauthenticated request has `auth.uid()` = `null`; no membership row ever matches `null`, so every guest write is rejected at the database, independent of what the client UI permits. | **Yes, already.** This is the one abuse surface that needed zero new work — RLS was already correct for a guest that doesn't exist as a `auth.users` row. |
| Telemetry buffer | `POST` accepted with the anon key by design (`client.ts:26-31`, so no user identity travels), but gated server-side by `telemetry_events_guard()`: 20 rows/install/minute burst limit, 500/install/24h daily ceiling, sampling above 100/install/hour (`0004_telemetry_buffer.sql:112-180`). Payload is `{code, errorClass, stack}` only — no passage/book/chapter/user content (`client.ts:6-13`). | **Yes, already.** Already rate-limited per install and content-free; guest traffic doesn't change its risk profile. |
| **ESV proxy** | **Deployed `--no-verify-jwt`, called with the anon key, not a session token — see §6.** Metering exists (`esv_api_usage`) so consumption is *visible*, but nothing today stops a script from calling it directly with the public anon key straight out of the bundle. | **No — this is the one real exposure**, and it is live *today*, before any guest UI ships. |

## 6. ESV proxy protection (the live exposure)

**Confirmed against the actual deployed code, not assumed:**

- `supabase/functions/esv-proxy/index.ts:20` documents the deploy command as
  `supabase functions deploy esv-proxy --no-verify-jwt`, with the comment
  explaining why: *"the browser calls this with the anon key, not a user's
  Supabase JWT, so the platform's default gateway check would reject every
  request with a 401 before this code runs"* (`index.ts:22-25`). The function
  itself performs no authentication check of its own — it validates only
  `book`/`chapter` query params (`index.ts:122-127`) and the `ESV_API_KEY`
  secret being set (`index.ts:118-120`). Any caller who has the anon key —
  which is public by design, embedded in every client bundle — can call it.
- `src/bible/esv.ts:56-57` confirms the client sends exactly that: `headers:
  { apikey: ANON_KEY, Authorization: \`Bearer ${ANON_KEY}\` }`, where
  `ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY` (`esv.ts:20`) — never
  the signed-in user's session token, even when one exists.
- Net effect: **the shared 5,000/day Crossway quota (`esv.ts:76-79`) is
  currently protected by nothing but obscurity.** Anyone who inspects network
  traffic or the built JS bundle can call the proxy directly, with no browser,
  no account, and no rate limit of their own, and exhaust the quota for every
  real user simultaneously. This is true right now, independent of guest
  preview shipping.

**Options considered:**

- **A — Require a real signed-in session at the proxy.** Redeploy *without*
  `--no-verify-jwt` (the platform default), and switch the client to send the
  user's Supabase access token instead of the anon key. The reason
  `--no-verify-jwt` exists today is specifically that the anon key is used;
  switching what's sent removes the reason for the flag. This pushes the
  auth check into Supabase's own gateway — platform code, not
  hand-rolled function logic — which is the smallest, most robust version of
  "require a session."
  *Tradeoff:* a genuine, mechanical client change is required (below), and it
  must ship in the same deploy as the function redeploy or ESV breaks for
  everyone for the gap in between.
- **B — Cloudflare Turnstile.** Lets a guest pass a challenge without an
  account, so it could in principle allow *guest* ESV access.
  *Tradeoff:* new third-party dependency, a visible widget/UX step, and it
  solves a problem that doesn't need solving if guests are never offered ESV
  in the first place (§7 answers this: they aren't — only BSB/KJV are
  guest-viable per §5's table). Rejected as unnecessary given the product
  decision already scopes ESV out of the guest surface.
- **C — Per-IP or per-user rate limiting**, e.g. an edge-function-side
  counter or a DB guard trigger shaped like `0004_telemetry_buffer.sql`'s.
  *Tradeoff:* limits *volume* but not the underlying problem — an
  unauthenticated caller can still make some number of calls with no
  account at all. Doesn't stand alone, but is cheap and valuable **layered
  on top of A** as defense-in-depth against a compromised or scripted
  *signed-in* account (a real account changes the blast radius from
  "anonymous quota-drain" to "one bad actor, rate-limited and attributable").

**Recommendation: A, plus C layered on top of A. Not B.** Concretely:

1. Redeploy `esv-proxy` without `--no-verify-jwt`.
2. `src/bible/esv.ts` sends the user's session access token (from
   `supabase.auth.getSession()`) as the `Authorization` header instead of the
   anon key. This is the one line that **must not regress already-signed-in
   users** — ship the function redeploy and this client change together, not
   staggered, or ESV goes dark for real users in between.
3. `EsvBibleProvider` should treat "no session" as `ESV_NOT_CONFIGURED`
   client-side (reuse the existing degrade path, `esv.ts:50`) so a guest
   never even attempts the call — consistent with §7's decision not to offer
   ESV to guests at all, and one less code path that can hit the platform's
   401.
4. Add a lightweight per-user counter to the function (reusing the
   burst/daily-ceiling shape already proven in
   `0004_telemetry_buffer.sql:112-180`, keyed on `auth.uid()` instead of
   `install_id`) as the defense-in-depth layer against a compromised or
   scripted account. This is additive and can ship after step 1-3 land.

## 7. Conversion: read-only still has to sell the note-beside-the-verse value

A guest can't take a note, so the app's actual promise — *"your study stays
beside the verse"* (`Landing.tsx:78-79`) — can't be experienced firsthand in
the preview. Two things close that gap without violating §1's constraints:

- **Curated example notes**, read-only, shown in place on two or three
  flagship passages (Psalm 119, John 3, and similar) — a handful of notes in
  the same visual position `ChapterView`'s note rail/inline notes already use,
  demonstrating the four categories (`observation | historical | application
  | personal`) that are otherwise invisible to a guest. These are static,
  authored content, not user data — no guest data layer is implied.
- **A contextual "Sign in to capture this" affordance anchored at the verse
  tap gesture itself**, not a generic top-of-page banner — it should appear
  exactly where §4's gate fires, so the invitation shows up at the moment a
  guest has already expressed intent to write something.

Copy direction, per §1: positive and forward ("Begin your study — sign in to
keep what you notice"), never a demo label, never a loss warning ("you'll
lose this note") — there is nothing to lose, because guests never had
anything written to begin with.

## 8. Landing narrative and shareable deep links

**Narrative direction:** the landing page's current single-CTA framing ("the
only real choice is *how* to sign in" — `Landing.tsx:29-33`) needs a second,
genuinely free door: "Read freely" alongside "Continue with Google / email."
The account CTA reframes from *the only way in* to *keep your study* — signing
in remains the only way to write anything, but it's no longer the only way to
see anything.

**Deep-linkable passages as a shareability lever:** today there is no router
— `App.tsx` is state-based (per this repo's CLAUDE.md: *"no framework, no
router — the app is a single-page tree with view state in `App.tsx`"*) — so a
shared link into a specific passage doesn't exist as a concept yet. Making a
guest reading URL shareable (e.g. `/read/john/3`) needs, at minimum: (a) a URL
→ state hydration step in `Root.tsx` before phase resolution, reading a path
or query param into the initial guest-reading state; (b) a state → URL sync
on chapter navigation, scoped *only* to the guest-reading surface so the rest
of the app's "no router" property is undisturbed. This is genuinely new
plumbing, not a config flag — scope it as its own slice (§9 defers it).
Evangelism value: someone can send a bare scripture reference and the
recipient lands directly on real, rendered text with no sign-in wall in
front of it, which is the whole growth thesis of doing this at all.

## 9. Recommendation, MVP, and what to defer

**Do the ESV fix first, independent of everything else.** §6 is a live
exposure that predates this feature and has no UI dependency — it should ship
whether or not the guest reading UX ships this quarter.

**MVP slice, in order:**

1. **ESV proxy protection** (§6, option A + the client-token switch)  —
   urgent, ship ahead of the rest if wanted.
2. **`GuestReader`** (§3): a new component reachable from `Root.tsx`'s
   signed-out phase, rendering BSB/KJV only through `bible/service.ts`
   directly, with zero `useApi()`/`ApiProvider` dependency. `Landing.tsx`
   gains a "Read freely" entry point alongside the existing sign-in CTAs.
3. **The sign-in gate** (§4): reuse `SignIn.tsx` unmodified, triggered from
   every write gesture and every account-only nav destination.
4. **Contextual conversion content** (§7): curated example notes on a small,
   fixed set of flagship passages, plus the anchored "sign in to capture
   this" CTA.

**Defer:**

- **Deep-linkable URLs (§8)** — genuinely new routing plumbing; valuable but
  independent of the MVP reading experience, and it can land once the guest
  surface itself is proven.
- **Guest access to ESV** — never offer it. §6 removes anonymous access to
  the proxy entirely; extending guest preview to ESV would mean re-opening an
  unauthenticated path to the one surface this document just closed. BSB/KJV
  cover the guest reading experience completely (§5).
- **Any guest data persistence** (drafts, in-progress selections across
  reloads) — explicitly out of scope per §1; nothing here should grow into a
  guest-side draft store by accident.

## Trigger to revisit

- **ESV proxy fix:** no trigger needed — ship it now; it is a live exposure,
  not a speculative one.
- **Guest preview MVP:** ship when guest-facing growth (landing traffic that
  bounces at the sign-in wall) is an actual observed problem worth the
  `GuestReader` build, or immediately if Dennis wants the narrative fix
  regardless of measured bounce.
- **Deep links:** revisit once the MVP guest surface is live and has real
  traffic worth making shareable — building shareable URLs ahead of an
  audience to share them with is premature.

## Files read for this brief

Codebase (read-only, no edits): `src/Root.tsx`, `src/components/SignIn.tsx`,
`src/components/landing/Landing.tsx`, `src/components/BookDetailPage.tsx`,
`src/components/ReadingMode.tsx`, `src/App.tsx`, `src/api/context.tsx`,
`src/api/types.ts`, `src/bible/esv.ts`, `src/bible/service.ts`,
`supabase/functions/esv-proxy/index.ts`, `supabase/migrations/0001_init.sql`,
`supabase/migrations/0004_telemetry_buffer.sql`, `src/telemetry/client.ts`.
Prior-art proposals read for tone and rigour:
`docs/proposals/translations-esv-niv.md`,
`docs/proposals/groups-shared-workspaces.md`, `docs/proposals/study-id.md`,
`docs/proposals/offline-write-outbox.md`.
