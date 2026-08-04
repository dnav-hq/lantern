# Shareable passage cards — verse (+ note) shares as beautiful link and image cards

Status: **research only, no application code.** This brief answers when and how
Lantern should let someone share a passage — optionally with their own note —
as a beautiful card, either as a rich link preview or a downloadable image, and
gives an honest verdict on whether that is worth building now.

## tl;dr

- **Do not compete on generic verse-on-a-gradient images.** YouVersion and a
  dozen other apps already own that category; a me-too verse-image generator
  adds no differentiation and is not what this brief recommends.
- **Lantern's real angle is the verse rendered together with the user's own
  note** — the read-notice-write loop this app is built around, made
  shareable. A share card that carries a genuine observation or reflection
  alongside the text is something a generic verse-image tool cannot produce,
  because it has no notes model at all.
- **Sharing a note is opt-in, per-share, explicit — never automatic, never a
  setting.** Notes are promised private (`public/privacy.html`, the landing
  copy); a share button must not quietly leak one.
- **Two modalities, two different technical shapes:** a LINK share (for
  chat/messaging apps) should fold into and upgrade G4b's edge-OG-image work
  so the beautiful card IS the OpenGraph preview, not a second system; an
  IMAGE share (for Instagram/stories, where links don't render) is a
  genuinely new, client-composed PNG surface.
- **Recommendation: demand-gated, build after G4a ships and there's real
  usage to share to** — not speculatively at today's tiny scale. Smallest
  worthwhile first slice: the link-share OG card via G4b, then the PNG
  composer. See [§8](#8-recommendation-smallest-slice-and-what-to-defer).

## 1. The problem

The business context is right that word-of-mouth sharing is how apps like
this grow, and that people already share Bible verses as images and links
constantly — it is one of the most common ways scripture apps get discovered.
But "let people share verses" undersells what would actually make a Lantern
share distinctive. A verse rendered alone, on a gradient, with a citation, is
a commodity: YouVersion's Verse of the Day images, Bible.com's share sheet,
and a long tail of verse-image generators and Instagram accounts have already
saturated that exact visual format. Shipping another one would not make
someone reach for Lantern specifically — it would make Lantern indistinguishable
from every other Bible app's share button.

What no generic verse-image tool can do is show the verse **together with a
real person's own observation or reflection on it**, because none of them
have a notes model. That is Lantern's actual product: read a passage, notice
something in it, write it down. A share feature earns its place only if it
makes *that* loop visible and shareable, not if it re-implements a category
Lantern has no advantage in.

## 2. Differentiation: centre the note, not the verse-image

**The card this brief centres is: reference + verse text + (optionally) the
user's own note, styled distinctly Lantern.** A verse-only card should still
exist — plenty of shares will be "just this verse struck me," with no note
attached, and that has to work trivially (see §3) — but it is the fallback,
not the feature. The feature is the note.

Concretely, this means:

- The share entry point lives where a note already exists (a note card, a
  session), not just as a generic "share this chapter" action bloated onto
  every verse.
- When a note is attached, the card visually distinguishes it from the verse
  text — e.g. the verse in the app's serif reading type, the note in a
  distinct treatment carrying its category colour (`--cat-observation`,
  `--cat-historical`, `--cat-application`, `--cat-personal`, already defined
  in `src/assets/tokens.css` and used throughout the reading/journal UI) —
  so the card reads as "here's a passage, and here's what I saw in it,"
  not as generic decorated scripture.
- Copy and design language around the feature (in-app labels, any future
  marketing) should say this explicitly: not "share a verse" but "share what
  you noticed."

This is also why this brief does not propose a bulk "verse of the day" share
surface, a random-verse generator, or any feature whose output is
indistinguishable from a generic Bible app's. Those compete in a category
Lantern has no structural advantage in; a note-carrying card competes in one
only Lantern (among apps with this exact read-notice-write model) can make.

## 3. The note-privacy tension

Lantern promises notes stay private — the landing page says so directly
("Nothing to buy. Your notes stay private to you.",
`src/components/landing/Landing.tsx`) and `public/privacy.html` states the app
"does not record what you read, what you write, or which passages" reach any
third party. A share feature that makes a note public, even opt-in, sits in
real tension with that promise if the design is careless about it. The brief
resolves this with one rule, applied everywhere the feature touches:

- **Sharing a note is an explicit, per-share, deliberate action — never
  automatic and never a blanket setting.** There is no "make my notes
  shareable by default" toggle in Settings, no ambient state that changes
  future behaviour, and no bulk "share all my notes on this passage." Every
  share of a note-bearing card is its own decision, made at the moment of
  sharing, scoped to exactly that note and that share action.
- **The share action for a note-carrying card is framed as "share this one
  publicly"** — language that makes the act, and its scope, obvious in the
  moment, not a generic "Share" button that happens to also expose private
  content. A verse-only share (no note) needs no such framing; it was never
  private in the first place, since scripture text itself carries no privacy
  promise.
- **Once shared, the resulting artifact (image or link) is a snapshot**, not
  a live view into the note. Editing or deleting the note afterward must not
  retroactively change or invalidate an already-generated image (it's a
  downloaded/posted file, this is automatic) or, for the link modality,
  should stop resolving the note content if the user later deletes it — this
  needs a real decision at build time (does the OG card fetch the note live,
  or does the underlying link expire when the note is gone?) rather than an
  assumption here; flagged as an open question for the build-time design
  pass, not resolved by this brief.
- **No new data leaves the app's existing trust boundary.** Both share
  modalities described below (§4) render entirely from data the signed-in
  user already owns and already sees in the app; nothing about this feature
  needs a third-party image-generation service, an analytics pixel, or a
  public gallery of shared cards. The privacy page's existing claims should
  not need a paragraph rewritten so much as one line added describing the
  share feature's existence and its opt-in nature, at build time, per
  `docs/proposals/*` precedent for touching `public/privacy.html` alongside
  any change to what leaves the app.

Where this leaves an open design question rather than a settled answer (the
live-vs-snapshot link question above), this brief says so rather than
pretending it is resolved — that is a build-time decision, not a proposal-time
one, but it must not be missed.

## 4. Two modalities, two different technical shapes

The business context conflates "link" and "image" as though they're the same
feature with two outputs. They are not — they solve different sharing
contexts and have genuinely different technical requirements.

### (1) LINK share — for messaging and chat apps

This is what a `lanternword.com/read/john/3` link becomes when pasted into
iMessage, WhatsApp, Slack, or X: the unfurler fetches the URL and renders
whatever preview card the OpenGraph tags describe. G4a
(`docs/BACKLOG.md`) already ships the deep-linkable route; G4b
(`docs/proposals/guest-deep-link-seo.md`) already designs the edge layer that
gives that route real per-passage OG meta and text, via a Cloudflare Pages
Function intercepting `/read/*` for crawler/unfurler user agents, reading the
self-hosted BSB bundle.

**This brief's recommendation: fold the beautiful-card work into and upgrade
G4b, rather than building a second, separate preview-image system.** G4b as
written returns HTML meta (title/description/OG tags) — it does not yet
specify an `og:image`. The natural upgrade is for that same Pages Function to
also generate (or point to) a rendered image for `og:image`, produced by an
edge image renderer in the satori/resvg family (SVG-to-PNG at the edge,
Cloudflare-compatible, no headless browser needed) using the same passage
data the function already fetches. The result: one system, not two — the
function that makes a `/read/<book>/<chapter>` link preview correctly *is*
the function that makes it preview *beautifully*, and the two pieces of work
(crawlable meta text, and an attractive image) ship together rather than as
separate systems that can drift out of sync.

For a note-carrying share (§2/§3), the link needs a distinct URL from the
bare passage route — the plain `/read/<book>/<chapter>` deep link must keep
meaning exactly what G4a defined (open this passage), not silently start
carrying someone's private note. The natural shape is a separate,
share-specific path or query parameter (e.g. something like
`/read/john/3?share=<share-id>` or a dedicated `/share/<share-id>` route) that
the edge function recognizes and renders differently — this is a build-time
routing decision, not specified further here, except to say it must not
overload the existing passage route's meaning.

### (2) IMAGE share — for platforms where links don't render

Instagram (feed and stories), and any context where a pasted link shows as
plain unstyled text rather than unfurling, need an actual downloadable image
file, not a URL. This is the genuinely new surface this brief adds — nothing
in G4a/G4b produces a downloadable asset today.

Two implementation shapes, both viable, evaluated at concept level (the real
design/engineering pass happens at build time, not here):

- **Client-side composition** (canvas, or an SVG-to-PNG/html-to-image
  approach) — render the card entirely in the browser from data already in
  memory (the passage text, the note if included) and let the user download
  or share the resulting PNG via the Web Share API where available. No new
  server infrastructure; works offline once the passage/note are loaded;
  matches the SPA's existing "no backend beyond Supabase + the two edge
  functions" shape.
- **Edge-rendered** — reuse the same satori/resvg-style renderer G4b's
  `og:image` upgrade would already need (§4.1), giving the user a direct
  download link to a server-rendered PNG instead of composing it in-browser.
  Consistent visual output across every device (no font-rendering/canvas
  quirks across browsers), and reuses one rendering pipeline instead of two,
  at the cost of a network round-trip the client-side option doesn't need.

Both are reasonable; this brief does not pick one, since the choice should
follow from whichever G4b's `og:image` renderer turns out to look like once
built — if that renderer exists and is reusable, edge-rendering the IMAGE
modality from the same pipeline is the more consistent outcome and avoids a
second rendering implementation. If it doesn't (e.g. if G4b's OG image ends
up being a much simpler static template than what a note-carrying card
needs), client-side composition is the lower-cost path. Flagged as a
build-time decision, not a proposal-time one.

## 5. Grounded in the real stack

- **Client-rendered Vite SPA, no SSR, on Cloudflare Pages.** Confirmed:
  `CLAUDE.md` states "No framework, no router — the app is a single-page
  tree with view state in `App.tsx`," and G4b's own research (already
  verified against `public/_redirects`, `index.html`) establishes that every
  route resolves to the same `index.html` client-side, with no per-route
  server response today except what a Pages Function adds. Both share
  modalities here are additive to that shape — a Pages Function (§4.1) and
  either client-side canvas work or another Pages Function (§4.2) — neither
  needs a router, SSR, or a framework migration.
