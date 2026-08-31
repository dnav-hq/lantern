# Deep Dive — verse study exploration (design + data research)

Status: **exploration captured, not yet spec'd.** Written 2026-08-30 across a long
design session. The interaction prototype lives at
`design/reference-deep-dive.html` (reference only — see "On the prototype" below).
This document captures the durable thinking, the philosophy guardrails, and the
data research, so the feature can be spec'd (or redesigned) from a solid base.

## What it is

Not "cross-references." The deep dive replicates the whole *roving* study
experience: opening a verse and moving across **levels of zoom**, from a single
word up to whole-Bible themes, pulling in verifiable facts at each level and
assembling the meaning yourself. Cross-references are just one facet.

Origin: Dennis's own study process (Ecclesiastes example) — read the passage,
wonder what a word means (e.g. "vain" = Hebrew *hebel*, and its range of senses),
compare how phrases read across translations, chase cross-referenced verses where
a concept is developed, learn about the author (Solomon → read 1 Kings), and
understand the geography/where things happened — roving "all over the place,"
per word all the way to entire-Bible concepts.

## The USP: psychology-first "doorways, not facets"

The core differentiator, and the thing to protect: **when you open a verse, the
interface has already read it and offers the two-to-four things people actually
get curious about *for this specific verse*, phrased as questions in the reader's
own head, ranked by how rich they are here.** It anticipates the question the
verse provokes and opens the door to it. It must NEVER be a dump of every
category for the reader to rummage through.

Anti-dump entry structure:
1. The verse, calm (reads like scripture).
2. One quiet **signpost** line — what's here to explore, not what it means
   ("a key word · 4 connections · a place").
3. **Two-to-four doorways**, each an invitation in plain language, ranked by
   salience: "What *hebel* means", "Where Scripture echoes this", "Who wrote
   Ecclesiastes?", "See it on the map".
Then: tap a door → dive in → explore → back → pick another (choose-your-own-
adventure). The back-stack is what makes wandering feel safe.

Two things make it feel like it read your mind:
- **Salience decides the doorways**, computed from the verse's actual content: a
  translator footnote or a rich original word surfaces the word door; strong
  cross-references surface the connections door; a geocoded place name surfaces
  the map. Rich verses open more doors, plain verses fewer. Nothing empty is ever
  shown — that is what keeps it from being a dump.
- **The wording is the psychology.** "Lexicon / cross-references / geography" are
  feature names; "what *hebel* means / where this echoes / see it on the map" are
  the reader's questions. Same data, completely different feel.

Future: the doorways could quietly adapt to a reader's recurring curiosity
(always reaches for word meanings, or geography) without hiding salient ones. Not
v1; the natural extension of "built for how your brain works."

## Philosophy guardrails (load-bearing — see the AI-philosophy memory)

Everything stays on-philosophy only while we show **primary data / facts** and let
the reader construct meaning. Never AI-authored "here's what this passage means."
The two danger rungs are **author/book** and **theme** — where it's tempting to
hand over interpretation. The line: book intros are factual and *humble*
(dates, structure, authorship debate stated AS debate); themes are "here are the
places this thread runs," never "here is what it teaches." Epistemic humility is a
feature: Ecclesiastes = "traditionally attributed to Solomon; debated," and the
reader goes and decides. Verifiability applies doubly to the map (below).

## The zoom-spectrum layers + data research (2026-08-30)

Data is confirmed open, self-hostable, offline-capable, and free of new paid/auth
dependencies. Ratings are build effort.

