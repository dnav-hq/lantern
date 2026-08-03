# Edge-rendered per-passage previews + crawlable HTML for shared/deep links (G4b)

**Recommendation: build (a), a Cloudflare Pages Function that intercepts
`/read/*` and returns per-passage HTML (title, description, OpenGraph/Twitter
meta, and BSB/KJV verse text) to non-browser requests, while every real
browser still gets the SPA.** Pair it with a static sitemap + `robots.txt` +
canonical tags — a few hours of edge-function work plus a small build step,
not a rewrite. This buys real, high-value link previews when a passage is
shared. It does **not** buy meaningful search ranking for verse queries, and
this brief says that plainly rather than oversell it.

Status: research only, no application code. Depends on
[G4a](../BACKLOG.md) (`/read/<book>/<chapter>`, e.g. `/read/john/1`) landing
first — this brief covers the server/edge meta layer on top of the URLs G4a
introduces, not a replacement for G4a's client-side routing.

## 1. The problem

When someone shares a Lantern passage link in iMessage, WhatsApp, Slack, or
X, the unfurler that generates the preview card fetches the URL and reads
whatever HTML comes back **without running any JavaScript**. Today every
route — including a future `/read/john/1` from G4a — resolves to the same
`index.html`, whose `<head>` carries one fixed, site-level set of OpenGraph
tags ("Lantern — personal Bible study notes"). A shared passage link
therefore previews identically to the bare homepage: no verse reference, no
passage text, no reason to click. The same JS-blindness affects search
crawlers, to a lesser degree (Google's indexer does execute JS on a delay;
most other crawlers and virtually all unfurlers do not) — so this is really
two related but separable goals: rich previews on share, and indexability by
search engines. Both need the same underlying fix — real per-passage HTML —
so this brief treats them together but judges them separately in §5.

## 2. The constraint, grounded in the real setup

- **No SSR, no router.** `package.json` has no `react-router`/`wouter`/
  routing dependency of any kind, and `CLAUDE.md` states it plainly: "No
  framework, no router — the app is a single-page tree with view state in
  `App.tsx`." The app is a 100% client-rendered Vite SPA — everything at
  `#root` is empty until React mounts and runs.
- **Cloudflare Pages serves a SPA catch-all.** `public/_redirects`: `/*
  /index.html 200` — every path with no matching static file resolves to the
  same `index.html`. There is no per-route server response today, by design
  (see that file's own comments on why the catch-all exists and why the
  `/assets/*` 404 carve-out sits above it).
- **The existing OG meta is site-level only.** `index.html` already carries
  real `og:site_name`/`og:title`/`og:description`/`og:type`/`og:url` tags
  (added for OAuth branding-review reasons, per its inline comments) plus a
  visible, server-served `#app-fallback` block for crawlers/no-JS clients —
  but both are fixed strings about the app as a whole. Neither varies by
  route, and neither contains verse text. There is no per-passage meta
  anywhere in the codebase today.
- **Conclusion the acceptance criteria requires stating plainly: for a
  `/read/<book>/<chapter>` URL to preview or index correctly, the
  per-passage title, description, OpenGraph tags, and passage text must be
  present in the HTML the SERVER returns on first response** — not injected
  by React after mount, because unfurlers and most crawlers never get that
  far.

## 3. Licensing: which translation can appear in server-returned HTML

This reuses, and does not relitigate, `docs/proposals/translations-esv-niv.md`'s
already-settled findings:

- **BSB and KJV are public domain** — no cache cap, no attribution
  requirement, no restriction on embedding the text in server-rendered or
  statically-generated HTML. BSB additionally already exists as a complete,
  self-hosted static bundle (`public/bible/bsb.json.gz`, ~1.2 MB gzip, built
  by `scripts/build-bsb-bundle.mjs`, read by `src/bible/self-hosted.ts`) —
  the exact same asset an edge function or a build-time prerender step could
  read to produce passage text, with no new data source and no new
  licensing exposure.