- **Scripture text source: the self-hosted BSB bundle.** Confirmed:
  `public/bible/bsb.json.gz` exists (built by `scripts/build-bsb-bundle.mjs`,
  read by `src/bible/self-hosted.ts`), and G4b already established this as
  the edge-side data source for passage text with no new licensing exposure.
  Both share modalities in this brief read from the same bundle — no new
  data source needed.
- **ESV must never appear in a shared or rendered artifact.** Confirmed
  against `docs/proposals/translations-esv-niv.md`: Crossway's terms cap
  local storage/display, forbid embedding the API key client-side, and — the
  clause that matters most here — govern *display*, not just storage, making
  publishing ESV text into a durably-cached, publicly-fetchable OG image or a
  downloadable PNG a materially riskier act than rendering it behind a live,
  revocable, signed-in API call. There is also no self-hosted ESV bundle to
  build an edge renderer from even if licensing allowed it. **Consequence:
  every card this brief describes — link preview or downloadable image — is
  BSB or KJV only, matching G4b's existing scope restriction exactly.** If a
  user is reading in ESV when they tap share, the card falls back to BSB for
  the rendered artifact, the same pattern G4b already specifies for the edge
  meta layer.
- **Depends on and references G4a and G4b, does not duplicate them.** G4a
  (routing) and G4b (edge OG/crawlable HTML) are prerequisites, not
  alternatives, to this brief. Everything in §4.1 is explicitly scoped as an
  *upgrade* to G4b's Pages Function, sharing its user-agent handling, its
  path parsing (`bibleBooks.ts`), and its BSB-bundle data source — not a
  parallel implementation.