| Layer | Source | License | Rating | Notes |
|---|---|---|---|---|
| **Footnotes / notes** | helloao BSB chapter JSON (`footnotes` + `noteId`) | free-use | **CHEAP** | Already in our fetch path. The *hebel* note is literally in `GET /api/BSB/Ecclesiastes/1.json`. We just don't render it. BSB only (public-domain KJV drops marginal notes). **Ship first.** |
| **Word study** (tap word → original lemma, transliteration, sense range, where else used) | **BSB Translation Tables** (per-word Strong's-tagged) + **STEPBible** TBESG (Greek) and TBESH (Hebrew, Gloss column only) | CC0-leaning (Berean) · CC BY 4.0 (STEPBible, **with carve-outs — see the correction below**) | **MEDIUM** | Highest value. The hard problem (English word → lemma) is already solved: the BSB's own tables are tagged per word. Build-time ETL → compact gzip bundle next to `bsb.json.gz`. Concordance ("where else") falls out by indexing on Strong's number. |
| **Geography / maps** | **OpenBible Bible-Geocoding-Data** (verse-linked places) | CC BY 4.0 | data **CHEAP** / basemap **MEDIUM–HEAVY** | Places are verse-linked (no NER needed): invert the `verses` index → "places in this chapter → coords". The trap is the *basemap* (see next section). |
| **Book intros / author** | author our own ~66 short intros (research from ISBE PD + Wikipedia, do NOT copy) | we own it | **MEDIUM** (editorial) | No clean, neutral, freely-licensed importable source. Authoring fits our voice + humility better anyway. Bounded one-time content task. |
| **Translation comparison** | — | — | **DROPPED for now** | The translations that would matter (NIV, NKJV) we don't have; ESV is metered. Not worth a door yet. |
| **Cross-references** (built as the first prototype) | helloao `open-cross-ref` (OpenBible) + Luke Plant NT/OT quotation DB for quote-vs-echo typing | CC BY (refs) · verify quotation-DB license | done in prototype | Ranked by `score`. Quote phrase highlight is computable only for direct quotes (shared words); echoes/themes get a soft glow or nothing — never a fake phrase highlight. |

### Correction — word-study licensing was wrong (2026-08-30)

The table row above originally recorded the word-study data as "CC BY 4.0
(STEPBible) · MIT (OpenScriptures)". **Both halves of that were wrong**, found
by reading the actual file headers and repository rather than the summaries.
Recorded here because this table has been treated as settled and is cited
elsewhere. Full working in `docs/proposals/word-door-guardrails.md` §4.

**1. STEPBible is not uniformly CC BY 4.0. The Hebrew and Greek halves sit in
different legal positions.**

TBESH's own header says, verbatim:

> Meaning — These are based on the Abridged BDB by Online Bible, © Larry Pierce
> of OnlineBible.net. They are for guidance only. **Permission should be gained
> from Online Bible before these are applied in any project.**

TBESG (Greek) carries no equivalent restriction: its Meaning column is
Abbott-Smith with Middle Liddell fallback, both long out of copyright.

So the plan changes rather than averaging over it:

- **Greek:** ship TBESG glosses and sense text.
- **Hebrew:** ship the TBESH **Gloss** column (Tyndale, CC BY 4.0) plus lemma,
  transliteration and morph class. **Do NOT ship the TBESH Meaning column**
  until either Dennis obtains permission from Online Bible, or it is replaced
  with a public-domain Hebrew source.
- This asymmetry is not visible as a defect, because the presentation rules
  already de-emphasise definition text in favour of occurrences and grammar.
  The Hebrew door shows gloss + grammar + occurrences; the Greek door adds the
  sense range. Hebrew remains the better-populated door, since that is where
  the morphology payload is richest.

Attribution is therefore non-optional. Note also that both files ask readers
not to redistribute them, which sits in tension with the CC BY 4.0 grant
printed two lines above; our build derives a transformed subset rather than
redistributing the files, which is squarely inside CC BY 4.0 and inside the
licence's own permission to "download the data and reformat it for your
application".

**2. OpenScriptures Strong's is NOT MIT. It has no licence at all.**

As of 2026-08-30 the repository has no `LICENSE` file and no `README.md`;
GitHub's API reports `license: null`. It was last pushed 2021-07-15. The "MIT"
recorded above was unverified and the evidence points the other way.

**Consequence: OpenScriptures is out of the v1 build.** It was only ever the
fallback for lemmas STEPBible misses, and that gap is small — measured,
TBESH+TBESG cover 13,334 of the 13,876 (96.1%) distinct Strong's numbers the
BSB tables actually use.

**The lesson worth keeping:** both errors came from trusting a licence summary
instead of opening the file. Every remaining "open licence" claim in this
document should be verified the same way before it is built on, not after.

## The map — a signature feature (stays FREE core)

Decision: the map is not a static study-Bible picture. It is a **custom,
reconstructed, interactive map in our own design language** that turns geography
into a lens on the text: tap a place → the verses set there, the people, the
journeys; trace routes; feel distances. This is the deepest possible expression of
"help the reader SEE, don't see for them." Even though it is a hard build, it
stays in the **free core** (it has ~zero marginal cost once built).

Requirements Dennis set:
- **Verifiable / authentic, never AI-invented.** Geography must come from real
  scholarly geodata (OpenBible's 70+ sources), and be presented as such. This is
  a hard constraint, not a nicety.
- **Looks like a real Bible-study map** — topography, small details, hand-made
  and beautiful, unmistakably Lantern (not a Google/Mapbox embed).
- **Timeline slider** — slide across eras (biblical → modern) to understand what
  the land was/is. Also depends on verifiable historical geodata.

Staging (the basemap is the only real trap):
- **v1:** custom-drawn regional SVG/canvas map (Levant/Mediterranean) rendered
  from OpenBible coordinates. Zero map-engine dependency, offline, on-brand,
  interactive points. This is NOT a compromise on the vision — it's what makes it
  look hand-made rather than generic.
- **later:** richer terrain / pan-zoom via self-hosted vector tiles (Protomaps
  `.pmtiles` + MapLibre) only if demand appears. Historical boundary overlays
  (e.g. `aourednik/historical-basemaps`) can feed the timeline slider.

## On the prototype (`design/reference-deep-dive.html`)

Built for the *cross-references* facet only, iterated heavily. **Reference, not a
mandate** — Dennis's explicit call is that the broader deep-dive design will
likely be redone from scratch so we don't limit the ceiling by forcing reuse.
What it *validated* (durable principles worth carrying forward):
- **Hold-firm stacking:** following a connection never leaves the page; it stacks
  a layer over the held passage. The origin is always reachable; back climbs out.
- **Tappable reasoning breadcrumb** (refs joined by the relationship: "Romans 4:3
  *quotes* Genesis 15:6"), every level reachable — no lock-in.
- **Relevance = order + prominence** (full → one-line → bare ref) plus reference
  colour intensity, NOT a meter/bar (rejected as unintuitive).
- **Highlight-on-arrival** for quotes only (the shared words light up), honest
  about the fact that echoes/themes have no phrase anchor.
- **Breathy, calm aesthetic:** airy entries not filled boxes; the focus verse
  reads like scripture; two-layer transitions (rise / peel) so content is never
  blank mid-animation.

## Monetization stance (product strategy, settled direction)

- **Free core forever, uncrippled — including the complex maps.** That free,
  sacred quality is the project's identity and its trust; trust is the asset a
  passion project can't buy back. Do NOT monetize now.
- All deep-dive data layers are static with ~zero marginal cost → free.
- Paid may enter *later* only where a feature costs real money to provide:
  **AI features** (inference cost) and **shared group spaces** (storage/bandwidth/
  moderation). Consider an optional **supporter/donation** path before any
  paywall — it funds hosting without a wall.
- Architect so a tier *could* slot in without touching the free core. Revisit
  only when cost bites or a genuinely premium-shaped feature is real.

## Sequencing (proposed)

Footnotes (nearly free) → word study (highest value, clean data) → geography
place-data with a custom SVG map → book intros (author them) → theme/whole-Bible
(hardest, later). Group spaces is Dennis's likely next *major* feature (useful for
his own studies) and sits outside this deep-dive arc — to be placed in the
project roadmap.

## Next steps

1. A fresh chat does a research pass on **how people actually study the Bible**
   (methods like inductive study / SOAP / verse-mapping, what people wish digital
   tools did, the spiritual-formation psychology), to inform the roadmap.
2. Long-term **roadmap** across arcs (deep-dive layers, group spaces, AI, native),
   with monetization as a decision point, landed as HQ goals.
3. Then build, starting with footnotes and the word door; likely redesign the
   deep-dive entry surface from scratch on the "doorways" model.

---

## Addendum — 2026-08-30 (research pass on how people actually study)

The "Next steps" above called for a research pass on how people actually study
the Bible before spec'ing this feature. That pass ran the same day (methods
literature, spiritual-formation writers, competitor reviews, and a separate
Reddit pass via the Chrome connector). It **confirmed the core thesis and
changed four things**. Recorded here so the spec starts from the corrected
version.

### Confirmed: doorways, and now with a mechanism

- **Verse mapping is this feature, already invented on paper.** The taught
  sequence is: write the verse, write it in 2–4 other translations, note where
  they diverge, pull 3–5 keywords, chase Strong's, read every other occurrence,
  restate in your own words, apply. That is the zoom spectrum, in the order
  this document guessed. Lantern is removing friction from an existing
  practice, not inventing a behaviour.
- **"Prime the gap, don't fill it" now has a name.** Loewenstein's
  information-gap theory: curiosity is produced by a gap between what you know
  and what you want to know, and **complete ignorance produces little
  curiosity**. A reader shown nothing about a place name is not curious about
  it; one shown "a place, four days' walk from there" is. So a doorway should
  show the *smallest fact that makes a question askable*, never the answer.
- **The 2–4 cap is right, for a reason.** The same literature finds unresolved
  gaps at volume become aversive. Three or four doors, hard cap.

### Change 1: doorways must open LATER than this document assumes

Every narrated study session found in the research starts a hop from a
*specific irritant*, never from a wish to be shown what is interesting: a
repeated word, an unknown word, a footnote link, a remembered echo. One user:
"I just read until I hit something I didn't know what it was."

The ordering rule is stated explicitly by practitioners, and every method
(Precept, BSF, Hendricks) teaches it: read fully first, tools second.

> "The 2 most key ways to understand well are to read fully through entire
> chapters at a time… And then, after you have read this way… then it's ok
> finally after that to come back to a verse. And there are many good tools at
> Biblehub for that… But that's always 2nd, never first, for me, now, based on
> what I've learned from experience."

**Consequence:** the deep dive must never auto-expand on arrival, and belongs
behind a deliberate act — which is what the existing desktop Read/Study toggle
already is. Keep it out of the Read path entirely. This also resolves the
tension with the formational tradition (Whitney's "read less, meditate more";
Peterson's target being speed and mastery): the tension does not dissolve, it
is *contained* by keeping depth in Study.

Note a real minority who consider any doorway a snare, upvoted not buried:
"Outside influence is equivalent to trusting something other than God over God,
which is an idol." Small, but they exist, and they are an argument for the
opt-in default rather than against the feature.

### Change 2: the translation door returns — as a SIGNAL, not a door

This document dropped translation comparison because NIV/NKJV are unavailable
and ESV is metered. The research says divergence is **the single most common
upstream trigger** for going deeper in verse-mapping practice.

But a divergence *door* is the wrong shape, and the objection is Dennis's:
showing a reader two translations they do not use invites "so which one is
right?", which is the footnote-anxiety failure mode wearing a different hat.

**The reframe: divergence is a salience signal that routes to the word door.**
When competent translators land on different English words, the underlying
Hebrew or Greek has more range than one English word can hold. The reader is
never asked to adjudicate; they land on sense range, which is the honest
explanation of *why* the translations differ. This is also "mediated by method,
not by conclusions" (§ Change 4) — the method being "difference in English
means look at the original," exactly what verse mapping teaches.

Two cheap sources for the signal, in order of preference:

1. **BSB's own alternate-rendering footnotes** ("or …", "literally …",
   "Hebrew …"). Divergence evidence from *inside* the translation the reader is
   already reading, with the translators as the source, so no second
   translation is staged against the first. Strictly better on trust.
2. **NET vs BSB**, once NET is added (it is already available on helloao as
   `eng_net`, free and cacheable — see `translations-esv-niv.md` addendum §6).
   NET exists to show where translators disagree, which makes BSB/KJV/NET a
   genuinely informative three-way spread.

**This also splits the footnote layer in two, which the table above treats as
one item.** Alternate-rendering footnotes are the good, low-risk ones.
*Textual-variant* footnotes ("some manuscripts omit…") are the anxiety ones:
readers "often do not have enough information in the footnote to evaluate the
variants." Ship the first; gate the second behind a deliberate action, and
consider whether it needs a sentence of factual framing to be responsible.

### Change 3: the word door needs a guardrail DESIGN, not just data

The word study remains the highest-value layer. It is now also the
highest-risk one, and the risk is documented in exactly the feature being
built: **root fallacy** and **illegitimate totality transfer**. Critics call
Strong's "purely an amateur book," and its observed effect on untrained users
is "a sort of interpretative gumbo." From Reddit, unprompted:

> "I would be careful about thinking that words in common are a good way to
> link together different parts of different texts… If you go too far with
> these types of practices, you can end up just using the bible like a magic
> 8-ball."

Mitigations that stay strictly inside "primary data only":

- Show occurrences **in their sentences**, never as a bare gloss list.
- Show the **range of senses**; never rank definitions or present one as "the"
  meaning.
- Surface **morphology** where the data has it (Strong's omits tense/voice/mood,
  which is where much of Greek's meaning lives).
- Never present a lexicon entry as "what the word really means."

**This is a design pass before it is a build ticket.**

### Change 4: "don't see for them" cannot mean "unmediated data"

The sharpest pushback from the research, and it is worth stating plainly
because it revises a philosophy guardrail rather than a feature:

Shipping raw lexicon data with no interpretive scaffolding does not avoid
seeing for the reader. It hands them a tool that reliably makes them see
*wrongly*, with the app's implicit endorsement. Primary data is not neutral.

**The revised line: mediated by METHOD, not by CONCLUSIONS.** Lantern may
teach and enforce a way of looking (occurrences in context, sense ranges,
commentary last, observation before interpretation). It may not tell the reader
what the passage means. This is a harder engineering and design problem than
"show the data," and it is the thing that makes the feature defensible.

Corroborating demand, and a better positioning line than "help the reader SEE":

> "Very few people have ever been purposely taught 'how' to read and study
> their Bibles. It's just assumed people know where to start and how to do it.
> As a result, many have picked up bad habits and built on them."

People ask "how do you study the Bible?" constantly and get book
recommendations. **The demand is for method, expressed as ignorance of method.**

Also worth recording honestly: **"it gives me information but doesn't help me
SEE" is not a user complaint.** Nobody says it. Users complain about clutter,
ads, crashes, price, and bad note editors; the information/formation critique
comes from teachers and formation writers. The philosophy is defensible as a
design thesis, but positioning it as what users are asking for would be
overclaiming.

### Two additions worth carrying into the spec

- **Semantic distance should govern presentation weight.** Hypertext research
  finds that links to semantically *distant* material interfere with
  comprehension far more than links to close material. Concretely: a lexicon
  gloss, a footnote, and immediate context are cheap and can be inline or a
  peek; a cross-reference into another book is expensive and should require a
  deliberate act with a visible way back. This is empirical support for the
  prototype's hold-firm stacking and breadcrumb, which turn out to be the
  load-bearing parts rather than aesthetic ones.
- **Provenance and confidence are an uncopied differentiator.** OpenBible
  publishes confidence levels per identification across 400+ sources. Surfacing
  that ("scholars disagree on this location") is philosophically consistent,
  cheap, and something no competitor bothers with. It is also the most honest
  possible answer to the objection that curating a free tier is itself an
  interpretive act.

### Competitive position (checked 2026-08-30)

The nearest competitor, [Harvous](https://harvous.com) (solo-built, notes-first,
11 translations, $5/mo for shared spaces), has **no answer to this feature**:
its only comprehension tool is Easton's Dictionary (1897). No Strong's, no
cross-references, no maps, no timeline, no book intros. Its roadmap points at
retention (spaced review, "study seasons") and an AI connector, i.e. away from
understanding the text.

**The deep dive is uncontested**, and the map most of all. See
`note-object.md` for where Harvous *is* ahead (retrieval), and
`translations-esv-niv.md` for the licensing findings.
