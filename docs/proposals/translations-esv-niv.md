# ESV & NIV translations — licensing reality + implementation path

Status: **research only, no application code.** This document answers the
brief: for ESV, NIV, and KJV (the zero-friction comparison), what the
*current* licensing terms actually say, verified against primary sources
rather than assumed — and what it would cost `BibleProvider` to host any of
them alongside the cache-forever, self-hosted-fallback BSB setup that only
works today because BSB is public domain.

## tl;dr

- **The gating question is licensing, not engineering, and the terms are
  less generous than "there's an API" implies.** ESV and NIV both cap how
  much text you may cache locally and forbid the self-hosted offline
  fallback outright — both pillars of Lantern's current scripture
  architecture (`docs/BACKLOG.md`'s "Full-Bible offline prefetch" and the
  shipped self-hosted BSB fallback) are legal *only* because BSB is public
  domain.
- **The backlog's open question is resolved: the ESV API is ONE
  application-level key, not per-user keys.** Crossway's own docs and terms
  say requests are authenticated per *application* (`api.esv.org/account/`
  → "Create an API application"), rate limits are enforced per application/
  organization, and the key must not be shared or published — the "User-key
  ESV provider" backlog item's premise ("licensing requires per-user keys")
  is wrong and should be corrected.
- **NIV is real but the worst fit of the three.** A free, non-commercial API
  path exists (API.Bible / American Bible Society), correcting this brief's
  own steelman ("NIV likely has no free public API") — but Biblica's terms
  layer a heavier, more subjective review on top of price, commercial use is
  blocked outright with no published unlock price, and it's genuinely
  unclear whether a full Bible-reading app is even the "quotation" use case
  Biblica's blanket permission was written for.
- **KJV has zero licensing friction**, identical in kind to BSB (public
  domain in the US) — it is a "when wanted" ship, not a "can we" question.