## 6. The card, at a concept level

What it contains, without over-designing the actual visual pass (that
happens at build time, informed by real design tooling, not prose here):

- **The reference** (e.g. "Romans 8:28") as the card's clear anchor —
  large, legible, unmistakable at a glance in a chat thread or a story feed.
- **The verse text**, set in the app's existing serif reading typeface (F2,
  already shipped per `docs/BACKLOG.md`'s design-sweep history) — the same
  type a Lantern user already associates with reading scripture in the app,
  so the card looks like it came from Lantern specifically, not a generic
  template.
- **The note, when included**, visually distinct from the verse (§2) and
  carrying its category's colour token, so even someone who has never used
  Lantern can tell at a glance "this part is scripture, this part is a
  person's reflection on it" — the shareable version of the same
  observation/historical/application/personal distinction the app already
  makes everywhere else.
- **A small Lantern wordmark** — per `src/components/Wordmark.tsx`'s own
  documented reasoning, the brand identity is wordmark-only (every pictorial
  mark was rejected), so the card should carry the wordmark, not invent a
  new pictorial share-specific logo.
- **Light and dark variants**, following the app's existing token-driven
  theming (`--bg`/`--accent`/category tokens already vary per theme in
  `src/assets/tokens.css`) — a card generated from a dark-mode reader's
  session should not force cream-and-indigo on someone who reads in dark
  mode, and vice versa. Whether the share action lets the user pick, or it
  simply follows their current in-app theme, is a build-time UX call.
