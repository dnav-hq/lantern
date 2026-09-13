# The connections door — where Scripture echoes this verse

**Recommendation: build it, ship OpenBible's cross-reference scores only, and
type "quote" vs "echo" from the app's own verse text rather than from a second,
unlicensed dataset.** The reference data is open (CC BY 4.0) and already
addressable by verse, which is the one thing every translation Lantern serves
has in common — this door works the same on Tamil as it does on the BSB, which
none of the deep dive's other doors can say. The one piece the prototype
assumed was available — a quotation database to tell a direct quote from a
thematic echo — turns out to have no licence at all, checked the same way
`deep-dive-study.md` caught the OpenScriptures and STEPBible-Meaning errors:
by opening the file instead of trusting the summary.

Status: **design + data brief, nothing built.** Written 2026-09-12, companion
to `docs/proposals/footnotes-door.md` (same register: measured, with
reproduction commands) and `docs/proposals/deep-dive-study.md` (which named
this door, prototyped it at `design/reference-deep-dive.html`, and validated
five durable interaction principles this brief carries forward rather than
re-deciding). All figures below are measured live against
`bible.helloao.org` on 2026-09-12 by `scripts/measure-cross-refs.mjs`, which
this brief adds; §11 says how to re-run every number.

---

## 1. The stance

1. **We show OpenBible's ranking, verbatim in its ordering, and add nothing
   evaluative to it.** No "the strongest connection is…", no editorializing
   about which link matters. The reader sees a ranked list of real,
   citable places Scripture points; they decide what it means.
2. **"Quote" is a claim we can verify ourselves; "echo" is everything else.**
   A row is labelled a quote only when the target verse's own words are
   substantially present in the source verse's own words — computed from
   text we already have full rights to, never from a third-party typing
   dataset. §3 explains why the obvious dataset for this is off the table.
3. **Nothing auto-expands, ever** — same rule as the footnote door, for the
   same reason: every study method this app is built around teaches
   observe-before-consult.
4. **The door only opens where a verse has something to say.** §5's coverage
   numbers make "genuinely well-connected" a measured line, not a feeling.

---

## 2. What the data actually is

### 2.1 The endpoint, and why this brief samples instead of walking

`footnotes-door.md` walked all 1,189 chapters in one request:
`GET /api/BSB/complete.json` bundles the whole Bible. The cross-reference
dataset has no equivalent — `GET /api/d/open-cross-ref/complete.json` 404s
(checked 2026-09-12) — so a full walk means 1,189 sequential chapter
requests against a free, unauthenticated API every time the numbers are
re-run. Instead this brief draws a **seeded random sample of 200 verses**
(the same LCG recipe `footnotes-door.md` §11 uses for its two audits: a
Fisher–Yates shuffle over the true verse universe, first 200 taken) and
fetches only the chapters that sample touches — 184 of 1,189 this run, still
a broad cross-section of the whole Bible, at an eighth of the requests.
`scripts/measure-cross-refs.mjs` does this and prints the report below; it
takes a `SAMPLE_SIZE` env var if a bigger sample is ever wanted.