- **Recommendation, in order: KJV now if wanted, ESV as a real second
  translation with bounded new engineering, NIV not now** — see
  [Recommendation](#4-recommendation).

## 1. Licensing reality per translation (as checked 2026-07-22)

### KJV — zero friction (the comparison baseline)

The 1611 King James Version is public domain in the United States and most
of the world; only the United Kingdom carries a standing exception (perpetual
Crown copyright administered by Cambridge University Press, Oxford
University Press, and Collins as the Letters-Patent holders, allowing "a
maximum of five hundred (500) verses for liturgical and non-commercial
educational use" without permission inside the UK) — a restriction that has
no effect outside the UK and that Lantern, a US-hosted app with no
UK-specific distribution, is not subject to
([sellingjesus.org/articles/kjv](https://sellingjesus.org/articles/kjv), as
checked 2026-07-22). One caveat that matters if a *specific* KJV text file is
ever sourced: annotated/study editions (added notes, cross-references,
reformatted paragraphing) can carry their own derivative-work copyright even
where the base 1611 text doesn't — so the bare text (no apparatus) is the
only part guaranteed public domain, exactly the same caveat BSB already
navigates by shipping plain verse text with no commentary.

**Verdict: identical legal shape to BSB.** No API key, no attribution
requirement, no cache cap, no rate limit, and a self-hosted static bundle
(the same pattern `scripts/build-bsb-bundle.mjs` + `self-hosted.ts` already
proves) is fully legal.

### ESV — free, single application key, hard caps

Source: [api.esv.org/docs/](https://api.esv.org/docs/),
[api.esv.org](https://api.esv.org/) (terms of use),
[esv.org/about/terms/](https://www.esv.org/about/terms/),
[esv.org/account/register/](https://www.esv.org/account/register/) — all as
checked 2026-07-22.

| Question | Answer |
|---|---|
| Legally displayable in a free, non-commercial, single-operator app | **Yes.** "Crossway allows you to access the ESV Bible text from our server and include it on your website or app, free of charge for non-commercial use." |
| Per-application vs per-user keys | **Per-application.** You register one "API application" at `api.esv.org/account/`; the key authenticates that application, not individual end users. This is the backlog's open question, resolved. |
| Approval step | Account creation is self-serve, but the application itself is subject to staff review before a key is issued — not instant, but not a negotiated commercial contract either. |
| Cached/stored locally | **Capped, not unlimited.** Up to 500 verses, or half of any one book of the Bible, whichever is smaller — stated as a *storage* limit, distinct from the per-query cap below. |
| Verse-count cap per query | Same ceiling: max 500 verses or half a book per request/page. |
| Attribution | Required on every quotation: the letters "ESV," a link to `www.esv.org`, plus a dedicated copyright-notice page ("Scripture quotations are from the ESV® Bible... © 2001 by Crossway..."). |
| Rate/quota limits | 5,000 queries/day, 1,000/hour, 60/minute — enforced **per application**, i.e. shared across every Lantern user simultaneously, not a budget each user gets individually. |
| Cost / commercial path | Free tier covers non-commercial use as described above. Exceeding the guidelines (e.g., wanting the caps lifted) requires a separate, formally negotiated license, and Crossway's own language for that tier explicitly distinguishes "organizations" from "individuals or solo developers" — the expanded tier is not realistically available to a single-operator app; the free self-serve tier is the only path that fits Lantern. |
| Key handling | The key "may not be sold, shared, or published" — it cannot ship inside client-side code; it has to sit behind a server Lantern controls. |

**Verdict: viable.** The terms are restrictive but knowable, self-serve, and
compatible with what Lantern is today (free, non-commercial, one operator).

### NIV — a free tier exists, but it's the worst fit of the three

Source: [biblica.com/permissions/](https://www.biblica.com/permissions/) and
the [Biblica NIV-quotation
FAQ](https://www.biblica.com/resources/bible-faqs/do-i-have-to-notify-biblica-to-use-a-bible-verse-from-the-niv/)
(both fetched via search-engine cache — direct requests to `biblica.com`
returned HTTP 403 from this runner; content below is corroborated across
multiple independent search results, not a single unverified snippet), and
[docs.api.bible/your-account/plans-pricing/](https://docs.api.bible/your-account/plans-pricing/)
/
[docs.api.bible/guides/bibles/](https://docs.api.bible/guides/bibles/) (API.Bible,
the American Bible Society's platform) — all as checked 2026-07-22.

| Question | Answer |
|---|---|
| Legally displayable in a free, non-commercial, single-operator app | **Conditionally yes, but narrower than it looks.** Biblica's own blanket permission lets anyone quote up to 500 verses / under 25% of a work / not a whole book, *without* applying — but that's written for quoting NIV text **inside another work** (an article, a sermon, a book), not for building an app whose entire purpose is serving the complete translation across every book, which is what a Bible-reading app structurally does over time. It is genuinely unclear the blanket grant covers Lantern's actual usage pattern; API.Bible is the documented app-shaped path instead (below). |
| Free API path | **Yes — this brief's own steelman ("NIV likely has no free public API") was wrong and is corrected here.** API.Bible's free Starter plan lets a non-commercial app choose up to 3 licensed Bibles (NIV can be one) alongside hundreds of open-access translations, at 500 verses/query and 5,000 queries/day. |
| Per-application vs per-user keys | Per-application, same shape as ESV (a single API key authenticates the registered app). |
| Cached/stored locally, verse-count cap | The 500-verse **per-query** cap is documented; **no explicit local-storage/caching cap distinct from that figure was found** for API.Bible, unlike ESV's explicit separate storage limit. Treat the per-query figure as the presumptive ceiling for planning purposes, but confirm the actual storage clause in API.Bible's full Terms of Service before writing a cache design against it — this brief did not locate that clause and is not asserting one. |
| Attribution | "Scripture quotations taken from The Holy Bible, New International Version® NIV® Copyright © 1973 1978 1984 2011 by Biblica, Inc.™ Used by permission," required on the title/copyright page (a lighter "(NIV)" tag suffices only for non-saleable church materials, which doesn't describe a public web/app product). |
| Rate/quota limits | 5,000 queries/day on the free Starter tier (same order of magnitude as ESV). |
| Cost / commercial path | **Blocked outright, not just gated by price.** "NIV commercial use is not available" through API.Bible at any tier — other copyrighted translations there can be licensed commercially from $10/month, but NIV is carved out entirely. Any future commercial use of NIV would require a separate, direct, negotiated agreement with Biblica, with no published price or self-serve process. |
| Approval step | Heavier than ESV's. Beyond simple API signup, Biblica's own permissions language for its content generally references conditions around "intellectual property protection, theological integrity, security safeguards, human oversight, permissible functionality" — a subjective, content-review-flavored bar, not just a rate-limit-and-attribution checklist. |

**Verdict up front (the brief's required honest take): NIV is technically
obtainable for free today for a non-commercial app, but it is the worst
translation of the three to add.** It carries ESV's caps and per-application
key model *plus* a heavier and more subjective approval relationship with
its rights holder, a real ambiguity about whether "app" is even the licensed
use case, an unverified caching ceiling, and a hard, price-free wall the
moment Lantern ever charges for anything. See
[Recommendation](#4-recommendation) for what it would take to revisit.

## 2. The architecture collision

Lantern's current scripture stack (`src/bible/service.ts`) is:

```
production = FallbackBibleProvider(
  CachedBibleProvider(HelloaoBibleProvider()),   // cache-forever, IndexedDB
  SelfHostedBibleProvider()                       // complete BSB, static bundle, lazy fallback
)
```

Both halves of that composition are legal *only* because BSB is public
domain:

- **Cache-forever breaks on ESV, and presumptively on NIV.**
  `CachedBibleProvider` (`src/bible/cache.ts`) has no eviction — every
  chapter ever fetched is written to `berean-bible-cache` and kept forever,
  by design ("chapters are immutable, so once fetched they're cached
  forever"). ESV's terms cap local storage at 500 verses / half a book,
  full stop; a user who reads three or four chapters is already near that
  ceiling. NIV's per-query cap is the same order of magnitude and, absent a
  confirmed storage-specific clause, should be assumed at least as strict.
  A translation-aware cache needs a real eviction policy (LRU by
  translation, most likely) that does not exist today — BSB keeps
  unlimited growth, ESV/NIV cannot.
- **The self-hosted offline fallback is categorically impossible for
  copyrighted text.** `self-hosted.ts` exists because BSB is public domain —
  shipping the *entire* translation as a static build artifact
  (`public/bible/bsb.json.gz`) is exactly the mass-reproduction/distribution
  that ESV's and NIV's terms exist to prevent; there is no equivalent bundle
  strategy available for either. Concretely: **offline reading of ESV or NIV
  is license-blocked, not just unbuilt.** A helloao-equivalent outage or a
  genuinely offline user reading BSB today degrades gracefully (self-hosted
  fallback, or nothing if truly offline per the "Full-Bible offline
  prefetch" backlog item); the same failure for ESV/NIV has to fail outright
  with an honest message, because there is no fallback available to build.
- **`BibleProvider`'s interface itself needs to grow a translation
  dimension.** `provider.ts`'s `getChapter(bookNumber, chapter)` has no
  translation parameter today — the single hardcoded `TRANSLATION = 'BSB'`
  constant lives inside `cache.ts`, and `service.ts` wires exactly one fixed
  provider pipeline. Supporting a second translation means: (a)
  `getChapter` takes a translation argument; (b) `service.ts` becomes a
  per-translation lookup rather than one fixed composition — BSB keeps
  `FallbackBibleProvider(cache(helloao), selfHosted)` unchanged, while
  ESV/NIV get a narrower composition with no self-hosted stage and a
  quota-aware (evicting) cache instead of an unbounded one; (c) the ESV/NIV
  API key cannot live in client code (both terms forbid publishing/sharing
  it, and it's an application-level credential, not a per-user one) — this
  needs a small server-side proxy, following the precedent
  `supabase/functions/hq-telemetry` already set for keeping a secret out of
  the browser, which is new infrastructure `BibleProvider` doesn't need for
  BSB at all; (d) because the ~5,000/day rate limit is shared across every
  Lantern user (application-level, not per-user), the new provider needs an
  explicit degrade path — "translation temporarily unavailable, try BSB" —
  that nothing in the current stack needs, since helloao has no comparable
  shared ceiling.

## 3. Versification and the translation-switcher UX

**Verse-anchored notes mostly survive a translation switch, but not
perfectly.** KJV, ESV, NIV, and BSB all follow the same broad
English-Bible versification convention, so a note anchored to "John 3:16"
resolves to the same verse in any of them in the overwhelming majority of
cases. The known papercuts:

- **NIV keeps disputed-passage verse numbers rather than deleting them.**
  Mark 16:9–20 and John 7:53–8:11 (among others) are present with their
  traditional verse numbers but flagged as a footnoted/bracketed manuscript
  note rather than silently renumbered or omitted — so a `{verse, text}`
  chapter row exists for those verses in the NIV, but its *text* may need to
  represent "present but disputed" rather than plain body text. This is a
  UI/rendering nuance the current chapter view doesn't have, not a
  missing-data problem.
- **A verse a user's note is anchored to can be genuinely absent** from a
  different translation's chapter data (this is a real possibility across
  any two independently-versified sources, even if none of the three specific
  translations here are confirmed to drop a verse Lantern's BSB has). The
  note-rendering path needs a defined "not present in this translation"
  degrade — today's code has never needed one, because BSB has been the only
  translation.

**Translation-switcher UX, answered for the acceptance criteria:**

- **Default stays BSB.** Zero licensing risk, already the deep default, no
  reason to change it even once a second translation ships.
- **Selection scope: global, not per-passage.** Per-passage switching would
  multiply the quota/eviction/degrade complexity above *per open passage*
  for a capability nobody has asked for; a single global preference (like
  theme) is the only sane v1.
- **Storage: a new localStorage key alongside the existing
  `berean-theme`/`berean-visual-theme` pattern** (e.g. `berean-translation`),
  kept local-only (not synced through `BereanApi`/Supabase) initially,
  matching exactly how theme preference already works — there's no existing
  precedent or request for cross-device sync of this particular preference.

## 4. Recommendation

This is a stance, not a menu.

1. **KJV — ship whenever wanted, no blocker.** Same legal shape as BSB:
   public domain, no key, no cap, no attribution, self-hosted bundle works
   exactly like `bsb.json.gz` does today. This is the cheapest possible
   second `BibleProvider` and the backlog item's original framing already
   had this right.
2. **ESV — ship second, if/when Dennis wants a real second translation.**
   Genuinely viable for a free single-operator app: one self-serve
   application key (not per-user — correcting the backlog's premise),
   non-commercial use fits Lantern as it exists today, and the engineering
   cost, while real, is bounded and enumerated above (translation param on
   the seam, quota-aware evicting cache, server-side key proxy, shared-quota
   degrade path, no offline fallback). Not a small change, but a scoped one.
3. **NIV — do not build now.** Honest verdict: technically free and
   obtainable today via API.Bible for non-commercial use, but it is the
   worse translation to add on every axis that matters here — heavier and
   more subjective approval relationship with Biblica, real ambiguity about
   whether a reading app is even the licensed use case, an unconfirmed
   caching ceiling (so the architecture work above can't even be fully
   scoped yet), and a hard, priceless wall against ever monetizing anything
   while NIV is in the app. If it's ever wanted: (a) go directly to
   Biblica's permission-request process (not just API.Bible self-serve
   signup) and get written confirmation that a full Bible-reading PWA is a
   "permissible functionality" under their terms, since the blanket
   quotation grant doesn't obviously cover it; (b) get an explicit answer on
   local/offline storage limits before designing a cache against them; (c)
   accept, going in, that NIV is permanently non-commercial-only for Lantern
   absent a separate negotiation.

**Defer:** the seam refactor itself (translation-parameterized
`BibleProvider`, quota-aware cache, key-proxy edge function) should not be
built speculatively ahead of a translation actually shipping — it's real
work with no value until ESV or KJV is the concrete next task.

## Trigger to revisit

- **ESV:** build when Dennis actually wants a second translation for a real
  reason (not "more translations" in the abstract) — licensing is confirmed
  workable today, so the only remaining question is whether it's worth the
  bounded engineering cost above.
- **NIV:** revisit only if (a) a real user asks for NIV specifically, not
  translations generically, **and** (b) Dennis is willing to spend the time
  getting Biblica's direct written confirmation that an app is licensable
  under their terms — do not build against the assumption that API.Bible's
  self-serve grant is safe for a full reading app's actual usage pattern
  without that confirmation, and do not build a cache against an unconfirmed
  storage cap.
- **KJV:** no trigger needed beyond "wanted" — identical risk profile to
  BSB, free to build any time.

## Files/sources read for this brief

Codebase (read-only, no edits): `src/bible/provider.ts`, `src/bible/service.ts`,
`src/bible/cache.ts`, `src/bible/self-hosted.ts`, `docs/proposals/study-id.md`,
`docs/proposals/offline-write-outbox.md`, `docs/BACKLOG.md`.

Primary/external sources (all as checked 2026-07-22): `api.esv.org/docs/`,
`api.esv.org` (terms of use), `esv.org/about/terms/`,
`esv.org/account/register/`, `crossway.org/permissions/`,
`biblica.com/permissions/`, Biblica's NIV-quotation FAQ,
`docs.api.bible/your-account/plans-pricing/`, `docs.api.bible/guides/bibles/`,
`berean.bible/licensing.htm` (BSB public-domain/CC0 statement, corroborating
`self-hosted.ts`'s existing comment and the BACKLOG.md "Self-hosted BSB
fallback" entry), and `sellingjesus.org/articles/kjv` for the KJV US/UK
copyright distinction.

---

## Addendum — 2026-08-30 (product-strategy session)

The 2026-07-22 brief above is still correct on the law and the engineering.
This addendum records what a later research pass added, and the product
decisions that came out of it. Three things changed: a new distribution
channel appeared, the "solo developer" blocker turned out to be an
entity-form test, and the monetisation question stopped being separable from
the translation question.

### 1. The ESV compliance tripwire (act on this before monetising)

Crossway's non-commercial definition is **site-wide, not scripture-scoped**:
a qualifying site "does not charge for access to any part of the site," and
they explicitly name *donations* as commercial ("primarily designed to
motivate visitors to buy something, to pay for a service, **or to give a
donation**").

Consequences the July brief did not draw out:

- **Any** paid feature breaks ESV compliance, even one with nothing to do
  with scripture (group hosting, AI inference). So does a supporter/donate
  button.
- Lantern is therefore *already inside a non-commercial licence today*, via
  the translation Dennis personally reads. The monetisation stance was never
  an open question waiting to be decided — it was quietly pre-committed by
  the ESV integration.
- Crossway may revoke keys "at any time for any reason," and has done so
  before: they withdrew ESV from the SWORD/CrossWire ecosystem after years,
  forcing apps (e.g. And Bible) to remove it.

**Decision (2026-08-30): keep ESV, stay free, and treat this as a deferred
fork rather than a trap.** The `BibleProvider` seam makes ESV swappable, so
if a paid tier ever becomes real the choice is made then. The failure mode to
guard against is adding a donate button and leaving ESV in place without
noticing — hence a comment in the ESV provider pointing here.

### 2. "Organizations, not individuals" is an entity-form test

Crossway's stated policy is that they license "to publishers or ministry
organizations rather than to individuals," which reads as a hard wall for a
solo developer. Competitor research (§5) showed it is not a *size* test: the
bar appears clearable by an ordinary small legal entity, not by scale or
distribution.

**Decision (2026-08-30): do NOT form an entity.** Dennis is in Australia,
where the equivalents (Pty Ltd, or a state-based incorporated association)
carry real setup and annual overhead. Taking on recurring cost and
administration for a product that is free and has ~1 user is premature. The
entity is the gate for both a Crossway licence and any serious Biblica
conversation, so this decision also means:

- **NIV is realistically out** for now. Biblica's route is
  organisation-shaped too, and NIV is barred from commercial use even via
  aggregators.
- Applications are free, though. Emailing Crossway and Biblica as an
  individual costs nothing, and a "no" is more useful than an assumption.

### 3. API.Bible is the wrong purchase for Lantern

API.Bible Pro (~$29/mo) plus Express Licensing (~$10/mo per translation)
*is* a real, self-serve, commercially-licensable route — but it buys
**breadth** (NKJV, CSB, NLT, NASB, AMP, MSG) and cannot supply either
translation Dennis actually wants: NIV is excluded from commercial licensing
outright, and ESV is not on the platform at all.

**Decision: skip API.Bible.** Dennis's stated preference is quality over
breadth — "a couple of quality ones like NIV and ESV" — which makes the
subscription pure cost with no payoff.

### 4. YouVersion Platform (launched ~March 2026) — evaluated and rejected

New since the July brief. Life.Church exposes their own publisher agreements
to third-party developers: ~1,479 Bibles, 10 publishers, free, instant
automatic approval. Catalog verified live 2026-08-30.

- **ESV is not on it** (no Crossway licence exists there) and **KJV is not
  either** (blocked indefinitely, per a YouVersion engineer, June 2026).
  Moving the read path there would *lose* a translation Lantern already
  self-hosts.
- NIV is present (id 111, opt-in) under the **Biblica Fast-track License**,
  which forbids downloading content to the device, caps display at 25 verses
  or 2 chapters, forbids AI-personalised content, requires encryption against
  reproduction, and demands destruction of all content within 72 hours of
  termination (impossible for a PWA to honour).
- Critically, Biblica's non-commercial obligation attaches to "the WORK",
  defined as **the whole application** — app-wide, not scoped to the NIV
  text. A hybrid (PD offline core + NIV online-only) would forfeit Lantern's
  entire monetisation future to gain one online translation.
- The licences are *not* uniform: **Lockman** (NASB 1995/2020, AMP)
  explicitly permits "download to the user's device" with no verse cap, and
  **Wycliffe** grants "store" rights and says "online and offline". If
  Lantern ever wants more translations without the Biblica trap, PD/CC +
  Lockman is the viable subset.

**Decision: do not take the Biblica licence.** Offline reading and the deep
dive's ambitions are two of the three things Lantern is.

### 5. Competitor evidence: Harvous

[harvous.com](https://harvous.com) — solo-built (Derek Castelli, Testament
Made LLC, US), web-first PWA, notes-first Bible study app. Ships **11
translations (KJV, NKJV, ESV, NIV, NLT, NET, BSB, NASB 1995, CSB, AMP, MSG)
on a free tier** while charging $5/mo for hosted Shared Spaces.

That combination looked impossible given the above. The explanation is mostly
mundane:

- The translation set decomposes into three sources: API.Bible for the
  aggregated set, `api.esv.org` for ESV (the only route), `api.nlt.to` for
  NLT, plus free NET/BSB. **Five integrations, not one deal.**
- **Testament Made LLC** is an ordinary freelance web-design business
  (registered 2020, four small products). That is what satisfies Crossway's
  "organizations" rule. No loophole was found.
- His position is not clearly clean: API.Bible bars NIV from commercial use
  and names *freemium models* as commercial; Harvous is textbook freemium.
  No scripture attribution was found anywhere on his public site (it is
  contractually mandatory, though it may be in-app where research could not
  reach). He has never publicly written about Bible licensing despite
  blogging openly about everything else.
- **His "offline sync" claim is unverified and may mean notes, not
  scripture.** Biblica forbids offline NIV in writing, so if his reader
  serves NIV with no connection, he is outside the licence. Test before
  treating offline-licensed-scripture as a solved problem.

**Do not copy the posture.** Lantern's clean licensing position is a
durability asset: if a publisher ever sends a letter, Harvous has a
product-breaking problem and Lantern does not.

### 6. The settled position

**BSB + KJV + NET offline and permanent; ESV online-only while Lantern stays
free; NIV only if Biblica surprises us.**

Two supporting points make this a coherent product rather than a compromise:

- **NET Bible is already available on helloao** as `eng_net` (verified live:
  66 books, 1,189 chapters, plus a `complete.json` whole-Bible bundle in the
  same shape as `bsb.json.gz`). Free, no key, no rate limit, unlimited
  caching; attribution is one "(NET)" label linked to netbible.org. The
  licence grants the **text only** — the ~60k translator notes are excluded
  and are NOT ours. It is also the right third translation on the merits: a
  modern translation whose reason for existing is showing where translators
  disagree, which feeds the divergence signal (see `deep-dive-study.md`).
- **Notes are translation-independent** because they anchor to
  `book_number` + verse. A reader can read NIV or ESV, lose signal, fall back
  to BSB, and their notes are still exactly where they left them. This is a
  live complaint about YouVersion ("notes don't transfer between versions")
  that Lantern already solves. Say it out loud in the product.

### 7. Zero-cost next actions (none block building)

1. Test whether Harvous actually serves NIV offline. If it does not, nobody
   has solved offline licensed scripture and Lantern is not behind.
2. Email Crossway describing Lantern honestly, asking specifically about
   caching for offline reading in per-user browser storage, never
   exportable. Do this *before* any paid tier exists.
3. Email Biblica. Expect no; the answer is still worth having.
4. Email Derek Castelli (derek@harvous.com) founder-to-founder and ask how he
   handled licensing. Highest-value single question outstanding.
5. Add a comment in `src/bible/esv.ts` / `esv-cache.ts` pointing at §1 so a
   future paid feature cannot silently break compliance.

### 8. Engineering wins available today (compliant, unblocked)

- **Persist the ESV cache to IndexedDB under the existing 500-verse cap.**
  `esv-cache.ts` is in-memory only by choice, and its own comment concedes
  this is "stricter than the letter of the license requires". Persisting
  stops every reload refetching. Tradeoff: it writes licensed text to disk,
  which the original author deliberately avoided. Dennis's call.
- **Prefetch the next/previous chapter on idle.** Under a 500-verse ceiling
  new-chapter latency cannot be removed, but it can be moved out of the
  reader's way. Most of the perceived slowness is navigation, not reload.

### Sources added by this pass (checked 2026-08-30)

`api.esv.org` (terms), `crossway.org/permissions`, `platform.youversion.com/terms`,
`developers.youversion.com`, `api.youversion.com/v1/licenses` and `/v1/bibles`
(queried live), the Biblica / Lockman / Wycliffe fast-track licence documents
(public Google Docs linked from the licences API), `api.bible` pricing and
`care.api.bible` Express Licensing, `api.nlt.to`, `netbible.com/copyright`,
`ebible.org/engnet/copyright.htm`, `bible.helloao.org/api/available_translations.json`,
`harvous.com` (homepage, pricing, features, terms, about),
`sellingjesus.org/articles/bible-publishers`.