- **One or two template directions, not a library of them** — e.g. a
  "verse-only" minimal layout and a "verse + note" layout — rather than a
  configurable template gallery. A gallery is exactly the kind of scope this
  brief's honest-verdict section (§7) argues against building speculatively;
  ship the two shapes the actual use cases need, expand only if real usage
  asks for more.

The card should read as unmistakably Lantern's cream/serif/indigo (or the
user's chosen theme's equivalent) design language — not a generic
Bible-verse-image aesthetic (heavy gradients, stock nature photography,
decorative script fonts) that could have come from any app.

## 7. URL strategy: readable links, no shortener

Consistent with G4a's plain `/read/<book>/<chapter>` shape and G4b's
canonical-URL design, this brief recommends **readable deep links over an
opaque URL shortener**, for the same reasons that already govern the rest of
the routing:

- **Trust and readability matter more than brevity for a scripture link.**
  Someone deciding whether to tap a link in a text message benefits from
  seeing `lanternword.com/read/romans/8` (or its share-specific equivalent,
  §4.1) rather than an opaque `lantern.link/x7K2p` that reveals nothing about
  the destination and looks, to a wary recipient, indistinguishable from a
  phishing link.
- **A shortener is real, ongoing redirect infrastructure for negative
  aesthetic value.** It would need its own routing table, its own edge
  function or worker, collision handling, and a second URL scheme to keep in
  sync with G4a's route shape — solving a length problem Lantern's URLs
  (already short — book names and chapter numbers, not UUIDs) don't
  meaningfully have.
- **This brief does not propose building shortener infrastructure.** Any
  share-specific path (`/share/<share-id>` or similar, §4.1) should still be
  a plain, readable Lantern-hosted route, not routed through a third-party or
  home-grown shortener.

## 8. Recommendation, smallest slice, and what to defer