The endpoint is `GET https://bible.helloao.org/api/d/open-cross-ref/{USFM}/{chapter}.json`,
using the same 3-letter USFM codes already in `src/bible/helloao.ts`'s
`USFM_BY_BOOK_NUMBER` (that table was independently re-verified against
`tam_irv`'s book list on 2026-08-21, per its own comment — see §7). One
verse, from Genesis 15, fetched live:

```jsonc
// GET /api/d/open-cross-ref/GEN/15.json → chapter.content[5] (verse 6)
{
  "verse": 6,
  "references": [
    { "book": "JAS", "chapter": 2, "verse": 23, "score": 85 },
    { "book": "GAL", "chapter": 3, "verse": 6, "endVerse": 14, "score": 59 },
    { "book": "ROM", "chapter": 4, "verse": 9, "score": 56 },
    { "book": "ROM", "chapter": 4, "verse": 20, "endVerse": 25, "score": 49 },
    { "book": "ROM", "chapter": 4, "verse": 3, "endVerse": 6, "score": 48 },
    { "book": "PSA", "chapter": 106, "verse": 31, "score": 31 },
    { "book": "HEB", "chapter": 11, "verse": 8, "score": 31 },
    { "book": "ROM", "chapter": 4, "verse": 11, "score": 26 },
    { "book": "2CO", "chapter": 5, "verse": 19, "score": -8 }
  ]
}
```

Every chapter's `content` array carries one entry **per verse in that
chapter**, whether or not it has any references (confirmed: Genesis 15 has
21 verses and 21 content entries) — so, unlike the footnote dataset, there is
no separate index to cross-check for orphans or dangling markers. A verse
with nothing to show simply has `references: []`.

### 2.2 The fields, measured

Across the 200-verse sample (1,995 references):

| Field | Present | Notes |
|---|---|---|
| `book`, `chapter`, `verse` | 100% | The target's address — always a single verse, never a range, on the target side. |
| `score` | 100% | Signed integer. **Not a percentage and not bounded 0–100** — see below. |
| `endVerse` | 22.2% (443/1,995) | Present when the target is a range (e.g. "Genesis 3:6, through verse 8"). Absent means a single verse. |

**The source side is always a single verse.** Every chapter's `content`
entries are keyed one-per-verse; a range never appears as the *source* of a
set of references, only ever as a *target*.

**`score` is unbounded and can be negative.** Measured range in the sample:
**−4 to 738**, median 3, mean 9.97. The deep-dive prototype's mock data used
illustrative scores in the 0–99 range (`design/reference-deep-dive.html`
imagines Genesis 15:6 → Romans 4:3 at score 99); the real figure for the
entry that contains Romans 4:3 (bundled into a 4:3–6 range) is **48**, and the
real *highest*-scored connection for Genesis 15:6 is James 2:23 at **85** — an
allusion, not the verbatim quote. **Score therefore does not mean "how
literal a quote"; it is OpenBible's own relevance weighting** (built on the
Treasury of Scripture Knowledge — §4), and the two must not be conflated. This
is exactly why §3 handles quote/echo typing as a separate, computed question
rather than reading it off `score`.

**References are pre-sorted by score, descending, within each verse — 0
violations across all 1,995 checked.** Useful (no client-side sort needed to
show "top N"), but treated as an observed property of this dataset today, not
a documented API contract to assume forever.

### 2.3 The graph is directional, and each verse's list is its own

The single most load-bearing structural fact, and it did not show up until
two verses were compared against each other rather than read alone:
**Genesis 15:6's own reference list and Romans 4:3's own reference list are
not mirrors of each other.**

- Genesis 15:6 → the relationship to Romans 4 appears once, bundled as
  "Romans 4:3, through verse 6", scored **48**.
- Romans 4:3 → the relationship to Genesis 15:6 appears once, as a bare
  single verse, scored **30**.

Different shape, different score, same two passages. **A verse's connections
are its own outgoing list; there is no single undirected "these two verses
are linked" edge to fetch once and show from either side.** This settles a
real scope question for §8 (rung one): the door on a verse shows *that
verse's own list*, fetched with one request. Showing "who quotes this" from
the *other* direction as well — did any *other* verse in the whole Bible
name this one as a strong connection — would mean inverting the entire
344,799-reference corpus once, offline, into a reverse index. That is a
real, biggish, buildable idea (open-cross-ref's own metadata reports
344,799 references total, over 29,364 of 31,086 verses), but it is not rung
one, and it is not required by the business case in this brief's own
framing ("follow a verse to the other passages… and jump there and back") —
which is the outgoing direction.

---

## 3. Licensing — the cross-references may ship; the quote/echo dataset may not

### 3.1 OpenBible cross-references — CC BY 4.0, may ship

Fetched live from the dataset's own metadata
(`GET /api/d/open-cross-ref/books.json`, 2026-09-12):

```jsonc
{
  "id": "open-cross-ref",
  "name": "Bible Cross References",
  "website": "https://www.openbible.info/labs/cross-references/",
  "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
  "licenseNotes": "Changes were made to the data to fit the Free Use Bible API format.",
  "totalNumberOfReferences": 344799
}
```

