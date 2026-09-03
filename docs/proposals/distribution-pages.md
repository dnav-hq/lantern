# Distribution pages — the ten that matter, honestly written

Status: **options-and-recommendation brief, not spec'd.** Written 2026-09-03.
Docs-only: no `src/` or `public/` change is proposed here, only which ten
pages to write, what each one says, and how they get built without becoming
a second product.

The problem this brief exists for, per `docs/ROADMAP.md`'s Arc 5: Lantern is
not losing to its nearest competitor on the product. It is losing on being
findable. Harvous ships dozens of comparison and use-case pages and owns
search for "best Bible notes app." Lantern has none. This is not a call to
match that volume — it is the opposite. Arc 5 is explicit that the answer is
"the ten that matter, honestly written," and this brief is that list.

## 1. What Lantern actually has today (read before proposing anything)

**The public surface, as it exists right now:**

- `/` — the signed-out landing (`src/components/landing/Landing.tsx`): a
  hero, three animated feature clips (four lenses, notes-on-verse, find and
  return), a short "why it exists" section in Dennis's own voice, and a
  closing CTA. Two intents, one primary each: "Get started" (sign-in dialog)
  and a quieter "Take a look first" into the guest reader.
- `/about` — a standalone static HTML page (`public/about.html`), built
  specifically to satisfy Google OAuth brand verification's requirement that
  the app's homepage "explain with transparency the purpose for which your
  app requests user data." It is deliberately self-contained: its own inline
  CSS, no build step, no shared component.
- `/privacy` and `/terms` — the same static-HTML pattern (`public/privacy.html`,
  `public/terms.html`).
- `/404.html`, `robots.txt`, `sitemap.xml` — the last two list exactly four
  URLs today: `/`, `/about`, `/privacy`, `/terms`. `sitemap.xml`'s own comment
  says why it stops there: "the app itself is a single-page tree behind
  sign-in and has no crawlable routes, so only the public marketing/legal
  pages are listed."

