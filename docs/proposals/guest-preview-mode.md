# Guest preview mode — read vs ephemeral sandbox, the locked-down guest boundary, and the live ESV exposure

Status: **proposal, no application code.** This document answers three linked
questions Dennis asked for by name: (1) what a guest may *do* — resolved with a
recommendation, not left open; (2) how the guest capability is bounded, once,
so no future feature has to re-litigate it; (3) the ESV proxy's abuse exposure,
which is real and live today, independent of whether guest preview ships at all.

## tl;dr

- **Right now there is no guest surface of any kind.** `Root.tsx` renders
  exactly one of three trees — loading, `Landing` (marketing copy, zero
  scripture), or the fully authenticated `App` — and every reading component
  (`ReadingMode`, `BookDetailPage`'s `ChapterView`, `StudyMode`) calls
  `useApi()` for notes/passages on mount, which only resolves inside
  `ApiProvider`, which only mounts after sign-in. An unauthenticated visitor
  cannot see a single verse today. That's the problem this brief exists to fix.
- **Recommendation: ship (B), the ephemeral client-only sandbox, not (A)
  pure read-only.** Both honour the fixed constraints (no persistence, no
  second data model) equally, so the choice comes down to which better sells
  the app in the first ten seconds a stranger has it open — and a guest who
  can tap a verse and type a note *feels* the read-notice-write loop that is
  Lantern's entire pitch, where a pure reader only reads a description of it.
  The one real risk is framing, addressed head-on in §3.
- **The guest boundary is defined once, here, as a single inverted default:**
  an unauthenticated visitor gets scripture reading and nothing else; anything
  that touches an account, stored data, or another person is gated by
  default, with one explicit, named escape hatch for the rare future feature
  that should be public. See §4. This is meant to be the last time anyone
  reasons about "should a guest be able to do X" from scratch.
- **The ESV proxy is exposed today, live, to every visitor and every bot,**
  deployed `--no-verify-jwt` with the public anon key shipped in the bundle —
  confirmed by reading `supabase/functions/esv-proxy/index.ts` and
  `src/bible/esv.ts` directly (§6). It shares one 5,000/day quota across every
  Lantern user. This is the one item in this brief with live urgency
  independent of guest preview shipping — see §8.

## 1. How an unauthenticated visitor is routed today

Grounded directly in `src/Root.tsx`, `src/components/landing/Landing.tsx`,
`src/components/SignIn.tsx`, and `src/api/context.tsx`.

`Root.tsx`'s `SupabaseRoot` is a four-state machine: `loading` →
`signedOut` | `onboarding` | `ready`. `signedOut` renders `Landing` — hero
copy, a Psalm 119:105 quote, feature clips, and exactly one action family
("Continue with Google" / "Continue with email"), both of which open
`SignIn.tsx`, a dialog whose first-sign-in doubles as sign-up. There is no
"skip" or "browse first" affordance anywhere in that tree. The `ready` phase
is the only place `ApiProvider` mounts, wrapping `App`, which is the only
place `ReadingMode`, `BookDetailPage`, `StudyMode`, and `NavBar` are reachable
from. `useApi()` (`src/api/context.tsx`) throws if called outside
`ApiProvider` by design — "a missing provider fails loudly" — so today there
is no code path, intentional or accidental, where an unauthenticated visitor
reaches a scripture-reading component at all.

**Which reading surfaces are guest-viable, and which aren't, is a seam
question, not a page question.** Lantern has two independent data seams
(CLAUDE.md): `BibleProvider` (scripture, no auth, no DB — `getChapter(book,
chapter)` reads `bible.helloao.org` / the self-hosted BSB/KJV bundles / the
ESV proxy) and `BereanApi` (notes/passages/sessions, always Supabase +
`useApi()`, always behind RLS). Scripture text alone needs zero account. But
every current reading component conflates the two seams in one render: `getBibleVerse(...)`
for the text *and* `api.getNotesByBook(...)` /
`api.getNotesByPassage(...)` for the notes rail, in the same `useEffect`.
Concretely, none of `ReadingMode.tsx`, `BookDetailPage.tsx`'s `ChapterView`,
or `StudyMode.tsx` can be dropped in front of a guest unmodified — each would
throw the instant it rendered outside an `ApiProvider`. A guest-viable reading
surface is new, narrower code: scripture rendering with the notes rail, verse
selection, and the note editor's *save* path removed or stubbed, not the
existing components reused as-is. This is real, scoped engineering, not a
routing tweak — worth stating plainly so the smallest-slice estimate in §9
isn't read as "flip a flag."

**Where the sign-in gate actually triggers, precisely:** `Root.tsx`'s
`signedOut` phase (no session at all) and any attempt to reach `NavBar`'s
profile menu, `Settings`, `Journal`, or the note-save path inside `StudyMode`
— all of which live inside `ready` and are therefore already fully gated by
construction. Nothing in this brief needs to add gating to those; they are
correctly unreachable already. What's missing is a *new*, narrower ungated
path into scripture only.

## 2. The two constraints that are settled, not open questions

Dennis has already ruled on both of these; this brief does not relitigate
either, and treats reopening them as a failure mode to avoid, not a
possibility to weigh.

- **No local persistence for a guest.** A guest's notes surviving a page
  reload via `localStorage`/IndexedDB was considered and rejected: it
  survives a reload but not a cache clear, and a cache-clear data loss for
  something the user believed was "their notes" is a worse experience than
  never having offered to save it. `src/offline/draft.ts` exists for exactly
  the opposite case — protecting an *authenticated* user's in-progress typing
  against a reload before their real save lands — and is not a precedent for
  guest persistence; it exists downstream of an account, not instead of one.
- **No second, guest-shaped data model.** `SupabaseBereanApi` resolves one
  `kind = 'personal'` workspace per authenticated user
  (`docs/proposals/groups-shared-workspaces.md` §1 documents this
  architecture in depth). A guest data model — even a stripped one — would be
  a second thing every future schema change, RLS policy, and `BereanApi`
  method has to reason about twice. Rejected for the same reason
  `groups-shared-workspaces.md` treats "genuinely new interface surface" as
  expensive: it compounds forever, not once.

**What is not settled by either rejection, and is exactly what (B) below
is:** an ephemeral, in-memory-only, resets-on-reload sandbox that is neither
of the above. It stores nothing (satisfies constraint 1 — there is nothing to
lose on a cache clear because nothing was ever written anywhere) and needs no
new data model (satisfies constraint 2 — it is React `useState`, gone the
moment the tab closes, never touching `BereanApi`, Supabase, or a schema).
Conflating "ephemeral client state" with "persistence" or "a data model" would
be a category error the acceptance criteria explicitly warn against, so it's
worth being this literal about why it clears both bars.

**The account is a benefit, framed at the write moment — never a demo, never
a loss warning.** This governs copy in both options below: the moment a
guest's action would need an account (saving a note in (A); the sandbox
handing off to a real save in (B)), the framing is "begin your study — sign
in to keep it," not "you're in demo mode" or "this won't be saved unless you
sign in first." The former sells the account; the latter apologizes for the
product.