OpenBible's own page states the dataset is built primarily from the
**Treasury of Scripture Knowledge** (a 19th-century, public-domain
cross-reference work) plus other sources, weighted into the `score` above,
and licenses the result CC BY 4.0. **This may ship, with attribution.** The
exact required attribution string is not spelled out in terms on the page
(flagged **unverified** in the specific wording, same caveat
`footnotes-door.md` §8 raises for the BSB) — the safe, standard form is a
visible line crediting OpenBible.info and linking
`openbible.info/labs/cross-references`, alongside the CC BY 4.0 licence
link, the same way `TranslationFooter` already renders the Tamil
translations' CC BY-SA attribution (`src/bible/service.ts`).

### 3.2 The quote/echo typing dataset — no licence at all, must not ship

`deep-dive-study.md`'s table named a second source for exactly one purpose:
telling a direct quote from a thematic echo — "Luke Plant NT/OT quotation DB
for quote-vs-echo typing." Checked here the same way the STEPBible/
OpenScriptures errors were caught in that same document: by opening the
repository rather than trusting a description.

- Repository: `github.com/spookylukey/bible-quotation-database`.
- **GitHub's own API reports `license: null`.** No `LICENSE` file, and the
  README describes the schema and how to rebuild the data but states no
  terms of reuse anywhere.
- **It is itself a derived aggregation of two personal websites, neither of
  which states a licence either:** the README lists its sources as
  `bible-researcher.com` (~719 quotation pairs) and `kalvesmaki.com` (~327–623
  pairs). Even contacting the aggregator would not resolve the two upstream
  sources' own position.
- A public GitHub repository with no `LICENSE` file is, by GitHub's own
  terms of service, **all rights reserved by default** — visible for
  reading, not licensed for reuse. This is the identical shape of error
  `deep-dive-study.md` found in OpenScriptures Strong's ("no `LICENSE` file
  and no `README.md`; GitHub's API reports `license: null`") and drew the
  same conclusion from: **out of the build**, not "probably fine."

**Consequence: this dataset must not ship in Lantern in any form** — not the
raw pairs, not a derived yes/no "is this a quote" flag — until someone
obtains explicit written permission, which nobody has asked for. This is a
harder line than the footnote door's textual-variant hold (§6 there holds
content Lantern *has* the rights to but chooses not to show); here there is
no content to withhold, because there is no grant to build on.

### 3.3 What may ship, stated plainly

| | May ship | May not ship |
|---|---|---|
| Cross-reference links + scores (OpenBible / TSK, CC BY 4.0) | **Yes, with attribution** | — |
| Quote-vs-echo TYPE, sourced from `bible-quotation-database` | — | **No — unlicensed, do not build against it** |
| Quote-vs-echo TYPE, computed from the app's own already-licensed verse text (§4) | **Yes** | — |

---

## 4. What ships: quote vs. echo, computed rather than sourced

Because §3.2 takes the obvious dataset off the table, "quote" has to be
**detected**, not looked up — and the good news is the data needed is data
Lantern already has full rights to: the verse text itself, in whatever
translation is on screen, already fetched to render the page.

**Rule: a connection is a `quote` when a contiguous run of four or more
non-trivial words (ignoring case, punctuation, and the small set of
function words: *the, a, an, and, of, to, in, that, is, was*) appears in
both the source verse and the target verse; otherwise it is an `echo`.**
Four words is deliberately conservative — long enough that "and it came to
pass" (a stock formula, not a quotation) cannot trip it, short enough to
catch the shared-phrase cases the prototype's own worked examples show
(Romans 4:3's "*it was credited to him as righteousness*" against Genesis
15:6). This mirrors exactly what `deep-dive-study.md`'s "On the prototype"
section already validated as the display rule — **"highlight-on-arrival for
quotes only, honest about the fact that echoes/themes have no phrase
anchor"** — except the trigger for *which* rows get that treatment is now a
computable rule over licensed text instead of a lookup into unlicensed data.

**This needs its own small measurement pass before it ships**, and is called
out as such in §8 and §9 rather than decided here: the threshold (four words,
that exact stop-word list) is a first cut reasoned from the prototype's
examples, not yet run against a labelled sample the way `footnotes-door.md`
ran two blind audits before shipping a classifier. Do not ship the exact
threshold above without at least one such pass.