**How it is served — this is the mechanic the rest of this brief leans on.**
Lantern is a plain Vite + React SPA with no router (`CLAUDE.md`: "no
framework, no router — the app is a single-page tree with view state in
`App.tsx`"), deployed to Cloudflare Pages. `public/_redirects` states the
rule explicitly: "Cloudflare Pages serves existing static files before
consulting this file" — real files in `public/` are served at their own URL
(including extensionless: `/privacy.html` 308-redirects to `/privacy`
automatically), and only a path with **no** matching static file falls
through to `/index.html` and the SPA. `/about`, `/privacy`, and `/terms`
already prove this pattern in production. A distribution page is the same
move again, not a new mechanic.

**What Lantern is differentiated on, grounded in what is actually shipped**
(checked in `src/`, not just proposed in `docs/`), because a distribution
page can only honestly claim what exists:

- **Every note is anchored to a verse and typed as one of four fixed
  lenses** — observation, historical context, application, personal
  reflection (`src/utils/noteKind.ts`, the composer, the four-lenses landing
  clip). This is real and shipped, not aspirational.
- **Highlights** — a bodiless note, the "I noticed this but have no words
  yet" rung (`src/utils/journalFilters.ts`'s `KindFilter`).
- **User-owned categories** — rename and recolour the four defaults, add up
  to eight (`git log`: "feat(categories): colour a category from the ten
  approved slots").
- **The Journal** — every note, filterable by book, category, kind, date, and
  full-text search across your own notes and by scripture reference
  (`src/components/GlobalSearch.tsx`, `src/components/JournalPage.tsx`).
  This is retrieval of **your own notes**, not a full-text search engine over
  Scripture itself — that is a separate, deliberately-not-built proposal
  (`docs/proposals/scripture-search.md`: "Trigger to revisit: not now").
- **Footnote doors** — a quiet marker under a word a translator themselves
  flagged, surfacing BSB's own "Or…", "Literally…" alternate renderings
  in place (`src/components/FootnoteDoor.tsx`, shipped per git log:
  "the reading surface — a hairline door under the words a translator
  flagged").
- **Free, with no paid tier of any kind.** Nothing to buy, no donate button.
- **Not yet live, and this brief will not build pages that claim otherwise:**
  the Bible map has shipped its data pipeline and base artwork
  (`public/map/*.gz`, per the 2026-09-03 "ship the place bundle" commit) but
  has **no UI component yet** (no `MapView`/`PlaceMap` anywhere in
  `src/components`). The word door (lexicon layer) has a data utility
  (`src/utils/wordIndex.ts`) but likewise no shipped reading-surface UI —
  `docs/ROADMAP.md` itself says it "needs a guardrail design pass with Dennis
  before a build ticket." Sharing/groups (Arc 3) has not shipped either. None
  of the ten pages below lean on any of these three.

## 2. The competitor, checked live, not assumed from the roadmap note

`docs/ROADMAP.md` and `docs/BACKLOG.md` both cite "40+ comparison pages,
seven use-case pages and ten feature pages" for Harvous. That line predates
this brief and was not re-verified before landing in two files — worth
correcting here rather than repeating uncritically, per this brief's own
"do not fabricate competitor page counts" instruction. Checked live
2026-09-03 (`harvous.com`):

| Section | URL | Count, checked live |
|---|---|---|
| Comparison pages | `/compare/` | **59** (its own index page states the total: Apple Notes, Notion, Obsidian, YouVersion, Logos, Olive Tree, Evernote, Google Docs/Keep, plus prayer apps, sermon tools, and group-chat apps like WhatsApp and GroupMe) |
| Use-case pages | `/use-cases/` | **7**, matching the roadmap note (daily journal, sermon notes, sermon prep, book study, topical study, deep study, group study) |
| Feature pages | nav links under `/features/` and `/add-ons/` | **11** visible in primary nav (scripture pills, Bible reader, note templates, threads, recall, sidebar modes, highlights, daily passage, dictionary, resource library, shared spaces) |

So "40+" **understates** the comparison-page count (real number: 59) and
slightly overstates the feature-page count (11, not 10) — both worth
correcting in the roadmap note in passing, though that edit is out of this
brief's scope (`docs/BACKLOG.md` is explicitly out of scope for this task).
**Pricing and entity, re-confirmed against `docs/proposals/translations-path-to-esv-niv.md`
§"Harvous — the closest comparable":** free tier (unlimited notes, scripture
pills, highlights, threads, mentions); **Harvous Plus is $5/month or
$45/year** (a $30/year founding tier for the first 99 users), adding Shared
Spaces hosting for up to 50 people; trades as **Testament Made LLC**. That
proposal already flags one thing as **unverified** and this brief repeats
the same flag rather than re-asserting it as fact: *how* Harvous licenses its
eleven translations (including ESV) is not published anywhere on its site.
This brief does not use that as a claim anywhere in the comparison page
below — an unverified licensing question about a competitor is not a
selling point, honest or otherwise.

One live example checked for tone, not just structure: `harvous.com/compare/notion`
does not disparage Notion. It concedes "Notion is great at general
note-taking and project docs" and frames the difference as purpose-fit
("you wire references up yourself" in Notion) rather than capability. That
is the register this brief's own comparison page follows in §4, not because
Harvous set the bar, but because it is independently the right way to write
a fair comparison and it happens to match precedent.

## 3. The ten pages

Ten, not forty, deliberately spread across the four intents that actually
have search volume and an honest answer: one direct comparison, one broad
buyer-intent page, four use-case pages, three feature pages, and one trust
page. Every "one true thing" below is checked against §1 — nothing here
claims the map, the word door, or sharing.

| # | Page | URL | Search intent | The one true thing it says |
|---|---|---|---|---|
| 1 | Lantern vs. Harvous | `/lantern-vs-harvous` | "harvous alternative", "lantern vs harvous", "bible notes app comparison" | Lantern has no paid tier at all; Harvous's real free tier is good, and its collaboration features sit behind a $5/mo Plus plan Lantern doesn't have and doesn't need to sell. |
| 2 | What to look for in a Bible study notes app | `/best-bible-study-notes-app` | "best bible study app", "best bible notes app" | Written as Lantern's own stated criteria, not a disguised ranking of others — anchoring, structured lenses, and no paywall are the three things worth checking for, and here's why. |
| 3 | A daily Bible study journal that doesn't lose your notes | `/bible-study-journal-app` | "bible study journal app", "daily bible journal" | A note you write today sits on the exact verse it belongs to, so returning to a passage months later means your earlier study is already there, not buried in a dated list. |
| 4 | How to study a book of the Bible, verse by verse | `/how-to-study-a-book-of-the-bible` | "how to study a book of the bible", "bible book study app" | Every note for a book collects under that book in the Journal automatically — there is nothing to file or organise by hand. |
| 5 | Taking sermon notes that stay with the passage | `/sermon-notes-app` | "sermon notes app", "bible app for taking notes during a sermon" | A note taken during a sermon is anchored to the passage being preached, so it's still there — next to that verse — the next time you read it, not lost in a separate notes app. |
| 6 | The inductive Bible study method, built into the app | `/inductive-bible-study-app` | "inductive bible study app", "observation application bible study method" | The four lenses (observation, historical context, application, personal reflection) are the actual note-composer categories, not a method you have to remember to impose on yourself. |
| 7 | Bible notes that stay on the verse | `/bible-notes-anchored-to-verses` | "bible app notes attached to verse", "bible verse note taking app" | A note is stored as an anchor to a specific verse, never as a floating, untethered entry — open the passage and the note is already sitting beside it. |
| 8 | See what a translator flagged, without leaving the verse | `/bible-app-alternate-translations` | "bible app shows alternate translations", "bible study app footnotes" | A quiet marker sits under a word only where BSB's own translators noted an alternate rendering — it opens in place, it isn't a separate cross-reference page to go hunt down. |
| 9 | Find a Bible study note you wrote months ago | `/find-your-bible-study-notes` | "bible notes app search", "find old bible study notes" | Every note you've ever written is searchable by scripture reference or keyword and filterable by book, category, and date — nothing you wrote is only findable by remembering where you left it. |
| 10 | Why Lantern is free | `/why-lantern-is-free` | "free bible study app no ads", "bible app no subscription" | There is no paid tier, no ads, and no donate button — not a promise, a structural fact: the translations Lantern ships (BSB, KJV, NET, and ESV under Crossway's free non-commercial terms) cost nothing per reader, so there is nothing here that a subscription would be paying for. |

Deliberately **not** built, and why: a broad "best Bible apps" roundup
naming and ranking competitors (the "no invented weaknesses" constraint
gets harder to hold the more competitors a page names — one honest,
well-sourced comparison is safer and more credible than five thin ones); a
group/shared-study page (Arc 3 hasn't shipped); a map or word-door feature
page (neither has a UI yet — see §1).

## 4. The comparison page — design and explicit do-nots

**Structure**, following the fair pattern confirmed live in §2:

1. A short, neutral framing of both products in one line each — what each
   one actually is, not what it's bad at.
2. A "choose Lantern if / choose Harvous if" pair, reciprocal and honest.
   Lantern's honest "choose Harvous if" list is not optional: it must name
   what Lantern genuinely doesn't have — eleven translations (Lantern ships
   four: BSB, KJV, NET, ESV), and Shared Spaces / group collaboration
   (Lantern's sharing has not shipped). Omitting Lantern's own real gaps
   would be the same dishonesty as inventing a Harvous weakness — leaving
   the reader to discover the gap themselves after they've already signed up
   is worse for trust than naming it up front.
3. A small side-by-side table: price, translations shipped, note structure
   (four fixed lenses vs. free-form threads/pills), sharing, and offline
   reading. Every cell sourced from §2's live-checked facts or from
   Lantern's own `src/`, never estimated.
4. A closing line that does not oversell: something closer to "different
   shape, similar spirit" (the same honest framing Dennis's own outreach
   email to Harvous's founder used, per `docs/proposals/translations-path-to-esv-niv.md`
   §5c) than a hard sales close.

**Explicit do-nots**, because this is the one page where getting it wrong
costs the most:

- **No disparagement.** No "cluttered," "bloated," "trying to do too much,"
  or any adjective whose only job is to make Harvous sound worse. Harvous is
  a real, well-built, solo-founder product; the honest pitch is fit, not
  quality.
- **No invented weaknesses.** Every claim about Harvous must trace to
  something checked live (§2) or already verified in
  `translations-path-to-esv-niv.md`. If it isn't checked, it isn't claimed.
  The one thing that IS unverified about Harvous (how it licenses ESV/NIV)
  stays out of the page entirely — it is not Lantern's business to imply
  anything about a competitor's licensing compliance it cannot prove.
- **No claiming features Lantern lacks.** No mention of the map, the word
  door, or shared study as if they exist. If Dennis ships one of these
  later, this page gets a follow-up edit then, not a claim now.
- **No fabricated numbers.** Harvous's page counts, pricing, and entity name
  are quoted exactly as checked (§2), with the check date stated on the page
  itself (a comparison page that never says when it was last checked reads
  as either lazy or stale the first time either product changes).
- **No @Harvous mention on social, no outreach implying competition.** This
  page is discovered by search, not pushed at Harvous or its users. Nothing
  about this brief proposes contacting Harvous — Dennis already has a warm,
  founder-to-founder relationship with Derek Castelli via the translations
  licensing correspondence, and a public comparison page landing in his
  inbox unannounced would spend that goodwill for a page that doesn't need
  the traffic.

## 5. Guardrails — how every page honours them

**The ESV tripwire** (`translations-esv-niv.md` §1: Crossway's non-commercial
definition is site-wide, and *explicitly* names a donation as commercial
use — "primarily designed to motivate visitors to buy something, to pay for
a service, **or to give a donation**"). None of the ten pages add or link to
a donate button, a pricing page, or any call-to-action other than "Get
started" / "Take a look first" (the same two CTAs the landing page already
uses). Page 10 ("Why Lantern is free") is the one page where this needs
active care rather than passive avoidance: it must explain freeness as a
**structural fact about licensing and cost**, never as an invitation to
"support the project" — the moment that sentence exists anywhere on
`lanternword.com`, ESV eligibility ends. This is stated as a hard constraint
on page 10's copy, not a suggestion.

**The writing voice.** Plain, declarative sentences; minimal em-dashes;
none of the generic-AI tells ("unlock," "seamless," "elevate your study,"
"dive into," "in today's fast-paced world," "it's important to note that").
Every page's "one true thing" in §3 is written the way `about.html` and
`Landing.tsx` already talk — short, first-person-adjacent, no exclamation
points. New pages should read as though the same person who wrote "I built
Lantern because my own study kept getting lost" (`Landing.tsx`) wrote them,
because the goal is one voice across every page a stranger might land on
first, not a separate "marketing voice" bolted onto the honest one that
already exists.

**The philosophy line — "help the reader see, don't see for them"**
(`docs/proposals/journal-retrieval.md`, `deep-dive-study.md`). This governs
page 6 (the inductive method) most directly: it must describe the four
lenses as a structure the reader fills in themselves, never as Lantern
telling them what a passage means. It also governs the whole set's tone —
these are pages that explain what the tool does and get out of the way, not
pages that oversell an outcome ("finally understand Scripture") the tool
cannot promise.

## 6. Mechanics — static pages, not app routes

**Static HTML in `public/`, exactly the `about.html`/`privacy.html`/`terms.html`
pattern, not a React route.** Three reasons this is the right call, not just
the easy one:

1. **Zero bytes added to the app bundle every signed-in user downloads.**
   `App.tsx` has no router and no route table — adding these as React
   components would mean importing ten new components (plus whatever copy,
   images, and comparison-table markup they carry) into the same JS bundle
   every reader loads to write a note, regardless of whether they ever visit
   a marketing page. A static HTML file costs the *marketing visitor*
   something to download, never the *app user*. This is the same reasoning
   `docs/proposals/guest-deep-link-seo.md` already used when it rejected
   adopting a router/SSR framework "to fix one metadata problem": Lantern
   has no other page that needs client routing, and these ten don't either.
2. **Cloudflare Pages already serves this pattern correctly, in
   production, today.** `public/_redirects`' static-files-first rule and the
   auto extensionless-redirect (`/about.html` → `/about`) need no new
   infrastructure — the three existing static pages already prove it works,
   including under the OAuth brand-verification crawler, which is a stricter
   test than an ordinary search bot.
3. **No SSR, no build step, no drift.** Following §4b of
   `guest-deep-link-seo.md`'s own verdict against build-time prerendering
   for a much larger page set (1,189 chapter pages) — that brief chose a
   Cloudflare Pages Function specifically to avoid a second "build output"
   to keep in sync. Ten hand-written static files don't even carry that
   risk: there's no generation step to drift from a live source, because
   there's no live source — the copy is authored once, same as `about.html`.

**Sitemap and metadata.** Each new page gets:

- Its own `<title>`, `<meta name="description">`, and `og:title`/
  `og:description`/`og:type=article` tags (the exact block `about.html`
  already carries) — the search intent from §3's table is the literal input
  to writing these, not an afterthought.
- A line in `public/sitemap.xml`, matching the existing four-URL file's
  format, at a `priority` below the app (`1.0`) and `/about` (`0.9`) but
  above `/privacy`/`/terms` (`0.5`) — these are the pages meant to be found,
  not just the legally-required ones. `0.7` fits.
- No change needed to `robots.txt` — it already allows `/` wholesale, and a
  static file under `public/` needs no separate allow rule.
- A `<link rel="canonical">` pointing at its own clean URL, the same
  reasoning `guest-deep-link-seo.md` §6 already gives for why this matters
  once more than one URL shape could plausibly resolve to the same content.

**Bundle hygiene, explicitly checked, not assumed.** `vite.config.ts`'s PWA
`globPatterns` (`**/*.{js,css,html,svg,png,ico,woff2}`) already sweeps every
`public/*.html` file into the service-worker precache — `about.html`,
`privacy.html`, and `terms.html` are precached today, and that's fine,
because each is a small, self-contained file with inline CSS and no
external JS. Ten more files of the same shape add a proportionate few dozen
KB to the precache manifest, the same category of cost the existing three
already carry — not a new one. This is a materially different question from
"does this bloat the JS bundle," which is what §6 opened with and the
answer to which stays no: precaching a static HTML file and shipping code
inside `App.tsx`'s bundle are not the same cost, and this brief is
deliberately choosing the one that scales with visits to that page, not with
every app session.

## 7. Effort and what ships first

**The comparison page and two use-case pages are the highest-leverage
three, and this brief takes that position rather than hedging it.**
Reasoning:

- The comparison page (#1) is the only page that answers a query with
  *buying intent already pointed at a specific alternative* — someone
  searching "harvous alternative" or "lantern vs harvous" has already
  decided they want a Bible notes app and is choosing between two named
  options. That is a fundamentally higher-intent visitor than someone
  searching a generic term, and it is the one page type Harvous itself
  clearly treats as worth 59 variants of.
- Of the four use-case pages, the daily journal (#3) and book study (#4)
  pages target the two most generic, highest-volume-shaped queries in the
  set ("bible study journal app," "bible book study app") while staying
  fully honest about what's shipped — no dependency on anything not yet
  built, unlike the sermon-notes page which is a narrower, more specific
  audience.

**Effort per page is genuinely small and roughly uniform**: each is a
single static HTML file, built from the `about.html` template (same head
block, same nav/footer, same CSS variables), with page-specific copy and
(for the comparison page only) a small table. None require new components,
new build tooling, or new data. The honest cost is **writing time**, not
engineering time — getting the "one true thing" exactly right per page, and
holding the comparison page to §4's do-nots, is where the real effort sits,
not the HTML.

**Sequencing for the remaining seven**: the three feature pages (#6, #7,
#8) next, because they're the ones most directly grounded in something
already shipped and require the least new writing judgment (each is
describing one real, narrow, already-built behavior). Page 10 ("why
Lantern is free") and the broad buyer-intent page (#2) last, because both
need the most editorial care — #10 for the ESV-tripwire reason in §5, #2
because it is the page most exposed to accidentally becoming a disguised
competitor ranking if written carelessly.

## 8. First slice and pasteable backlog entry

**First slice:** pages #1 (Lantern vs. Harvous), #3 (daily Bible study
journal), and #4 (book study), following §7's reasoning. Each is a new
static HTML file under `public/`, plus four lines added to
`public/sitemap.xml`. No `src/` change, no schema change, no new
dependency, and no work that depends on anything else in the roadmap
landing first.

**Pasteable backlog entry**, in `docs/BACKLOG.md`'s existing voice
(added under Arc 5's line once this brief is read, not added by this
brief itself — `docs/BACKLOG.md` is out of scope for this task):

> - **Distribution pages, first slice (Arc 5).** Ship three static pages
>   under `public/`, following the `about.html` pattern exactly (own head
>   block, own OG/meta, no React, no build step): `/lantern-vs-harvous`, a
>   fair comparison page with an explicit "choose Harvous if" section
>   naming what Lantern genuinely doesn't have yet (eleven translations,
>   Shared Spaces); `/bible-study-journal-app` and
>   `/how-to-study-a-book-of-the-bible`, two use-case pages grounded only
>   in what's shipped (verse-anchored notes, the four lenses, the Journal).
>   Each gets a line in `public/sitemap.xml` at priority 0.7. No donate
>   language anywhere — the ESV tripwire in `translations-esv-niv.md`
>   still governs every word on these pages. See
>   `docs/proposals/distribution-pages.md` for the full ten-page plan, the
>   comparison page's do-nots, and why static HTML beats a React route
>   here.

## Files/sources read for this brief

Codebase (read-only, no edits): `CLAUDE.md` (root and this repo's),
`docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/proposals/translations-esv-niv.md`,
`docs/proposals/translations-path-to-esv-niv.md` (the Harvous data point and
outreach emails), `docs/proposals/guest-deep-link-seo.md` (the static-vs-SSR
mechanics precedent this brief reuses), `docs/proposals/journal-retrieval.md`
and `docs/proposals/deep-dive-study.md` (the philosophy line), `public/about.html`,
`public/privacy.html`, `public/robots.txt`, `public/sitemap.xml`,
`public/_redirects`, `public/_headers`, `vite.config.ts` (PWA precache
config), `src/components/landing/Landing.tsx`, `src/components/landing/FeatureClips.tsx`,
`src/components/GlobalSearch.tsx`, `src/components/FootnoteDoor.tsx`,
`src/utils/noteKind.ts`, `src/utils/journalFilters.ts`, `src/utils/wordIndex.ts`,
`src/utils/mapData.ts`, and recent `git log`/`git show` output to confirm
what has actually shipped versus what remains data-only or proposed.

External (fetched live 2026-09-03, all `harvous.com`): `/`, `/compare/`,
`/compare/notion/`, `/use-cases/` — used only for §2's live page-count
correction and §2/§4's tone check. No other external source was fetched.
Any Harvous fact not sourced to one of these live fetches or to
`translations-path-to-esv-niv.md`'s own already-verified research is not
used in this brief.
