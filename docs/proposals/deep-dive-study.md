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
| **Word study** (tap word → original lemma, transliteration, sense range, where else used) | **BSB Translation Tables** (per-word Strong's-tagged) + **STEPBible** TBESH/TBESG lexicons; OpenScriptures Strong's fallback | CC0-leaning (Berean) · CC BY 4.0 (STEPBible) · MIT (OpenScriptures) | **MEDIUM** | Highest value. The hard problem (English word → lemma) is already solved: the BSB's own tables are tagged per word. Build-time ETL → compact gzip bundle next to `bsb.json.gz`. Concordance ("where else") falls out by indexing on Strong's number. |
| **Geography / maps** | **OpenBible Bible-Geocoding-Data** (verse-linked places) | CC BY 4.0 | data **CHEAP** / basemap **MEDIUM–HEAVY** | Places are verse-linked (no NER needed): invert the `verses` index → "places in this chapter → coords". The trap is the *basemap* (see next section). |
| **Book intros / author** | author our own ~66 short intros (research from ISBE PD + Wikipedia, do NOT copy) | we own it | **MEDIUM** (editorial) | No clean, neutral, freely-licensed importable source. Authoring fits our voice + humility better anyway. Bounded one-time content task. |
| **Translation comparison** | — | — | **DROPPED for now** | The translations that would matter (NIV, NKJV) we don't have; ESV is metered. Not worth a door yet. |
| **Cross-references** (built as the first prototype) | helloao `open-cross-ref` (OpenBible) + Luke Plant NT/OT quotation DB for quote-vs-echo typing | CC BY (refs) · verify quotation-DB license | done in prototype | Ranked by `score`. Quote phrase highlight is computable only for direct quotes (shared words); echoes/themes get a soft glow or nothing — never a fake phrase highlight. |

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