**One structural consequence worth stating now:** because this compares the
*source verse's own translation text* against the *target verse's text in
the same translation* (fetched the same way `CrossRefPill` already fetches a
preview — `api.getBibleVerse(reference)`), the quote/echo split can differ
by translation even though the connection graph itself does not. "Quotes
this" in the BSB might read as "echoes this" in the NET if the two
translations render the shared phrase differently. That is correct, not a
bug: the underlying claim ("these two passages are linked, and how
strongly") is translation-independent; whether the *wording* visibly
matches is not, and never was.

---

## 5. Coverage, measured

Over the 200-verse seeded sample (`scripts/measure-cross-refs.mjs`, seed
`20260912`, 184 chapters fetched, 0 errors):

| Connections on a verse | Share |
|---|---|
| 0 | 13 · **6.5%** |
| 1–5 | 51 · **25.5%** |
| 6–20 | 118 · **59.0%** |
| 20+ | 18 · **9.0%** |
| **median** | **9** |
| mean | 9.97 |

**93.5% of verses have at least one connection**, and most have several —
this dataset is far denser than the footnote door's (6.4% of verses carried
a ship-set footnote). Left as-is, "has a connection" is not a useful
salience test; almost every verse would qualify, which is exactly the "dump"
the deep dive's doorway model exists to prevent (`deep-dive-study.md`'s "The
USP" section).

**The useful signal is the *strength* of a verse's best connection, not
whether it has any.** Looking at each sampled verse's single highest-scored
reference (n=187 of 200 with at least one):

| Top connection's score | Share of verses-with-≥1 |
|---|---|
| < 10 | 148 · **79.1%** |
| 10–29 | 28 · **15.0%** |
| 30–59 | 7 · **3.7%** |
| 60–99 | 3 · **1.6%** |
| 100+ | 1 · **0.5%** |
| median | **5** |
| p90 | 21 |
| max (sample) | 738 (Deuteronomy 32:4, in the Song of Moses — a verse the TSK apparatus treats as unusually richly cross-referenced) |

**Recommended salience threshold: top score ≥ 30.** That clears the door for
**11 of 200 sampled verses (5.5%)** — the same order of magnitude as the
footnote door's 6.4%, which is a useful sanity check that the two doors will
not constantly compete for the same 2–4-doorway slot. This is a
**recommendation, not a decision** — flagged in §10 as one of the things
that wants Dennis's eye on real chapters before it ships, the same way
`footnotes-door.md` measured density and let Dennis confirm rather than
asserting the cutoff unilaterally.

---

## 6. The reading surface: the door on a phone

`deep-dive-study.md`'s "On the prototype" section already validated five
principles from `design/reference-deep-dive.html`, built specifically for
this facet. This brief does not re-litigate them; it specifies the row and
the load, which the prototype left as illustrative mock data.

### 6.1 What a connection row shows

- **The reference** ("Romans 4:3"), tappable.
- **A short preview of the target verse's own text**, in the translation
  currently on screen — fetched exactly the way `CrossRefPill` already
  fetches a preview (`api.getBibleVerse(reference)`), so no new text-fetch
  path is needed, only a new *list* of which references to fetch previews
  for.
- **For a `quote` row only: the shared words lit**, per §4 — computed
  locally, never a claim sourced from data Lantern doesn't have rights to.
  An `echo` row carries no phrase highlight, which is the honest answer per
  `deep-dive-study.md`'s "highlight-on-arrival for quotes only."
- **No score, no percentage, no meter.** Per the prototype's already-settled
  finding, relevance is **order and prominence**, not a number — and §2.2
  measured exactly why a raw score would be actively misleading to show
  (unbounded, occasionally negative, and not comparable across verses: a
  score of 30 is this sample's 90th percentile for one verse and would be
  unremarkable for Deuteronomy 32:4).
- Ranked exactly in the order the API already returns (§2.2: pre-sorted,
  descending) — no client-side re-ranking needed.

### 6.2 How many load