## 2a. The settled product stance: guest is a durable free reader, not a trial (2026-08-03)

Added after the review discussion with Dennis. The brief above reads guest as a
*preview that converts*; the stance below refines it, and where the two differ
this section wins.

**Sign-in stays the primary flow.** For anyone indifferent to signing in, the
account is the best path — a broad, genuinely free feature set unlocked with
minimal effort — so the landing leads with sign-in, prominently, exactly as it
does today. Guest access is the *generous alternative*, not the headline.

**Guest is a Bible *reading* app, and reading is never nagged.** A signed-out
visitor can read scripture smoothly and indefinitely: no wall, no forced
logout, no ambient "sign in" pressure while they are only reading. Someone who
just wants a free, ad-free Bible reader — including installing the PWA and
using it that way forever — is a *legitimate, satisfied end state*, not a
failed conversion. This is a stronger evangelism story than a trial, and it
costs nothing, because the study account still sits right there as the upsell.

**The sign-in nudge is scoped to the note-taking moment, not the chrome.** The
prompt to sign in appears *around note-taking* — when a guest reaches for the
note editor (the §3 sandbox is precisely this: typing in it, with the honest
"nothing saved here — sign in to keep it" label, *is* the contextual invitation).
A guest who never touches notes is therefore never prompted at all. This is the
mechanism that lets reading stay un-nagged while still converting the people who
want the write side. It is fully consistent with the "account = benefit, framed
at the write moment" rule in §2 — the write moment is the *only* moment.