**Honest verdict on timing: this is demand-gated, net-new surface — build it
after G4a lands and there's real usage to share to, not speculatively at
today's tiny scale.** Sharing is a genuine growth lever in the abstract, but
a share feature's value is proportional to how many people are already using
the app to have something worth sharing; building an elaborate card renderer
ahead of that is solving for an audience that doesn't exist yet. G4a has
shipped (per `docs/BACKLOG.md`, 2026-08-03); G4b (the edge OG layer this
brief's link modality depends on) has not started. This brief's own §4.1
recommendation depends on G4b existing first.

**Smallest worthwhile first slice**, in order:

1. **Ship G4b first** (already proposed, not started) — it is a prerequisite
   for this brief's link modality regardless of whether the image work in
   §4.2 is ever built, and it has value (real link previews) independent of
   the note-sharing angle this brief adds.
2. **Upgrade G4b's Pages Function with an `og:image` renderer** (§4.1) —
   the smallest version of "beautiful," verse-only, no note yet, no
   share-specific route yet — just making the existing `/read/*` preview
   visually distinctive instead of a generic OG card. This alone captures
   most of the link-share value with the least new surface.
3. **Add the note-carrying share path** (§2/§3/§4.1's share-specific route)
   once (2) exists and there is a real "I want to share what I noticed"
   signal from actual usage — this is where the genuine differentiation
   lives, but it is also the piece with the most design and privacy
   surface (the opt-in framing, the snapshot-vs-live question in §3), so it
   should follow proof that people want to share at all.
4. **The PNG composer for Instagram/stories** (§4.2) — genuinely new
   surface with no G4a/G4b prerequisite satisfied by anything already
   proposed; build last, once link-sharing usage shows the demand
   (Instagram/stories-shaped sharing is a distinct, secondary use case from
   messaging-app link sharing, and worth confirming demand for separately).

**Defer:**

- A verse-image "template gallery" or multiple visual styles (§6) — ship the
  one or two directions that cover verse-only and verse+note, expand only on
  real request.
- Any live-updating share link that reflects note edits after the fact — the
  snapshot-vs-live question in §3 needs a real answer, but building the more
  complex "live" version speculatively is exactly the premature scope this
  brief argues against elsewhere.
- A public gallery, feed, or discovery surface for shared cards — nothing in
  the business context asks for this, and it would be a materially larger
  privacy and moderation surface than a one-off share action.
- NIV/ESV in any shared artifact — stays blocked per §5 until Crossway's (or
  a future NIV provider's) terms change, same as G4b.
- URL-shortener infrastructure — not proposed, not needed (§7).

## Trigger to revisit

- **Build the G4b `og:image` upgrade (§4.1, step 2 above)** once G4b itself
  ships — no additional trigger needed beyond that; it is a small,
  additive extension of already-approved work.
- **Build the note-carrying share path (§2/§3, step 3)** once there is
  real usage — active note-taking users, not just readers — to make a share
  feature meaningful, or once Dennis specifically wants to test whether
  sharing drives growth. Do not build ahead of that signal.
- **Build the PNG composer (§4.2, step 4)** once link-sharing (steps 2-3) is
  live and either shows real usage that would extend naturally to
  Instagram/stories, or a specific want is expressed for that surface. Do
  not build it in parallel with steps 2-3 speculatively.
- **Revisit the shortener decision (§7)** only if Lantern's URL shape
  changes in a way that makes links meaningfully long or hard to read (e.g.
  a share-id scheme that isn't human-legible) — not expected given the
  plain routes G4a/G4b already use.

## Files/sources read for this brief

Codebase (read-only, no edits): `CLAUDE.md`, `docs/BACKLOG.md` (G1-G4b guest
preview thread, design-sweep/category-colour history), `docs/proposals/
guest-deep-link-seo.md` (G4b, the edge-OG-image design this brief upgrades),
`docs/proposals/translations-esv-niv.md` (ESV/BSB/KJV licensing), `public/
privacy.html`, `src/components/landing/Landing.tsx` (the "notes stay private"
copy), `src/bible/self-hosted.ts` (the BSB bundle), `src/assets/tokens.css`
(brand colours, category tokens, light/dark theme variants),
`src/components/Wordmark.tsx` (wordmark-only brand decision — read for its
stated reasoning, not reproduced here). No external sources were fetched for
this brief; the satori/resvg edge-image-rendering reference reflects
well-established, widely-documented Cloudflare Workers/Pages ecosystem
practice (SVG-to-PNG rendering without a headless browser) rather than a
specific fetched source, consistent with how G4b cited the equivalent
Cloudflare Pages Functions platform behavior.