Three tiers, following the prototype's own `full → one-line → bare ref`
prominence rule and its 2–4-doorway discipline at one level up:

1. **Top connection: full row** — reference, preview text, quote highlight
   if applicable.
2. **Next two: one-line rows** — reference and a clipped preview.
3. **Everything past the top three: a single "and N more" affordance**,
   expandable in place (not paginated — the whole verse's reference list is
   already in hand from the one chapter fetch, so "more" costs nothing
   further to load, only a disclosure).

This mirrors the prototype's own worked example (a `quote` group with one
item shown, an `echo` group with two to three items shown and a `hidden`
tail) rather than inventing a new shape.

### 6.3 Jump, and back

**Reuse the deep dive's hold-firm stacking wholesale; this brief does not
reinvent it.** Per `deep-dive-study.md`'s validated principles: tapping a
connection row stacks a new layer over the held passage rather than
navigating away from it; a tappable reasoning breadcrumb ("Romans 4:3
*quotes* Genesis 15:6") keeps every level reachable; back climbs out one
level at a time. The stacked layer shows the target verse (with its own
immediate surrounding verses for context) and **offers its own connections
door onward** — the same doorway recursively, which is what makes "jump
there and back without losing your place" (this brief's own framing in its
task) actually true rather than a slogan.

**What this brief does NOT spec:** the general stack/breadcrumb mechanism
itself. That is deep-dive plumbing shared by every door (word door, map,
future book intros), already designed once in the prototype and explicitly
not something `deep-dive-study.md` wants redesigned per-door. This brief's
job is the connections door's own row and data; the stack is the vehicle
every door rides in.

### 6.4 Coexistence with verse selection — and the surface this depends on

The footnote door and the word door both anchor **inline, inside verse
text** (an underline under a word), which is exactly why they collide with
`MobileSelectionBar`'s tap-to-select and need the arbitration rules
`footnotes-door.md` §5.4 specifies. **The connections door does not have
this collision, because it is not rendered inside the verse at all** — it
lives in the deep-dive doorway list, entered by a deliberate act (opening
the deep dive), which is already outside the selection surface by
construction.

**What this brief cannot spec, because it does not exist yet: the mobile
deep-dive entry point itself.** Today, `studyMode = studyOpen && !isMobile`
(`BookDetailPage.tsx`) — the Read/Study workbench, and with it every door
the deep dive offers, is **desktop-only**. `docs/BACKLOG.md`'s existing Deep
Dive entry already flags that "the deep-dive entry surface will likely be
redesigned from scratch," and this brief inherits that gap rather than
papering over it: **the connections door's row and data are fully specified
here and buildable on desktop today; a mobile entry point is a prerequisite
this brief does not supply**, and is listed as out of scope in §8 rather
than guessed at.

---

## 7. The seam

**Connections arrive through a new, additive `BibleProvider` method, not
through `getChapter`.** Unlike footnotes, a connection anchors to a *whole
verse*, never a word or a phrase — so there is no character-offset
computation, no risk of "underlines the wrong word," and no change at all to
`BibleVerseLine`. The shape is closer to `getBibleVerse` (already exists,
already fetches one verse) than to the footnote seam:

```ts
export interface VerseConnection {
  book: number        // book_number, 1–66 — resolved from the USFM code via
                       // the existing usfmForBookNumber() table, inverted
  chapter: number
  verse: number
  endVerse?: number
  score: number
  kind: 'quote' | 'echo'   // computed per §4, not carried by the source data
}

// Additive — no existing method's signature changes.
getConnections(bookNumber: number, chapter: number): Promise<Record<number, VerseConnection[]>>
```