**The strategic goal is unchanged: everyone signed in, eventually** — reached
by generosity and one contextual prompt rather than by gates. Guest reading is
the on-ramp, not a competing product.

**What this stance explicitly de-scopes.** Because guest is *smooth reading*
and not a marketed "downloadable offline reader," **true offline reading stays
a deferred item** (`docs/BACKLOG.md`, "Full-Bible offline prefetch"), not
near-term core. A genuinely offline guest today still only re-reads
lazily-cached chapters; that is an acceptable gap under this stance and becomes
worth closing only if the free-reader persona turns out to want offline
specifically. Guest reading remains BSB/KJV (public-domain, self-hostable,
cache-forever) — which, not coincidentally, is the only translation shape that
could ever read offline, so excluding ESV from guests (§8) and deferring
offline reinforce rather than fight each other.

## 2b. Preferences: account-owned for signed-in users, local cache for guests

Dennis's call, and it sharpens the "one user model" principle rather than
bending it. Preferences (theme/dark mode, visual theme, translation choice,
"hide all notes while reading") are `localStorage`-only today
(`berean-theme`, `berean-visual-theme`, `berean-translation`,
`berean.hideAllNotes`).

- **Signed-in: preferences belong to the account and sync across devices.** The
  lightest implementation is a **`settings jsonb` column on the existing
  `profiles` table** — no new table, and `profiles` already carries own-row-only
  RLS (`profiles_select` / `profiles_update` in `0001_init.sql`), so it needs
  **zero new policies**. `BereanApi` gains a `getSettings` / `updateSettings`
  pair. This is an *account* data model, not a second *guest* one, so it does
  not reintroduce the two-user-type cost §2 rejected.
- **Guests: `localStorage`, exactly as today.** Unchanged.
- **`localStorage` stays as the write-through cache / offline mirror** for
  signed-in users too (same shape as `src/offline/mirror.ts`), so a preference
  read is instant and never blocks on the network.
- **Adopt-on-sign-in continuity.** On a guest's first sign-in, if the account
  has no settings yet, seed the account from the local prefs — a guest who set
  dark mode + KJV then signs in keeps them ("your settings came with you").
  After that the account is source of truth; last-write-wins is fine for these
  low-stakes values (unlike notes, which are never last-write-wins).

This is queued as its **own** implementation task, not part of the guest reader:
it benefits existing signed-in users (cross-device sync) independent of guest
mode, and can ship on its own timeline.

## 3. Option (A) vs (B), and the recommendation

Both options satisfy §2's constraints equally — this is not the axis that
decides between them.

**(A) Pure read-only preview.** A guest reads scripture; there is no note
editor rendered at all, anywhere, for a signed-out visitor. Simplest to build
(genuinely just a `BibleProvider` call and static verse rendering, no
editable state, no framing risk) and simplest to reason about (nothing to
mis-frame because nothing is ever typed). The cost: a guest never touches the
thing that makes Lantern *Lantern* — the verse-beside-your-note layout — they
only read about it in the landing copy's hero line ("a place to write").
Every other reading surface in the app (`ReadingMode`, `ChapterView`) already
shows the rail/inline note UI chrome even when empty, so a pure read-only mode
would need its own visually bare "no notes here" reading surface, which reads
as a lesser version of the real app rather than a taste of it.