- **ESV may NOT appear in any indexable or crawlable HTML.** Crossway's terms
  (per that proposal) cap local storage at 500 verses/half a book, forbid
  the key from being embedded client-side, and — most relevant here — the
  terms govern *display*, not just storage; publishing ESV text into HTML
  that search engines crawl and cache indefinitely is a materially different
  and riskier act than rendering it behind a live, revocable API call inside
  a signed-in session. There is no ESV self-hosted bundle (per that proposal,
  ESV's terms categorically forbid one), so there is no data source to build
  this from even if it were licensed.
- **Consequence for scope: every server/edge-rendered passage page in this
  brief is BSB or KJV only.** If a guest or shared link is currently viewing
  an ESV passage (guest mode is BSB/KJV-only today per G1's boundary in
  `docs/BACKLOG.md`, so this mostly cannot occur yet, but it is worth stating
  for when ESV reaches guests), the edge layer falls back to BSB for the
  crawler/unfurler response while the live app continues to honor the user's
  actual translation choice for humans.

## 4. Options evaluated

### (a) Cloudflare Pages Function intercepting `/read/*`

A Pages Function at `functions/read/[book]/[chapter].ts` (Cloudflare's file-based
routing — no `functions/` directory exists in this repo yet, so this is new,
additive infrastructure, not a change to `vite.config.ts` or the build) runs
*before* the SPA catch-all for matching paths, on Cloudflare's edge, with no
origin server to run or pay for. It can:

1. Parse `book`/`chapter` from the path (reusing the same
   `src/utils/bibleBooks.ts` book-name/number mapping G4a's client parser
   uses — the slug shape, e.g. `/read/john/1`, is already the one
   `docs/proposals/guest-preview-mode.md` §7 designed G4a's route around).
2. User-agent sniff: known bot/unfurler UAs (`facebookexternalhit`,
   `Twitterbot`, `Slackbot`, `WhatsApp`, `Discordbot`, `googlebot`, etc. — a
   short, maintainable allowlist, not an attempt to catch every crawler ever)
   get a full server-rendered HTML response with per-passage `<title>`,
   `<meta name="description">`, `og:title`/`og:description`/`og:type=article`,
   Twitter card tags, and the chapter's verse text (fetched from the same
   `bsb.json.gz` bundle, or an equivalent small edge-side dataset — see
   Effort below). Everyone else (real browsers) gets the ordinary SPA
   response, untouched.
3. This is the "serve humans the SPA, crawlers and unfurlers the meta"
   pattern named in the acceptance criteria — dynamic rendering, a
   long-standing, Google-sanctioned technique for exactly this SPA-meta
   problem (not a cloaking violation, because the *content* served to bots
   matches what a human would eventually see after JS runs — only the
   render timing differs).

**Effort:** small. One new function file, a UA-sniff allowlist, and a way to
get chapter text at the edge — the simplest version fetches
`/bible/bsb.json.gz` from the same Pages deployment inside the function
(one HTTP round-trip on Cloudflare's own network) and reuses the existing
gzip-sniffing decompression logic `self-hosted.ts` already has, ported to
the Functions runtime. No new build pipeline, no new hosting, no framework.

**Correctness:** high. Every one of the 1,189 chapters is served identically
whether requested directly or discovered via crawl, with zero drift risk
between "what the function returns" and "what changes when content changes"
— there is no separate generated-content step to go stale, because the
function reads the same live bundle the app itself reads.

**Fit:** excellent. This is the only option that adds nothing to the build
step, touches no existing SPA code, and matches "keep it boring" — it is
pure edge routing, additive and fully reversible (delete the function,
behavior reverts to today's catch-all).

### (b) Build-time static prerendering of ~1,189 chapter pages

Generate a static HTML file per chapter (`/read/john/1/index.html`, etc.) at
build time, each with its own meta + passage text baked in, served as plain
static files ahead of the SPA catch-all (Cloudflare serves real static files
before consulting `_redirects`, exactly as `public/_redirects`' own comments
already document for `/privacy`/`/terms`).

**Effort:** moderate-to-large. Needs a new build script (in the spirit of
`scripts/build-bsb-bundle.mjs`, but generating ~1,189 small HTML files, not
one bundle), a template for the per-chapter shell (title/meta/verse text +
either a redirect-to-app or a minimal inline "open in Lantern" link for human
visitors who land here directly), and a step wired into `npm run build` or a
separate CI job. Every future book/chapter-count or template change requires
a rebuild+redeploy of all 1,189 files, not just a code change — the
website's HTML is now a build artifact, not just the app's chunks.

**Correctness:** good but with a real staleness edge: if a Pages Function
gets book metadata by importing the same `bibleBooks.ts` the app uses, it
can never drift from a live source; a static site generation step reads the
same source at build time and is only as fresh as the last deploy, an
edge-case difference that matters here only if book/chapter data ever
changes at runtime (it does not today — scripture is immutable), so this
is a minor real cost, not a blocking one.

**Fit:** fair. It works and is a well-understood pattern (this is what
"SSG" tools do), but it is meaningfully more new surface area than (a) for
the same outcome — a real build step, ~1,189 new artifacts to reason about,
and a second place (build time, not request time) where the meta template
can drift from the live app's — for a stack whose explicit design principle
is "no framework nobody asked for."

### (c) Adopting an SSR or meta framework (Next.js, Astro, Remix, etc.)

Migrate the app (or a routing layer of it) onto a framework that renders
per-route HTML server-side or at request time by design.

**Effort:** very large, and out of proportion to the problem. This is a
framework migration, not a feature — it touches build tooling
(`vite.config.ts`), the router (introduces one where none exists today,
contradicting `CLAUDE.md`'s explicit "no router" design decision), the
deploy target (Cloudflare Pages supports several of these, but with new
constraints — e.g. Next.js on Pages requires the `@cloudflare/next-on-pages`
adapter and its own runtime limitations), and every future feature's mental
model going forward.

**Correctness/fit:** would solve the problem (and more), but is solving a
problem the app does not otherwise have — Lantern has no other page that
needs per-route server rendering, no data-fetching-waterfall problem, no
other SEO surface competing for this. Adopting a framework to fix one
metadata problem is the textbook case of the wrong tool for the job, and
directly contradicts this codebase's stated "plain Vite + React, no
framework" stance (`CLAUDE.md`).

**Verdict: reject.** Revisit only if Lantern independently decides it wants
broader SSR (faster first paint, more pages needing server logic) for
reasons that have nothing to do with link previews — never adopt a
framework migration to solve a metadata problem alone.

## 5. Honest SEO verdict — two different goals, judged separately

**Link previews when shared: high value, straightforwardly achievable.**
Option (a) directly fixes the actual complaint in this brief's business
context — someone shares a passage, the card that shows up in their
messaging app or social feed should look like a Bible passage, not a generic
app card. This is a small, bounded, mechanical fix with a clear, immediate
payoff every time a link is shared, independent of any search engine's
behavior.

**Ranking in search for verse queries: low realistic near-term value — do
not oversell this.** Indexing 1,189 pages does not mean ranking for
anything. Verse-lookup search ("john 3:16", "romans 8:28") is an extremely
saturated query space dominated by sites with over a decade of accumulated
domain authority, millions of backlinks, and purpose-built content depth —
BibleGateway, YouVersion/Bible.com, Bible Hub, Blue Letter Bible, and
Crossway's own ESV site foremost among them. A brand-new domain
(`lanternword.com`) with 1,189 thin, near-identical-in-substance pages
(the verse text itself is not unique content — it's the same public-domain
BSB/KJV text every other site with a public-domain translation can also
serve) has essentially no realistic path to ranking above those
incumbents for a generic verse query in any near-term horizon. Google's own
guidance treats "thin content, freely available elsewhere" as a
quality signal to actively rank down, not up. This is not a reason to skip
indexing — it costs nothing once (a) exists, and it's correct hygiene
regardless — but Dennis should not expect organic verse-search traffic to
materialize, and this brief explicitly does not promise it.

## 6. Indexing hygiene: sitemap, robots, canonical — low-effort, do this too

These pair naturally with (a) and are cheap regardless of the ranking
verdict above:

- **`sitemap.xml`**: a static file (generated by the same small script that
  could serve `functions/read/*`'s book/chapter data, or hand-written once
  and regenerated only if book/chapter counts ever change — they don't) listing
  all 1,189 `/read/<book>/<chapter>` URLs. Served as a plain static file from
  `public/`, which Cloudflare Pages serves ahead of the SPA catch-all with no
  function involved.
- **`robots.txt`**: currently absent from `public/` — add one explicitly
  allowing `/read/` and disallowing app-only routes that have no business
  being indexed (account/settings/study views, whatever G4a does *not* make a
  public URL). Point it at `sitemap.xml`.
- **Canonical URLs**: each `/read/<book>/<chapter>` response from (a) should
  include `<link rel="canonical" href="https://lanternword.com/read/<book>/<chapter>">`,
  so search engines never treat trailing slashes, alternate casing, or any
  future alias as duplicate content competing with itself.

## 7. Relationship to G4a

This brief is strictly additive on top of G4a, not a substitute for it. G4a
(`docs/BACKLOG.md`) ships the client-side route parser — `/read/<book>/<chapter>`
resolves to the same `bookName`/`chapter` shape `BookDetailPage` already
takes, on-load parsing only, no `pushState`-as-you-browse for v1. This brief
assumes those URLs exist and are shareable, and adds the layer that makes
them preview and index correctly for non-browser requests. If G4a's URL
shape changes (e.g. numeric book IDs instead of name slugs), the Pages
Function's path parsing (§4a) needs to match it exactly — this is a real
coupling to keep in sync, not a detail to lose track of when G4a lands.

## 8. Recommendation, smallest slice, and what to defer

**Build:** option (a), the Pages Function, scoped to exactly:

1. `functions/read/[book]/[chapter].ts` — UA-sniff, parse path via
   `bibleBooks.ts`, fetch+decompress `bsb.json.gz` (or KJV once it exists),
   return HTML with per-passage title/description/OG/Twitter meta + verse
   text + canonical link for matched bot UAs; fall through to the SPA for
   everyone else.
2. A static `public/robots.txt` + a generated `public/sitemap.xml` (or a
   small script run once, since the 1,189-URL set only changes if
   book/chapter counts ever change, which they don't).

This is the smallest slice that satisfies the actual business complaint
(good previews on share) plus the cheap hygiene that costs nothing extra
once (a) exists.

**Defer:**
- Option (b) or (c) — no trigger justifies the larger cost today; see their
  own verdicts above.
- Any promise or measurement of search-ranking uplift — there is no metric
  here worth setting a target against (§5).
- ESV in any server/edge-rendered path — stays fully blocked per §3 until
  Crossway's terms or Lantern's ESV distribution model change.
- `pushState`-as-you-browse and any richer client routing — that is G4a's
  scope, not this brief's.

## Trigger to revisit

- **Build (a) now if wanted** — it's small, additive, reversible, and
  directly serves the sharing use case named in the business context; no
  blocker beyond G4a landing first so there's a real URL shape to intercept.
- **Revisit option (b)** only if Lantern ever needs prerendered pages for a
  reason beyond crawlers/unfurlers (e.g. a real, measured organic-search
  traffic ambition that justifies the added build-step maintenance) — do not
  build it speculatively ahead of that.
- **Revisit option (c)** only if SSR becomes wanted for reasons unrelated to
  this brief entirely (broader performance or architecture goals) — never
  adopt a framework to solve a metadata problem alone.
- **Revisit the SEO-ranking verdict in §5** only if `lanternword.com`
  accumulates real domain authority (backlinks, brand search volume) over a
  multi-year horizon — nothing in this brief's near-term scope changes that.

## Files/sources read for this brief

Codebase (read-only, no edits): `CLAUDE.md`, `public/_redirects`,
`public/_headers`, `index.html`, `package.json`, `src/utils/bibleBooks.ts`,
`src/bible/self-hosted.ts`, `docs/proposals/translations-esv-niv.md`,
`docs/proposals/guest-preview-mode.md` (§7, the G4a route design),
`docs/proposals/scripture-search.md` (style/precedent for reusing the
self-hosted BSB bundle), `docs/BACKLOG.md` (G1–G4a guest-preview thread).
No external sources were fetched for this brief; the SEO/dynamic-rendering
and Cloudflare Pages Functions claims above reflect well-established,
widely-documented platform behavior (Google's own dynamic-rendering
guidance; Cloudflare Pages Functions' file-based routing and static-file-
before-function precedence, the latter already relied on and documented by
`public/_redirects` in this repo) rather than a specific fetched source.