**Cached like chapters — and better than footnotes, because it is
translation-independent.** The cross-reference dataset is addressed by
`(book, chapter)` alone; it does not vary by translation, unlike footnotes
(BSB-only) or the verse text itself. One cache entry for Genesis 15's
connections serves a BSB reader, a KJV reader, and a Tamil reader alike —
the same property `helloao.ts`'s own comment already documents for verse
anchoring generally ("re-verified against `GET /api/tam_irv/books.json`…
the Tamil translations use the SAME 66 codes… so note anchoring by verse
number survives a language switch untouched"). This is the concrete form of
the business case's "it matters doubly… works in every translation,
including Tamil": the fetch, the cache key, and the ranking are all
translation-agnostic; only §4's quote/echo typing (which reads verse text)
varies by translation, and only in which rows get a highlight, never in
which rows exist.

**The offline story, stated honestly.** `bsb.json.gz` (the self-hosted
fallback) carries verse text only, the same as it carries no footnotes —
during a helloao outage, or genuinely offline, **the connections door has
nothing to show and should not appear**, exactly the precedent
`footnotes-door.md` §5.5 sets ("`notes` is simply absent... during a
helloao outage the reader gets scripture with no doors, which is the right
degradation and needs no code"). Cached connections (from a chapter already
visited this session, or a prior session with a persistent cache) continue
to work offline; connections for a chapter never visited do not, and the
door for that verse is simply absent rather than showing an error. **Do
not** attempt to bundle the whole 344,799-reference corpus into the
self-hosted fallback in rung one — at roughly the same bytes-per-reference
density as the sample fetched here it would add a meaningful and untested
amount to the offline bundle for a feature whose primary path is online
anyway.

---

## 8. First buildable slice

**Ship:** for a verse on the desktop Read/Study workbench, a connections
doorway that:

1. Fetches that chapter's `open-cross-ref` data (one request, cached
   per-chapter, translation-independent per §7).
2. Shows the door only when the verse's top connection scores **≥ 30**
   (§5's recommended, Dennis-confirmable threshold).
3. Shows up to three rows per §6.1–6.2, ranked in the API's own order, with
   a "N more" disclosure for the rest.
4. Labels each row `quote` or `echo` per §4's shared-four-words rule,
   computed against the currently-displayed translation's own text.
5. Tapping a row stacks the target passage per §6.3, reusing the deep
   dive's shared hold-firm/breadcrumb mechanism (built once, shared with
   every other door — not part of this slice if it does not exist yet;
   see acceptance criteria below).

**Acceptance criteria for the slice:**

- A verse whose top connection scores ≥ 30 shows the doorway; a verse below
  that, or with zero connections, shows nothing — verified against at least
  the 11 verses this brief's own sample found above the line, plus a
  hand-check of a chapter known to be richly connected (Deuteronomy 32) and
  one known to be sparse (a genealogy chapter, per `footnotes-door.md`'s own
  list of dense-but-low-value chapters — Nehemiah 7 or 1 Chronicles 1 are
  good candidates precisely because they are the opposite kind of "dense").
- The quote/echo split matches a hand-labelled sample of at least 30 rows
  (the measurement pass §4 flags as still owed) with no false `quote` —
  labelling an echo as a quote and lighting words the target verse never
  used is the failure mode that would visibly embarrass the feature, so
  precision matters more than recall here, mirroring
  `footnotes-door.md` §3.5's own asymmetric bar for its variant classifier.
- Attribution to OpenBible.info / CC BY 4.0 is visible wherever a connection
  is shown (§3.1).
- No network request for connections fires unless the doorway would be
  shown (i.e., the salience check in step 2 can run without the preview
  fetches in step 3, so a verse below threshold costs one chapter fetch,
  not one-per-candidate-row).

**Explicitly out of scope for this slice, each its own later item:**

- The mobile entry point (§6.4 — depends on a deep-dive surface for mobile
  that does not exist yet).
- The reverse ("who quotes this verse") direction (§2.3 — a real corpus
  inversion, not a per-chapter fetch).
- Any UI for the score itself (deliberately never shown, per §6.1).
- Bundling connections into the offline self-hosted fallback (§7).
- The general stack/breadcrumb navigation mechanism, if it is not already
  built by the time this ships (shared plumbing for every door, not scoped
  to this one).

---

## 9. Effort, and the riskiest part