**(B) Ephemeral client-only sandbox.** A guest reads scripture and *can* tap
a verse and type in the note editor — pure `useState`, no persistence layer
touched, no localStorage key written, resets the instant the tab reloads or
closes. The one real risk, named directly per the acceptance criteria: it
must read as an honest, upfront "try it — nothing saved here" scratch space
from the very first keystroke, never as real storage a guest discovers was
fake only when they lose it. Framing that gets this right does NOT say
"unsaved" or "will be lost" anywhere (both phrasings presuppose the guest
expected saving, then subtract it — a loss frame) — it says something closer
to a permanent, ambient label on the editor itself: *"You're trying this out
— nothing here is saved. Sign in to keep it."* stated once, visibly, before
the first keystroke, not as a warning that appears after typing starts. This
mirrors `StudyMode.tsx`'s existing draft-recovery notice pattern (an explicit,
permanent "nothing here is on the server yet" state, never a toast that
implies something went wrong) — same *shape* of honest state-labeling this
app already uses elsewhere, applied to a guest instead of a draft.

**Recommendation: (B).** The read-notice-write loop is the product's entire
differentiation from a plain Bible-reading site — landing copy already says
so ("Notice something, look up the history, apply it, sit with it. Your study
stays beside the verse"). A visitor who can only read is being told about that
loop, not shown it, and "shown" converts better than "told" for exactly the
reason a feature-clip video (`FeatureClips.tsx`, already on the landing page)
exists instead of a bullet list. (A) is the fallback if the framing risk in
(B) proves genuinely unsolvable in review — it is not eliminated as an option,
just not the lead — but nothing in the code or design system suggests it is:
`QuickEditCard`, `InlineTagInput`, and the verse-selection UI are all already
presentational components with no built-in assumption that a save succeeds,
so a sandbox variant that never calls `api.createNote` at all is a subtraction
from the existing editor stack, not a new one.

**What the sandbox is NOT, restated for the acceptance criteria's benefit:**
not a second `BereanApi` implementation (it never implements the interface —
there is no `createNote`/`getNotesByPassage` call anywhere in the guest
render tree, so there is no seam for it to conform to); not a demo dataset
(no seeded notes, no "sample study" — an empty, honest blank slate, the same
first-open state a brand-new real account gets); not a persistence layer
under a different name (explicitly in-memory `useState`, gone on reload by
construction, not by policy someone could accidentally violate later).

## 4. The guest boundary: one inverted rule, not an allowlist

**The rule, stated once, meant to be the last time this is reasoned about:**

> An unauthenticated visitor gets scripture reading (via `BibleProvider`) and
> the ephemeral sandbox note editor from §3. Everything else — anything that
> touches an account, reads or writes stored data through `BereanApi`, or
> involves another person — is gated behind sign-in by default, with no
> per-feature decision required.

This is deliberately the inverse of an allowlist. An allowlist ("guests may
do: read scripture, use the sandbox, [...]") has to be remembered and
consulted every time a new feature ships — the "groups" feature in
`docs/proposals/groups-shared-workspaces.md`, a future paid tier, a future
shared journal, all would otherwise need someone to ask "wait, can a guest do
this?" and get it right by hand, forever. The inverted framing needs zero
maintenance: a new feature that touches `BereanApi`, Supabase, or another
user is unreachable by an unauthenticated visitor *automatically*, because it
was never granted access in the first place — the same way `useApi()`
throwing outside `ApiProvider` already makes every current feature
sign-in-only by construction, not by a list someone kept up to date. This
brief's contribution is making that same "unreachable by default" property
hold for the one deliberately-carved-out exception (scripture + sandbox) too,
rather than it being implicit in "nothing routes there yet."

**The escape hatch, because "gated by default" must not mean "walled off by
accident."** Some future feature genuinely should be public — a shareable
read-only "here's my note on this verse" link is the obvious future
candidate, and the deep-linkable-passage idea in §7 is adjacent to exactly
this shape. The rule therefore has one named exception mechanism: a feature
becomes guest-visible only via an explicit, code-reviewed opt-in at the point
it's built — e.g., a route or component deliberately rendered outside
`ApiProvider`/`ready`, the same way the sandbox in §3 and scripture reading
itself are the two things deliberately carved out today. The opt-in is
never implicit (no "this happens to work without auth because nobody added a
check" — that is an accident, not a decision) and never blanket (no
"anything not explicitly gated is public" — that is the allowlist model this
rule exists to avoid). Concretely, this means: default new code to living
inside `ready`/`ApiProvider` exactly as it does today; the only way something
becomes guest-reachable is a deliberate decision to place it in the small
guest-accessible tree `Root.tsx` gains for §3, made once per feature, by a
human, not inferred from what a component happens not to check.

## 5. Abuse surface, endpoint by endpoint

Grounded in the actual read/write paths, not a generic threat model.

| Surface | Guest-reachable under this proposal? | Risk |
|---|---|---|
| BSB / KJV via `helloao.ts` + self-hosted bundle | Yes (scripture reading) | **Low.** Public-domain text, cached client-side once fetched (`CachedBibleProvider`, cache-forever by design), and `SelfHostedBibleProvider` serves the complete bundle from Lantern's own origin — a guest hammering chapter reads costs Cloudflare Pages bandwidth on largely-cached, non-sensitive, free content. No API key, no third-party quota to exhaust. |
| Notes / passages / sessions via `BereanApi` → Supabase | No (never called by the guest tree) | **None added.** `supabase/migrations/0001_init.sql`'s `notes_all`/`sessions_all`/`passages_all` policies all resolve to `workspace_id in (select workspace_id from workspace_members where user_id = (select auth.uid()))`. An unauthenticated request has `auth.uid()` null; no `workspace_members` row can ever match null, so RLS returns zero rows for every operation, insert included — a guest cannot write a single row today even by direct API abuse, gate or no gate. The §3 sandbox adds **zero** abuse surface here specifically because it never reaches this table at all — confirmed by design, not by RLS (RLS is the backstop; the sandbox never even attempts the call). |
| Telemetry buffer (`telemetry_events`) | Effectively yes (loads on every page view, guest or not, already) | **Low, already defended.** `docs/BACKLOG.md`'s telemetry entry documents five server-side defenses assuming a hostile writer holding a valid anon key: a per-install burst limit (20 stored / 5 dropped past 25 rapid inserts, verified live), a hard daily ceiling, sampling above a soft hourly threshold, and CHECK-enforced payload caps — all already live and already exercised against exactly the anon-key-abuse shape a guest-opened tab represents. Content-free by construction (`toTelemetrySafe()` strips human detail before anything is sent). Nothing about guest preview changes this surface's exposure; it was already reachable by anyone with the anon key, which already ships in the bundle today regardless of auth state. |
| ESV proxy (`esv-proxy`) | Yes, today, gate or no gate | **High — the one real exposure.** See §6-§8. |

The table's shape is deliberate: three of four surfaces are either
structurally safe (RLS) or already hardened against exactly this threat model
(telemetry). The ESV proxy is the outlier, and it's an outlier *today*,
independent of whether guest preview ships — worth separating clearly from
the guest-preview decision in the recommendation (§9).

## 6. The ESV proxy is exposed today — confirmed from the code

Two files confirm this, read in full for this brief:

**`supabase/functions/esv-proxy/index.ts`** is deployed `--no-verify-jwt`
(stated in the function's own header comment, "required for the same reason
hq-telemetry needs it: the browser calls this with the anon key, not a user's
Supabase JWT, so the platform's default gateway check would reject every
request with a 401 before this code runs"). The handler (`Deno.serve` at line
107) performs exactly one check before proxying to Crossway: whether
`ESV_API_KEY` is set server-side (fail-closed 503 if not). There is **no
check of any kind on the caller** — no session validation, no per-IP
throttling, no per-install identifier, nothing. Anyone who can construct a GET
request to the function URL with `book`/`chapter` query params gets a
Crossway-backed ESV chapter, full stop, whether they've ever opened Lantern or
not.

**`src/bible/esv.ts`** (`EsvBibleProvider.getChapter`, lines 53-58) confirms
what the client actually sends: `headers: { apikey: ANON_KEY, Authorization:
Bearer ${ANON_KEY} }` — the Supabase **anon** key, not the signed-in user's
session JWT. `ANON_KEY` is `import.meta.env.VITE_SUPABASE_ANON_KEY`, baked
into the client bundle at build time and served to every visitor's browser
regardless of auth state — it is, by design, a public credential (every
Supabase project ships one; RLS is what's supposed to make it safe to expose).
The proxy doesn't even look at that header for authorization today — CORS
headers admit any origin (`Access-Control-Allow-Origin: '*'`) and the function
body never inspects `apikey`/`Authorization` — but a change that *did* start
checking it would still only prove "this request came from something holding
the public anon key," which is not a meaningful authorization boundary, since
that key is not secret.

**What exists today is metering, not protection**
(`docs/BACKLOG.md`'s "ESV usage metering" entry, shipped 2026-08-03,
`0008_esv_usage.sql`). Every real upstream call is recorded into
`esv_api_usage` with a timestamp and coarse `ok`/`quota`/`error` status —
useful for seeing how much of the shared quota is being consumed, and it does
correctly meter only real cache-miss upstream calls, never a client cache hit.
**It does not block, throttle, or reject a single request** — a bot issuing
thousands of chapter requests per minute gets metered and served, identically
to a real user. This is the gap this brief's §8 recommendation closes; the
metering work is complementary (observability) but was never designed to be
the abuse defense, and its own header comments never claim to be.

## 7. Landing narrative and shareability

The landing page's existing copy ("Keep what you see in the light of the
Word... Your study stays beside the verse") already sets up the exact
framing this proposal needs: **read freely, account = keeping your study.**
Nothing in `Landing.tsx` needs to change in tone once guests can actually
read — the CTAs ("Continue with Google" / "Continue with email") stay the
entry point for *starting an account*, and a new, separate CTA ("Read the
Bible free — no account needed" or similar, exact copy is a design pass, not
an engineering one) becomes the entry into the §3 guest tree. This turns the
landing page from "explain the app, then ask for an account" into "let people
experience the app, then ask for an account at the moment it earns the ask" —
consistent with the "account framed as benefit, not gate" rule in §2.

**Deep-linkable passages are new work, not an existing capability worth
noting explicitly**, since it would be easy to assume otherwise given how
much of the reading flow already exists: `CLAUDE.md` states plainly "no
framework, no router — the app is a single-page tree with view state in
`App.tsx`," and a grep of `App.tsx`/`Root.tsx` for `history`/`URLSearchParams`
/routing confirms there is genuinely no URL-driven state anywhere in the app
today — every view (which book, which chapter, which passage) lives in React
state, not the address bar. A shareable `lanternword.com/read/john/1` link is
therefore a small but real new piece of infrastructure: a URL parser that
maps to the same `bookName`/`chapter` shape `BookDetailPage` already takes as
props, wired to read on load and (optionally, v2) update via
`history.pushState` as a guest navigates. This is squarely in scope for "the
smallest MVP slice" in §9 given how directly it serves the evangelism/sharing
angle Dennis named, but it should be sized and reviewed as its own small
piece of routing work, not assumed to piggyback for free on the guest reading
surface.

## 8. Recommended ESV protection

Grounded in the same constraint the ESV/NIV licensing proposal already
established: the key is application-level, not per-user, and "may not be
sold, shared, or published" (`docs/proposals/translations-esv-niv.md` §1) —
so whatever protection is added must not leak the key any further than today,
and must not depend on Crossway ever seeing per-user identity, since they
don't offer that model.

**Options considered:**

- **Require a real signed-in session at the proxy.** Change `esv.ts` to send
  the user's Supabase JWT (via `supabase.auth.getSession()`) instead of the
  anon key, and have the edge function verify that JWT (removing
  `--no-verify-jwt`, or adding an explicit `supabase.auth.getUser(jwt)` check
  inside the function). This is the strongest guarantee — a bot with no
  account cannot reach Crossway's quota at all — but it directly conflicts
  with §3's core design (a guest sandbox that never authenticates) unless ESV
  is simply excluded from guest reading entirely (guests get BSB/KJV only,
  never ESV — which is a perfectly defensible product call, not a
  workaround: ESV is opt-in in Settings today, defaults to BSB, so a guest
  never seeing it changes nothing about the default experience). **This also
  changes behavior for already-signed-in users**, per the acceptance
  criteria's explicit warning: today's `esv.ts` sends the anon key
  unconditionally, so switching to the session JWT must be verified against a
  real signed-in session before shipping, not assumed to work because the
  user "is signed in anyway" elsewhere in the app.
- **Cloudflare Turnstile at the proxy.** A CAPTCHA-equivalent challenge before
  the first ESV request per session. Effective against bulk/scripted abuse,
  but it is new client UX (a challenge widget, a failure/retry state) for a
  feature (reading a Bible chapter) that has never needed one, and it
  penalizes signed-in real users equally unless paired with a "skip if
  authenticated" branch — which reintroduces most of the complexity of the
  session-required option above, for a weaker guarantee (Turnstile can be
  farmed; a required real account cannot be, at the volume that matters for a
  5,000/day quota).
- **Per-IP or per-user rate limiting at the proxy.** Cheapest to add
  (server-side counter in the edge function, keyed on request IP or, for
  signed-in users, `auth.uid()`), doesn't require a client change at all for
  authenticated users, and directly targets the actual failure mode (one
  actor burning the shared daily quota), not "is this a bot" in the abstract.
  Weaker against a distributed/rotating-IP attacker, but that is a
  meaningfully higher bar than what exists today (zero limit), and the
  existing telemetry buffer's burst-limit pattern
  (`docs/BACKLOG.md`, 20-of-25 dropped) is a proven-in-production precedent
  for exactly this shape of defense in this codebase already.

**Recommendation: per-IP/per-session rate limiting first, layered with
"guests never get ESV" from §3's option (B) scope.** Concretely: (a) the
guest sandbox in §3 offers BSB/KJV only, never ESV — zero new client-auth
work needed, and it costs guests nothing meaningful since ESV isn't the
default translation for anyone; (b) the edge function gains a coarse
per-minute-per-IP counter (reusing the shape, if not the exact table, of
`telemetry_events`' burst-limit trigger) that caps requests well under the
60/minute Crossway ceiling, so a single runaway client can never itself
exhaust the shared quota; (c) requiring a real session for ESV specifically —
the strongest option — is the right escalation **if the rate limit alone
proves insufficient in practice** (visible via the usage-metering scalars
already shipped), not the day-one default, because it's the only option that
requires a verified client-behavior change (switching `esv.ts` from the anon
key to the session JWT) rather than a server-only edge-function change. This
sequencing keeps the fix small, ships the low-risk win immediately, and keeps
the stronger option in reserve with an existing, already-built way to know
if it's needed (the `esv_api_queries_24h`/`esv_api_queries_1h` scalars).

**This does not depend on guest preview shipping at all** — the proxy is
exposed to bots and scripted abuse today, regardless of whether Lantern ever
adds a guest reading surface, because the anon key already ships in every
build and the function has never checked anything about the caller. That's
why §8's rate-limit step is flagged as the one sub-item worth doing ahead of
the rest of this proposal if Dennis wants to derisk it independently — see §9.

## 9. Recommendation, MVP slice, and what to defer

**This is a stance, not a menu**, in the tradition of the other proposals in
this directory.

1. **Ship the ESV rate limit (§8a-b) first, independent of everything
   else.** Small, server-side only, no client change, closes the one exposure
   that is live right now regardless of any other decision here. This is the
   literal highest-urgency item in this brief.
2. **Ship guest preview as (B), the ephemeral sandbox, BSB/KJV only** (§3, §8):
   a new guest-accessible tree in `Root.tsx` (outside `ApiProvider`/`ready`,
   per the boundary rule in §4) rendering a narrower reading surface — verse
   text, verse selection, and an in-memory-only note editor with the upfront
   "nothing here is saved" framing from §3 — reachable from a new landing CTA
   (§7). ESV stays gated to signed-in users per §8 until/unless the
   rate-limit proves insufficient.
3. **Ship one deep-linkable route** (§7) — `/read/<book>/<chapter>` or
   similar — as the smallest slice of the shareability lever, on-load only
   (no `pushState`-as-you-browse requirement for v1).
4. **Defer:** ESV in guest preview (revisit only if the rate-limit is
   insufficient AND there's a real want for ESV specifically in the guest
   flow); `pushState`-driven in-app navigation for deep links (start with
   on-load parsing only); any second guest-visible feature beyond scripture +
   sandbox (per §4, anything new stays gated by default until explicitly
   opted in).

**Trigger to revisit:**

- **The rate limit escalating to session-required ESV:** when
  `esv_api_queries_1h`/`esv_api_queries_24h` (already shipped, per
  `docs/BACKLOG.md`) show sustained load consistent with automated abuse
  rather than organic reading, or when Crossway 429s start showing up in the
  `esv_api_usage` `quota` status at a rate that predates any real growth in
  signed-in users.
- **Guest boundary re-opt-ins:** whenever a new feature is built that is
  genuinely meant to be public (a shared read-only note link is the most
  likely near-term candidate, per §7's deep-link groundwork) — build it via
  the named escape hatch in §4, deliberately, never by omission.
- **Option (A) as a fallback:** if the sandbox framing in §3 doesn't read as
  honest in actual design/copy review — the smallest possible corrective is
  dropping the note editor from the guest tree entirely and shipping (A)
  instead, which is a subtraction from (B)'s implementation, not a rewrite.

## Files read for this brief

`src/Root.tsx`, `src/components/landing/Landing.tsx`,
`src/components/landing/` (directory listing), `src/components/SignIn.tsx`,
`src/components/BookDetailPage.tsx`, `src/components/ReadingMode.tsx`,
`src/components/StudyMode.tsx` (first 120 lines — draft/save-path shape),
`src/components/NavBar.tsx`, `src/api/context.tsx`, `src/api/types.ts`
(surface only), `src/App.tsx` (grep for `useApi`/routing), `src/bible/esv.ts`,
`supabase/functions/esv-proxy/index.ts`, `supabase/migrations/0001_init.sql`
(RLS policies), `src/telemetry/client.ts` (opening comment block —
anon-key/no-identity precedent), `docs/BACKLOG.md` (ESV provider, ESV usage
metering, and telemetry-buffer entries), `docs/proposals/study-id.md`,
`docs/proposals/offline-write-outbox.md`,
`docs/proposals/groups-shared-workspaces.md`,
`docs/proposals/translations-esv-niv.md` (tone/rigor and ESV licensing
reference).