| Piece | Effort | Notes |
|---|---|---|
| Provider: `getConnections`, cache, translation-independent key | **0.5** | No offset computation (§7) — the cheapest seam change in the whole deep dive so far. |
| Quote/echo classifier + its measurement pass | **1** | §4's rule is a first cut; needs the hand-labelled check §8 calls out before it ships, the same discipline `footnotes-door.md` §3.3–3.5 used. |
| Reading surface: doorway + rows + "N more", desktop | **1** | Reuses the prototype's tier system; no new interaction model. |
| Salience threshold: confirm with Dennis against real chapters | **0.25** | §5's number is a recommendation, not yet a decision. |
| Attribution surface | **0.25** | One line, same treatment as the Tamil translations already get. |
| **Total** | **~3** | Cheaper than the footnote door (~5) — mainly because there is no character-offset risk and the data needs no new licence research beyond this brief. |

**The riskiest part is the quote/echo classifier being wrong in the
embarrassing direction: labelling an echo as a quote and lighting words the
source text never actually shares with the target.** Unlike the footnote
door's offset bug (which mis-locates a real note), a bad quote label
*fabricates a relationship* — it tells a reader these two verses share
words when they do not, which is a claim about the text that is simply
false and checkable. Mitigation is the same shape as `footnotes-door.md`'s:
a small blind hand-labelled sample before shipping, not an argument about
the regex.

Second: the mobile entry point does not exist (§6.4). This is not risk in
the sense of "might go wrong" — it is a known, named gap this brief cannot
close, because it is a deep-dive-wide surface question, not a
connections-door one.

---

## 10. What still needs a pass with Dennis

1. **The salience threshold** (§5 — top score ≥ 30). Measured and reasoned,
   not yet confirmed against how it looks on real, familiar chapters.
2. **The four-word quote/echo threshold and stop-word list** (§4). A
   first cut from the prototype's own examples; wants the same kind of
   blind measurement pass the footnote classifier got before either ships.
3. **The exact attribution wording** for OpenBible.info (§3.1) — the licence
   is clear; the expected citation format is not spelled out on their page
   and is worth one look at how other CC BY 4.0 consumers of this same
   dataset word it, or a short email if that turns up nothing.
4. **Whether the reverse direction (§2.3) is wanted at all**, ever — it is a
   real, bigger feature (an inverted 344,799-reference index), not a
   variant of this one, and is deliberately left as a future decision
   rather than folded into rung one's scope by default.
5. **The mobile entry point** (§6.4) is a deep-dive-wide question this brief
   surfaces but cannot resolve alone.

---

## 11. How to re-run every number here

`node scripts/measure-cross-refs.mjs` reproduces §2.2, §5, and §2.3's
per-verse examples directly:

```bash
node scripts/measure-cross-refs.mjs                    # seed 20260912, 200 verses (this brief's numbers)
SAMPLE_SIZE=500 node scripts/measure-cross-refs.mjs     # a bigger sample
SEED=1 node scripts/measure-cross-refs.mjs              # a different draw, as a sanity check
BSB_JSON_PATH=/tmp/bsb.json node scripts/measure-cross-refs.mjs   # reuse an already-downloaded complete.json
```

It fetches `https://bible.helloao.org/api/BSB/complete.json` once (to build
the true verse universe — the cross-reference dataset's own `books.json`
only totals verses per book, not per chapter) and then one
`https://bible.helloao.org/api/d/open-cross-ref/{USFM}/{chapter}.json`
request per distinct chapter the sample touches. If the live endpoint is
unreachable, it falls back to a sample committed in the script itself,
fetched live on 2026-09-12 (same seed, 200 verses, 184 chapters, 0 errors —
identical to this run, confirmed by running the script both live and in a
simulated-offline mode while writing this brief) and says so in its output
rather than presenting the fallback as a fresh measurement.

§2.1's directional example (Genesis 15:6 / Romans 4:3) and §2.3's structural
finding were checked directly against
`GET /api/d/open-cross-ref/GEN/15.json` and
`GET /api/d/open-cross-ref/ROM/4.json`, both fetched live 2026-09-12.

§3.2's licensing finding was checked against
`GET https://api.github.com/repos/spookylukey/bible-quotation-database`
(reports `"license": null`) and the repository's own `README.md`, both
fetched 2026-09-12.

---

## 12. Suggested backlog entry

`docs/BACKLOG.md` now carries a one-line pointer to this brief under the
deep-dive cluster, alongside the footnotes-door and word-door entries.
