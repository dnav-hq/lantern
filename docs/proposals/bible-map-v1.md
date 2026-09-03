# The custom Bible map — data pipeline and v1 technical spec

**Recommendation: build v1 as a build-time ETL over OpenBible's
Bible-Geocoding-Data rendered into hand-authored SVG with pre-projected
coordinates, and do NOT build the timeline slider yet.** The place data is
excellent, openly licensed, verse-linked, and small: a measured **~110 KB
gzipped** for every place, every candidate location, every confidence score and
a chapter + verse index. The base artwork is a solved problem too — public
domain Natural Earth vectors, clipped, projected and simplified at build time
into **~38 KB gzipped** of SVG path data. Zero runtime map library, zero new
npm dependency, fully offline.

The timeline slider is the one piece that **cannot honestly be built today**.
The only ready-made openly-published era-by-era boundary dataset
(`aourednik/historical-basemaps`) is (a) GPL-3.0, which conflicts with this
repo's MIT licence, and (b) demonstrably wrong for exactly the eras the Bible
needs — its 700 BC file is byte-identical to its 1000 BC file over the Levant
and still labels the region "Kingdom of David and Solomon" and "Hittites"
almost three centuries after both ceased to exist. Details and the check that
proves it are in §6. Shipping that would break the verifiability constraint
outright, so v1 ships without it.

This is a **technical and data brief, not a visual design.** It contains no
mockups, no colours and no layout opinions beyond what the data forces.

**Every factual and licensing claim below carries a source URL and a checked
date. All sizes and counts marked "measured" were computed by running the
scripts in §10 against the real datasets on 2026-08-30 — they are not
estimates.** Anything that could not be checked is labelled `unverified`.

**Hard constraint honoured throughout: no coordinate, boundary or geographic
feature in this design is AI-generated, estimated or invented.** Every point
comes from OpenBible's scholarly dataset; every coastline, lake and river comes
from Natural Earth. Where data does not exist, this brief says so and the
feature does not ship.

---

## 1. The place data — OpenBible Bible-Geocoding-Data

### 1.1 Source, licence, exact files

Repository: <https://github.com/openbibleinfo/Bible-Geocoding-Data> (checked
2026-08-30). Default branch `main`; last push 2021-11-01 (checked via the
GitHub API, 2026-08-30 — the dataset is stable, not abandoned-and-broken, but
it is not actively growing either).

Licence, quoted verbatim from the repo's `readme.md` (checked 2026-08-30):

> This data is licensed under a [Creative Commons Attribution
> 4.0](https://creativecommons.org/licenses/by/4.0/) license.
>
> OpenStreetMap data is licensed under [ODbL
> 1.0](https://opendatacommons.org/licenses/odbl/), which is similar to
> CC-BY-SA.

**What that means for us.** CC BY 4.0 requires attribution and nothing else —
compatible with this repo's MIT licence, compatible with commercial use,
compatible with bundling into the app. **The ODbL caveat is load-bearing**: the
polygon geometry for rivers, lakes and city outlines in `data/geometry/*` is
partly derived from OpenStreetMap and carries ODbL, which is share-alike.
**v1 uses point coordinates only** (`lonlat` on each resolution), which come
from the identification data and not from OSM geometry files, so v1 stays
cleanly CC BY. If a later version wants the real river/region polygons, that is
a separate ODbL decision, not something to drift into.

Attribution string to ship (satisfies CC BY 4.0 and matches the phrasing used
elsewhere in the ecosystem):

> Place data: OpenBible.info Bible Geocoding Data by Stephen Smith, CC BY 4.0.

The files, from the repo root (sizes measured from the GitHub contents API,
2026-08-30):

| File | Size | v1 uses it? | What it is |
|---|---:|---|---|
| `data/ancient.jsonl` | 11.0 MB | **yes** | ancient places, verse references, identifications, confidence scores |
| `data/modern.jsonl` | 3.1 MB | **yes** | modern locations: coordinates, coordinate source, precision estimate |
| `data/source.jsonl` | 220 KB | **yes** (small) | the 442-book bibliography |
| `data/geometry.jsonl` | 152 KB | no | metadata for rivers/regions expressed as polygons — ODbL-adjacent, see above |
| `data/image.jsonl` | 1.4 MB | no | thumbnail metadata; images are a separate 180 MB zip |
| `all.kml` | 4.2 MB | no | Google Earth preview |
| `geometry/*` | thousands of files | no | GeoJSON/KML geometry |

Format is [JSON Lines](http://jsonlines.org/) — one complete JSON object per
line. Everything v1 needs is in `ancient.jsonl` + `modern.jsonl`, i.e. **14.1 MB
of build-time input**, none of which ships.

### 1.2 What is actually in there (measured)

Run against `ancient.jsonl`, 2026-08-30 (script in §10.1):

| Fact | Value |
|---|---:|
| Ancient places catalogued | **1,342** |
| Places with at least one verse reference | **1,285** |
| (place, verse) pairs — the raw material of the index | **8,742** |
| Distinct Bible chapters containing ≥1 place | **860** (of 1,189) |
| Distinct verses containing ≥1 place | **5,616** |
| Total candidate modern locations across all places | **4,806** |
| Places with **no** locatable candidate at all | **7** |
| Identifications total | **3,259** |

The 7 genuinely unlocated places are `Azazel`, `Bamah`, `Biziothiah`,
`Holy Place 1`, `Most Holy Place 1`, `Nod`, `Nohah` — a mix of theological
"places", a textual crux, and the land of Nod. **These must render as "location
unknown", never omitted and never guessed.** They are the cheapest possible
demonstration that the map tells the truth.

Place types are dominated by settlements (922) and regions (187), with a long
tail: mountains (47), rivers (41), valleys (38), campsites (32), gates (26),
islands (21). The `campsite` type is worth noting — it is what makes the
wilderness itinerary tractable (see §4.4).

### 1.3 The verse index — no NER needed

This is the reason OpenBible is the right source and the reason the geography
layer is cheap. Each ancient place carries a `verses` array; each entry looks
exactly like this (real record, `Jerusalem`):

```json
{
  "instance_types": { "name": 10 },
  "osis": "Josh.10.1",
  "readable": "Josh 10:1",
  "sort": "06010001",
  "translations": ["csb","esv","kjv","leb","nasb","net","niv","nkjv","nlt","nrsv"],
  "usx": "JOS 10:1"
}
```

`sort` is `BBCCCVVV` — book, chapter, verse, zero-padded, canonical order. This
is **directly compatible with Lantern's own book numbering**: `book_number`
1–66 USFM, as `src/utils/bibleBooks.ts` defines it. `"06010001"` is Joshua
(06) 10:1. Inverting the index is a `groupBy` over `sort.slice(0,5)` — no
named-entity recognition, no text matching against scripture, no fuzzy
anything. The mapping from chapter to places is **given**, not inferred.

Coverage skew is real and worth designing around (measured): the mean chapter
with any place has 6.1 of them, but Joshua 15 has **164**, Joshua 19 has 128,
Joshua 12 has 59, Numbers 33 has 57. The tribal-allotment chapters are
effectively gazetteers. A "places in this chapter" list must handle 164 items
without becoming a wall (see §4.4).

---

## 2. The build-time ETL

### 2.1 Shape

The ETL is a Node script run **by a human, occasionally**, not on every build.
The upstream data last changed in 2021; regenerating it on every CI run would
be 14 MB of network for nothing. It follows the same pattern as whatever
produced `public/bible/bsb.json.gz`: a script that emits a committed artifact.

```
scripts/build-map-data.mjs
  1. read data/ancient.jsonl + data/modern.jsonl from a local checkout
     (or a pinned commit SHA fetched over HTTPS)
  2. for each ancient place:
       - collect every (identification × resolution) that has a `lonlat`
       - attach the identification's confidence score and vote tally
       - attach the modern location's name and precision (from modern.jsonl,
         joined on resolution.modern_basis_id)
       - de-duplicate candidates by rounded coordinate, keep highest score
       - sort candidates by score descending, cap at 6
  3. project nothing — store raw lon/lat (projection is a render concern, §5.2)
  4. build chapter index:  sort.slice(0,5) -> [place index, ...]
     build verse   index:  sort            -> [place index, ...]
  5. write public/map/places.json.gz
```

**Explicitly NOT in the ETL:** any inference, any interpolation, any "nearest
plausible location", any filling of gaps. If OpenBible has no coordinate, the
output has no coordinate.

### 2.2 Output format

One artifact, `public/map/places.json.gz`. Coordinates rounded to 4 decimal
places (≈11 m at this latitude — far finer than OpenBible's own precision
estimates, which start at 250 m for a settlement, so the rounding discards
nothing real).

```jsonc
{
  "v": 1,
  "attribution": "OpenBible.info Bible Geocoding Data by Stephen Smith, CC BY 4.0",
  "source_commit": "<pinned SHA of Bible-Geocoding-Data>",
  "generated": "2026-08-30",

  "p": [                            // places, index-addressed
    {
      "n": "Ai 1",                  // friendly_id
      "t": "settlement",            // primary type
      "sl": "a7e13e1/ai-1",         // deep link path, see §3.4
      "c": [                        // candidates, best first
        { "ll": [35.2611, 31.9169], "s": 522, "m": "Et Tell",             "p": 250 },
        { "ll": [35.2496, 31.9148], "s": 75,  "m": "Khirbet el Maqatir",  "p": 250 },
        { "ll": [35.2286, 31.8975], "s": 28,  "m": "Khirbet Nisieh",      "p": 250 },
        { "ll": [35.2704, 31.9052], "s": 9,   "m": "Khirbet Haiyan",      "p": 250 }
      ],
      "vc": 42,                     // vote_count on the top identification
      "tg": {                       // vote tally on the top identification
        "confidence_yes": 5, "confidence_likely": 10, "confidence_possible": 9,
        "confidence_unlikely": 2, "authority_usually": 12,
        "authority_traditional": 1, "confidence_mostlikely": 1,
        "identified_been": 1, "unknown": 2
      }
    }
  ],

  "ch": { "06010": [12, 88, 341] }, // BBCCC -> place indices
  "vs": { "06010001": [12] }        // BBCCCVVV -> place indices
}
```

**Corrections from the build, 2026-09-03** (the ETL in `scripts/build-map-data.mjs`
is the as-built truth; this section was written from a reading pass, not a build):

- `lonlat` is a **string**, `"36.305000,33.513542"`, not an array. The ETL splits it.
- the vote tally lives at `identifications[].votes.tags`, not flat on `votes`.
- `precision.meters` is present on **1,441 of 1,596** modern records, so `p` is
  optional in the output rather than always there.
- the `Ai 1` record above is real but abridged: it has **five** candidate
  locations (a fifth, `Khirbet Ibn Baraq`, also scoring 9) and its precision is
  **50 m**, not 250 m. The scores 522 / 75 / 28 / 9 are exact.
- two fields were ADDED to each candidate on the strength of §3.3 and §3.4,
  which ask for both: `tr` (`score.time_slope`, the confidence trend) and `cs`
  (`coordinates_source` as `[type, id]`, the coordinate's own citation).

`s` is OpenBible's `score.time_total`: an integer out of 1000 representing
current scholarly confidence (§3.1). `p` is `precision.meters` from
`modern.jsonl` — OpenBible's own estimate of how close the point is to the real
thing.

The `Ai 1` record above is **real output**, not an illustration: four competing
identifications with scores 522 / 75 / 28 / 9. That is what most of this
dataset looks like, and it is why §3 exists.

### 2.3 Measured bundle size

Built for real and gzipped at level 9 (script in §10.2, run 2026-08-30):

| Variant | Raw JSON | **Gzipped** |
|---|---:|---:|
| Minimal — top candidate only + chapter index | 136.7 KB | **35.0 KB** |
| Full — all candidates + vote tallies + chapter index | 415.3 KB | **83.9 KB** |
| **Full + verse-level index (recommended)** | 521.8 KB | **109.8 KB** |

**As built, 2026-09-03:** the shipped `public/map/places.json.gz` is
**142.0 KB gzipped** (645.8 KB raw). The gap to the 109.8 KB above is the two
added candidate fields: dropping `cs` gives 126.3 KB and dropping both `cs` and
`tr` gives 116.5 KB, i.e. the confidence trend and the per-coordinate citation
cost **25.5 KB** between them. Both are load-bearing for §3, so both stay.

**Ship the full variant with the verse index: 110 KB gzipped.** For scale, the
already-shipped `public/bible/bsb.json.gz` is **1,273,758 bytes (1.21 MB)**
(measured on disk, 2026-08-30). The entire map dataset is **8.6% of a bundle
this app already downloads without anyone complaining**, and unlike that one it
loads only when the map opens. Buying the confidence data and verse-level
precision costs 75 KB over the minimal variant, which is not a real trade.

Real-world transfer will be **smaller** than these figures: Cloudflare Pages
serves Brotli, which typically beats gzip -9 on JSON by 10–20% (`unverified` —
not measured here).

### 2.4 Loading it — zero new dependencies

`src/bible/self-hosted.ts` already solves this exact problem for
`bsb.json.gz`, and the map bundle should reuse the pattern verbatim: `fetch`
the `.gz`, **sniff the gzip magic number `1f 8b`** on the received bytes, and
decompress with the browser-native `DecompressionStream('gzip')` only if the
host handed back raw gzip. That sniffing exists because Vite's dev server tags
the file `Content-Encoding: gzip` (browser decompresses transparently) while
Cloudflare Pages can serve it opaquely — the same trap applies identically here,
and copying the solved approach avoids re-learning it.

Consequences: **no new npm dependency at all.** No `d3`, no `topojson`, no
`fflate` (the repo has `fflate` for zip export in `src/platform/export.ts`, but
the gz path uses the native stream API and should keep doing so). The lazy,
memoized-promise loader shape in `SelfHostedBibleProvider` also carries over —
concurrent first reads share one download.

The map data belongs behind the `BereanApi` seam's spirit but not its
interface: it is static scripture-adjacent reference data like the Bible bundle,
so it sits under `src/bible/` or a new `src/map/` alongside it, not in
`src/api/`. It never touches Supabase.

---

## 3. Confidence is a required feature, not a nice-to-have

### 3.1 What OpenBible actually publishes

Two scoring systems, both documented in the repo readme (checked 2026-08-30):

**Vote scores.** Each identification aggregates votes from the scholarly
sources OpenBible consulted, tagged by strength. The readme's table of tag
weights, quoted:

| Vote | Contribution |
|---|---:|
| `confidence_yes` | 30 |
| `identified_is` | 25 |
| `confidence_likely` | 24 |
| `confidence_map` | 24 |
| `confidence_mostlikely` | 23 |
| `identified_been` | 22 |
| `identified_adjective` | 21 |
| `authority_preserved` | 20 |
| `authority_usually` | 19 |
| `authority_scholar` | 17 |
| `authority_parallel` | 16 |
| `authority_variant` | 15 |
| `authority_traditional` | 14 |
| `confidence_possible` | 10 |
| `authority_old` | 3 |
| `unknown` / `uncertain` | 0 |
| `confidence_unlikely` | −10 |
| `confidence_no` | −20 |

The readme's own reading of the result: *"An overall total of 500 or higher
represents high confidence in the identification."*

**Time-weighted scores.** `score.time_values` holds one value per decade of
scholarship (1969-and-before, 1970s, 1980s, 1990s, 2000s, 2010–2020), each *"an
integer best viewed as a fraction of 1000, where 1000 represents very high
confidence."* `time_total` is the most recent decade's value and, per the
readme, *"in theory, reflects the confidence of current scholarship. This value
is used throughout the dataset as the basis for sorting identifications."*
`time_slope` is positive when confidence is rising, negative when falling.

A crucial detail: *"If there's no major dispute about the identification, the
`time_total` and `time_intercept` will be 1000, the `time_best_fits` and
`time_values` arrays will be empty."* Empty arrays unambiguously mean settled.

**Use `time_total` as the single confidence number.** It is the dataset's own
sort key, it is normalised to 1000, and it reflects current rather than
historical scholarship.

### 3.2 How much of the Bible is actually uncertain (measured)

This is the number that decides whether confidence is a feature or a footnote:

| Measure | Places | Share |
|---|---:|---:|
| **Best identification scores 1000** (no dispute at all) | 426 | 32% |
| Best identification scores 750–999 | 167 | 12% |
| Best identification scores 500–749 | 268 | 20% |
| **Best identification scores below 500** — below OpenBible's own high-confidence bar | **474** | **35%** |
| Places with **more than one** candidate location on record | **774** | **58%** |
| Places with ≥2 candidates *each* scoring ≥250 (genuinely contested) | 237 | 18% |
| Places with no candidate at all | 7 | 0.5% |

(Bucket counts corrected 2026-09-03 from the build itself, which scores a place
by the best identification that actually yields a coordinate; the original pass
counted every identification. The totals move by single digits and every share is
unchanged. 774 / 237 / 7 all reproduce exactly.)

**More than half the places in the Bible have more than one proposed location,
and a third have no confident identification at all.** A map that renders every
place as one confident dot would be lying about the majority of its own
content. This is not a polish item to defer — it is the difference between a
map that is true and a map that is not, and the product requirement follows
directly.

### 3.3 The product requirement

Four rules, all derivable from the data above:

1. **Confidence must be visible at the point level, without a tap.** A place
   scoring 1000 and a place scoring 75 must not look the same. The brief takes
   no position on *how* (that is design work) beyond the constraint that the
   encoding must be perceptible and must not rely on colour alone.
2. **Contested places must show their alternatives, not just the winner.** For
   the 774 places with multiple candidates, the alternatives are in the bundle;
   the map must have a way to reveal them. Showing only `Et Tell` for Ai and
   silently dropping `Khirbet el Maqatir` — an identification whose confidence
   is *rising* (`time_slope` +1.85) while Et Tell's falls (−4.08) — is exactly
   the kind of false certainty the philosophy guardrail forbids.
3. **Unlocated places must appear as unlocated.** All 7 of them, listed in the
   chapter's place list with "location unknown", never dropped from the list.
4. **The vote tally is the citation, and it must be reachable.** See §3.4.

### 3.4 Source citation — an honest limitation, and the fix

**The readme documents a `sources` array inside each identification's `votes`
object: "an array containing all the books that contributed to this place's
score."** It is empty in every published record.

**Re-verified 2026-09-03 by the build, and it still holds** — in fact `sources`
is not merely empty but absent: the only key any `votes` object carries is
`tags`. The ETL counts non-empty `votes.sources` on every run and prints a loud
line if that day ever comes, so the bundle can start citing books only when the
data can back it.

Measured, 2026-08-30 (script in §10.3): of **3,259 identifications**, 2,842
carry a `votes` object, and **0 have a non-empty `votes.sources`**. The
442-entry bibliography in `source.jsonl` is published, but the mapping from a
specific book to a specific identification is not in the bulk data. So we
**cannot** render "Aharoni and Rainey place Ai at Et Tell" from the bundle.

What we *can* render, all present in the data:

- the **vote tally** — for Ai 1: 42 votes, of which 5 `confidence_yes`, 10
  `confidence_likely`, 12 `authority_usually`, 9 `confidence_possible`, 2
  `confidence_unlikely`, 2 `unknown`. That is a genuine, verifiable summary of
  what the scholarly literature says, and it is more honest than a single dot;
- the **confidence trend** (`time_slope`) — "confidence in this identification
  has been falling since the 1970s";
- the **coordinate's own source** — `modern.jsonl` carries
  `coordinates_source`, e.g. `{"type": "wikidata", "id": "Q337141"}`, which
  *is* a per-location citation and can be linked;
- a **deep link to the full source list on openbible.info**, which does publish
  the per-place sources. URL pattern `https://www.openbible.info/geo/ancient/
  <ancient_id>/<url_slug>` — verified live 2026-08-30: `/a15257a/jerusalem`
  → HTTP 200, `/a7e13e1/ai-1` → HTTP 200. Both fields are already in
  `ancient.jsonl`, so the ETL stores `"<id>/<url_slug>"` and the link is free.

**Do not scrape openbible.info to synthesise the per-identification source
list.** Link out instead. The vote tally plus the outbound link satisfies the
verifiability constraint honestly; a scraped table would be a maintenance
liability and an imposition on someone else's server.

---

## 4. Rendering — the v1 recommendation

### 4.1 Recommendation: SVG, with pre-projected path data

**Build the map as inline SVG in React, with the base artwork shipped as
pre-projected `<path d="…">` strings and the place markers as React-rendered
SVG elements bound to the data.** Not canvas. Not a hybrid.

The argument is a counting argument, and the counts are measured. The densest
possible scene is Joshua 15: **164 places**, worst case ~6 candidate markers
each if every alternative were shown at once, so a few hundred elements. The
base artwork at the recommended simplification is **380 paths total** (216
coastline + 44 lakes + 120 rivers). A scene of well under 1,000 SVG nodes is
utterly unremarkable for a browser; canvas earns its keep somewhere north of
10,000 marks, and this is not near that.

What SVG buys, all of which canvas would cost real work to rebuild:

- **Hit-testing is free.** Tap a place → a DOM event on that element. Canvas
  requires a hit-region index or a second off-screen colour-keyed canvas.
- **Accessibility is possible.** `<title>`, `role`, `tabindex`, keyboard focus
  order, screen-reader names — a canvas map is an opaque rectangle. Given the
  confidence requirement in §3, "this place is uncertain" has to be conveyable
  non-visually, and in SVG that is an attribute.
- **Styling is CSS.** The app's theming (`berean-visual-theme`, the OLED
  true-black work) already drives everything through CSS. An SVG map inherits
  the theme system for free; a canvas map needs every colour threaded through
  JS and repainted on theme change.
- **The hand-made look is easier.** Textures, filters, dashed strokes,
  stroke-linejoin, tapering rivers, hachures — the things that make it look
  drawn rather than generated — are declarative in SVG and manual pixel work in
  canvas.
- **It matches the codebase.** Plain React 18, no framework, hand-written CSS.
  An SVG tree is idiomatic here; an imperative canvas render loop with its own
  invalidation logic is not.

**When to revisit:** if a future feature renders every place in the Bible at
once (4,806 candidate points) *with* per-point animation, measure before
assuming SVG holds. That is the only scenario in sight that would justify
canvas, and it is not v1.

### 4.2 Base artwork: sourcing, and measured sizes

**Source: Natural Earth, 10 m physical vectors.** Terms of use, quoted from
<https://www.naturalearthdata.com/about/terms-of-use/> (checked 2026-08-30):

> All versions of Natural Earth raster + vector map data found on this website
> are in the public domain. […] No permission is needed to use Natural Earth.
> Crediting the authors is unnecessary.

Public domain, no attribution required, commercial use fine, modification fine.
This is the cleanest licence available for geographic data and it removes the
whole licence question from the base artwork.

GeoJSON conversions are published at
<https://github.com/nvkelso/natural-earth-vector> (the `geojson/` directory;
repo licence reported as `NOASSERTION` by the GitHub API because the upstream
data is public domain and the repo carries its own notice — the *data* terms
are the Natural Earth terms quoted above).

Layers used, and what the build produces (measured 2026-08-30, script §10.4 —
clipped to the recommended extent, projected, Douglas-Peucker simplified,
2-decimal path coordinates, gzip -9):

| Layer | Source file | Source size | Paths out | Vertices in → out | **Gzipped SVG** |
|---|---|---:|---:|---:|---:|
| Coastline | `ne_10m_coastline.geojson` | 9.6 MB | 216 | 410,957 → 4,066 | **23.1 KB** |
| Lakes | `ne_10m_lakes.geojson` | 4.8 MB | 44 | 162,852 → 770 | **4.4 KB** |
| Rivers | `ne_10m_rivers_lake_centerlines.geojson` | 7.0 MB | 120 | 256,386 → 1,692 | **10.2 KB** |
| | | | **380** | | **≈37.7 KB** |

A finer coastline (Douglas-Peucker ε 0.00015 rather than 0.0004) yields 8,496
vertices and **45.9 KB gzipped** — still small. **Ship the finer coastline and
the coarser inland layers: ≈60 KB gzipped of base artwork.**

**As built, 2026-09-03** (`scripts/build-map-data.mjs`, ε expressed in view-box
units — 0.18 for the coastline, 0.48 inland — over the same Natural Earth files,
pinned at `ca96624`):

| Layer | Paths out | Vertices in → out | Gzipped |
|---|---:|---:|---:|
| Coastline | 216 | 410,957 → 8,531 | 44.7 KB |
| Lakes | 44 | 162,852 → 772 | 4.2 KB |
| Rivers | 120 | 256,386 → 1,696 | 9.8 KB |
| **`public/map/base.json.gz`** (all three plus the view box + metadata) | **380** | | **59.0 KB** |

Path counts reproduce the brief exactly and the total lands on the ≈60 KB target. The coastline is
the silhouette people recognise; rivers and lakes are context.

**Total v1 payload: ≈60 KB artwork + 110 KB data = ~170 KB gzipped**, lazily
loaded on first map open, cacheable forever (the data is a pinned upstream
commit; the artwork is derived from a fixed Natural Earth release).

**Topography — MEASURED 2026-09-03, no longer `unverified`.** Natural Earth also
publishes public-domain shaded-relief and bathymetry *rasters* (`NE1`/`NE2`/`SR`
series, same terms of use). §9a decision 2 put terrain into v1 as an opt-in layer
and required the size to be measured first. It has been. Both candidates were
clipped to the extent, warped into the same Lambert Conformal Conic frame as the
vectors (an equirectangular crop would NOT line up with a conic projection) and
encoded as PNG at deflate level 9:

| Source | 1200 px | 1600 px | 2000 px | 2400 px |
|---|---:|---:|---:|---:|
| `SR_50M` — grayscale shaded relief | 384 KB | **685 KB** | 922 KB | 1,169 KB |
| `NE1_50M_SR_W` — full-colour relief | 1,497 KB | 2,551 KB | 3,196 KB | 3,691 KB |

**Shipped: `SR_50M` grayscale at 1600×916, 685 KB** (`public/map/terrain.png`).
Grayscale is not merely 4× smaller than colour, it is the right layer: colour
belongs to the app's own themes, and a grey hillshade sits under hand-drawn ink
without fighting it. The build refuses to write anything over 1.5 MB and falls
back to vectors only, so the size cannot quietly grow past the budget on a later
rebuild. It is a separate file, fetched only when the layer is switched on, and
excluded from the service-worker precache — the default payload is unchanged at
places + artwork.

The 10 m raster series (`NE1_HR_LC_SR_W`, a 323 MB download) was not built: the
50 m series is 30 px/degree, which at this extent already exceeds the display
density the vectors are simplified for.

**Honest limitation, and it must be stated in-product.** Natural Earth is
*modern* geography. The Dead Sea's modern outline is not its Iron Age outline;
the Nile delta, Tyre's isthmus and several Mediterranean coastal margins have
all moved. **v1's base artwork is the present-day land, with the ancient places
plotted on it.** That is defensible and honest; presenting it as "the world as
it was" would not be. A one-line caption in the map's about/attribution area
covers it. Reconstructed palaeo-coastlines are a research problem, not a
dataset we can download (`unverified` — no openly-licensed palaeo-coastline
vector dataset for the Levant was found in this pass; it was not exhaustively
searched).

### 4.3 Projection and extent

**Extent, chosen from the data rather than from taste.** Coordinate coverage of
all 4,806 candidate points (measured, §10.5):

| Extent | lon / lat | Points covered |
|---|---|---:|
| Levant tight | 33 → 37.5, 29 → 34 | 4,037 (**84.0%**) |
| Levant + Sinai + S. Syria | 31 → 39, 27.5 → 36.5 | 4,365 (**90.8%**) |
| Near East, Nile → Tigris | 28 → 50, 25 → 42 | 4,646 (**96.7%**) |
| **Bible world, Rome → Persia** | **10 → 60, 20 → 45** | **4,741 (98.6%)** |

**Re-measured 2026-09-03 by the build: 4,741 of 4,806 coordinates (98.6%) fall
inside 10→60 / 20→45 — the table above reproduces exactly.**

Full data bounds are lon −6.94 → 102.00, lat −20.16 → 44.94 — the western
extreme is `Tarshish 2` (Spain), the eastern is `Uphaz`. **Recommendation: one
"Bible world" canvas at 10→60 / 20→45 covering 98.6% of points, with the ~65
far outliers handled as off-canvas edge indicators rather than by stretching
the extent** — including Spain and India in the same frame would shrink the
Levant, where 84% of the content is, into illegibility.

**Projection: Lambert Conformal Conic**, standard parallels 27°N and 40°N,
central meridian 35°E. Reasons: it is the standard choice for mid-latitude
east–west regions; it preserves shape locally, so the Sea of Galilee and the
Jordan look right; and distortion across a 25° latitude band is small. Plain
equirectangular (lon/lat straight to x/y) would stretch the region horizontally
by roughly 1/cos(31°) ≈ 17% at Jerusalem's latitude, which is visible and wrong
for a feature whose selling point is *feeling real distances*.

**The projection runs at build time only.** ~30 lines of maths (the LCC
forward formula, implemented in the §10.4 script) applied to the base artwork
during ETL, and applied to place coordinates in the client with the same ~15
lines. **No `d3-geo`, no `proj4`, no dependency.** The client needs the forward
transform only — never an inverse, never a full projection library — because
every interaction is "where does this lon/lat go on screen", not the reverse.

Store raw lon/lat in the bundle (not projected pixels) so the projection stays
a render-time decision. The cost is ~15 lines of client maths; the benefit is
that changing the extent or projection later does not require regenerating the
data bundle.

### 4.4 Pan and zoom without a map engine

The whole interaction model is **one SVG `viewBox` and one CSS transform.**

- **Zoom** = narrow the `viewBox`. `viewBox="x y w h"` with smaller `w`/`h`
  zooms in; the browser's own vector rasteriser keeps everything crisp at any
  scale, for free. Stroke widths need `vector-effect="non-scaling-stroke"` (or
  an inverse-scaled `stroke-width`) so coastlines don't fatten as you zoom.
- **Pan** = translate `viewBox` x/y.
- **Gestures** = pointer events. `pointerdown`/`pointermove`/`pointerup` for
  drag; two-pointer distance ratio for pinch; `wheel` with `ctrlKey` for
  trackpad pinch on desktop. This is ~120 lines of ordinary React state, all of
  it testable as pure functions (given a gesture, given a viewBox → new
  viewBox), which suits a repo whose tests target `src/utils/`.
- **Marker scale** — markers must *not* scale with zoom, or they become blobs.
  Render them in screen space: keep the marker group untransformed and
  reposition each marker per frame from the current viewBox, or wrap each
  marker in a counter-scaling transform. Either is a few lines.
- **Label decluttering** at low zoom is the one genuinely fiddly bit: with 164
  places in Joshua 15, labels overlap. Greedy collision suppression by
  confidence rank (highest-confidence label wins the space) is ~40 lines and
  doubles as a confidence cue.
- **Offline** — every byte is a static asset already in the app's origin. The
  data bundle is deliberately **excluded from the PWA precache**, exactly as
  `bsb.json.gz` is, and fetched lazily on first map open; once fetched it is
  cached. No tile server, no runtime network call, nothing to fail.

**Chapter-density handling.** For Joshua 15's 164 places, the map itself is
fine — 164 markers is nothing. It is the *list* beside it that needs thought
(grouping, scrolling, or filtering by confidence). That is a design question,
not a technical one, and this brief only flags it.

**Numbers 33 is the obvious first showcase**: 57 places in one chapter, typed
`campsite`, in narrative order — the wilderness itinerary is a route the data
already draws. "Trace journeys" needs no extra dataset for it; the verse order
*is* the route order. Paul's journeys are harder (the itinerary is narrative,
not enumerated) and are `unverified` as to feasibility from this data alone.

---

## 5. What v1 explicitly does NOT include

1. **The timeline slider.** See §6. No verifiable data exists for the biblical
   eras.
2. **Historical/political boundaries of any kind.** Same reason.
3. **Terrain and topography rasters.** Deferred, additive, decide after the
   vector map exists (§4.2).
4. **River and region polygons from OpenBible's geometry files.** ODbL
   share-alike; v1 uses points only (§1.1). Rivers come from Natural Earth
   (public domain) instead.
5. **Location thumbnail photographs.** OpenBible publishes a 180 MB thumbnail
   zip with per-image licences that *vary*. Individually clearable, not bulk
   clearable — a separate piece of work with a real licensing audit attached.
6. **Palaeo-coastlines.** Modern coastline, honestly labelled (§4.2).
7. **A search-by-place-name entry point.** The map's entry point in v1 is the
   chapter you are reading. Place search is a natural follow-on and rides the
   same bundle.
8. **Any map library, tile server, or network call at runtime.**

### The trigger for the later vector-tile approach

The staged plan is a v2 of self-hosted [Protomaps](https://protomaps.com/about)
`.pmtiles` + [MapLibre GL JS](https://maplibre.org/). Licensing is clean
(checked 2026-08-30): the PMTiles specification is **public domain**; the
basemaps generation code is **BSD-3**; the cartographic styles are **CC0**;
`maplibre-gl` on npm is **v6.6.0, BSD-3-Clause, 19.5 MB unpacked**. The
underlying OpenStreetMap data is **ODbL**.

**Do not build it on aesthetics or ambition. The trigger is a specific,
falsifiable observation:**

> Users are zooming past the level of detail the vector artwork can supply —
> i.e. the map is being used to answer "what is *at* this place, on the ground"
> (streets, modern settlements, terrain relief at settlement scale), not "where
> is this place in relation to that one". Concretely: repeated zoom-to-maximum
> interactions in telemetry, or direct feedback asking for detail the Natural
> Earth 10 m vectors cannot resolve.

Absent that, v2 is a **regression** on three of the stated requirements: it
adds a 19.5 MB dependency, it makes the map look like a generic OSM basemap
rather than hand-made, and it makes true offline use conditional on having
downloaded a tile archive. The hand-drawn v1 is not a compromise waiting to be
replaced; it is the thing that satisfies the brief. v2 is for a need that does
not exist yet.

---

## 6. The timeline slider — the honest verdict

**Verdict: the timeline slider cannot be built on verifiable data for the
biblical eras today, and v1 must not ship it.** Not deferred for effort
reasons — deferred because the data does not exist in a form that is both
openly licensed and historically correct, and the alternative is inventing
boundaries, which the hard constraint forbids.

### 6.1 The obvious candidate fails on two independent grounds

<https://github.com/aourednik/historical-basemaps> — 792 stars, last pushed
2026-01-26, 54 world-boundary GeoJSON files (checked via the GitHub API,
2026-08-30) spanning: 123000 BC, 10000 BC, 8000 BC, 5000 BC, 4000 BC, 3000 BC,
2000 BC, 1500 BC, 1000 BC, 700 BC, 500 BC, 400 BC, 323 BC, 300 BC, 200 BC,
100 BC, 1 BC, then AD 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100,
1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800,
1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010. On
paper that is exactly the era coverage a biblical timeline wants.

**Ground 1 — licence.** The repository is **GPL-3.0** (confirmed via the GitHub
API and the `LICENSE` file, checked 2026-08-30 — *not* CC BY-SA, which is what
one might assume for a data repo). This repo is **MIT**. Bundling GPL-3.0
material into an MIT-licensed application and distributing the result is at
best a licence question requiring a real answer and at worst a violation.
Whether GPL-3.0 meaningfully attaches to non-software geographic data is a
genuinely contested question and **not one to resolve by assumption**
(`unverified` — no legal opinion sought). The clean paths are: ask the author
for an explicit data licence, or don't use it.

**Ground 2 — it is wrong for our eras, and this is the decisive one.** Measured
2026-08-30 (script §10.6): the features intersecting the Levant/Near East box
(lon 31–40, lat 28–37) in `world_bc1000.geojson` are *Kingdom of David and
Solomon*, *Hittites*, *Egypt*, *Arameans*, *Urartu*, *Arabian pastoral
nomads*, *Saharan pastoral nomads*, *state societies and Aramaean kingdoms*.

The features in `world_bc700.geojson` for the same box are **exactly the same
list**, and the geometry is **byte-identical** — verified by comparing the
serialised geometry of each feature between the two files:

```
Kingdom of David and Solomon     bc1000:True bc700:True identical geometry:True
Hittites                         bc1000:True bc700:True identical geometry:True
Egypt                            bc1000:True bc700:True identical geometry:True
```

By 700 BC the united monarchy had been divided for roughly 230 years, the
northern kingdom had fallen to Assyria (722 BC), Judah was an Assyrian vassal,
and the Hittite empire had been gone for some five centuries. **The dataset
carries a 1000 BC snapshot forward unchanged through the single most
historically eventful period in the entire biblical narrative**, and it has no
Israel, no Judah, no Assyria, and no Babylon in the Levant at all for those
centuries.

Every feature in `world_bc1000.geojson` also carries `BORDERPRECISION: 1`,
which the project's own README defines as *"approximate"* (its scale is 1
approximate / 2 moderately precise / 3 determined by international law) —
measured: **163 of 163 features are `1`**. And the README states its own
provenance and caveat plainly:

> It is __work in progress__: verify the maps by comparison to other sources
> before using in academic work.

> This project started as a collection of basemaps collected, adapted and
> converted from diverse sources, sometimes only available through the wayback
> machine. Among these sources, anonymous students from the "ThinkQuest Team
> C006628".

For a general world-history visualisation at continental scale, that is a fine
and useful dataset used exactly as its author describes. **For a Bible app
whose entire promise is verifiability, presenting it as "the land in 700 BC"
would be presenting anonymous, approximate, self-declared work-in-progress
boundaries as scholarship.** That is precisely the failure mode the hard
constraint exists to prevent.

### 6.2 What else exists, and why none of it closes the gap

Checked 2026-08-30:

| Source | Licence | Verdict for our timeline |
|---|---|---|
| **Pleiades** — <https://pleiades.stoa.org/> | **CC BY 3.0** (quoted from <https://pleiades.stoa.org/credits>: *"Sharing and remixing permitted under terms of the Creative Commons Attribution 3.0 License (cc-by)"*) | Licence is fine. But Pleiades is a **gazetteer of places**, 36,000+ of them, not a set of era-by-era political boundary polygons. It could enrich place data; it cannot drive a boundary timeline. |
| **Ancient World Mapping Center** — <https://awmc.unc.edu/gis-data/> | **CC BY-NC 4.0** (per search results describing AWMC map terms; the `/gis-data/` page itself states only "free and open access" without a quotable licence block — **partly `unverified`**, would need a direct email to awmc@unc.edu) | **Non-commercial clause is disqualifying-by-default** given the monetization stance leaves a paid tier open, and its coverage is the Greco-Roman Mediterranean rather than Iron Age Israel/Assyria/Babylon. |
| **Natural Earth** | Public domain | Modern boundaries only. Useless for a historical timeline; already used for physical geography. |
| **geoBoundaries** | CC BY 4.0 | Modern administrative boundaries only. |
| **CShapes** | — (`unverified`) | Historical *state* boundaries, but the modern era (post-1886), not antiquity. |
| **World Historical Gazetteer** | — (`unverified`) | Place-centric linked data, same shape of gap as Pleiades. |

A targeted search for an openly-licensed GeoJSON dataset of Iron Age
Assyrian/Babylonian/Israelite boundaries returned **nothing usable** (searched
2026-08-30). The good boundary maps for these eras exist — in the Barrington
Atlas, in Aharoni & Rainey's *Carta Bible Atlas*, in ASOR's map collection —
and they are **copyrighted print cartography**. Tracing them would be
copyright infringement dressed as data work.

### 6.3 What that means, era by era

| Era | Real, openly-licensed boundary data? |
|---|---|
| Patriarchal / Bronze Age (pre-1200 BC) | **No.** |
| Conquest & Judges (~1200–1050 BC) | **No.** |
| United monarchy (~1050–930 BC) | Only `historical-basemaps`' single approximate GPL polygon. **Not usable.** |
| Divided monarchy, Assyrian & Babylonian periods (930–539 BC) | **No — and this is the worst gap**, since it is where the prophets and most of Kings/Chronicles sit, and it is exactly the period the one available dataset gets wrong. |
| Persian period (539–332 BC) | `historical-basemaps` `world_bc500.geojson` has an *Achaemenid Empire* polygon — plausible-looking, still GPL, still `BORDERPRECISION: 1`. |
| Hellenistic / Hasmonean (332–63 BC) | Thin. AWMC is the real source and it is NC-licensed. |
| Roman / New Testament (63 BC – AD 100) | **The best-covered era**: `world_100.geojson` has *Roman Empire* and *Nabatean Kingdom*; AWMC has genuine Roman provincial data. Still GPL / NC respectively. |
| Modern | Natural Earth, public domain. Trivially available. |

**Only the two ends of the range — Roman era and modern — have anything
approaching usable data, and both have a licence problem.** A slider that works
at AD 100 and 2026 and is blank or wrong for the whole Old Testament is not a
feature; it is a broken promise about the eras the app is most about.

### 6.4 Recommendation

**Do not build the timeline in v1. Do not build it as a "v1.5" either.** The
honest options, in order of preference:

1. **Ship the map without it.** The place layer alone delivers "tap a place →
   the verses set there, trace journeys, feel distances", which is the core of
   the vision. Say plainly, in the map's about text, that historical boundaries
   are not shown because verifiable openly-licensed data for them does not
   exist. **That sentence is itself on-brand** — it is the epistemic humility
   the philosophy guardrails ask for, made concrete.
2. **If the timeline later becomes a priority: commission or license it.**
   Either negotiate a licence with a rights-holder (Carta, ASOR), or have a
   qualified historical geographer produce boundary polygons for a defined set
   of eras with per-boundary source citations and an explicit precision band —
   the same confidence-first treatment §3 gives the places. That is a real
   project with a real cost, not a data-import task.
3. **A weaker but genuinely honest interim** (not recommended for v1, recorded
   so the option is on the table): no boundaries at all, but an era slider that
   filters the *places* — showing only places attested in texts from a given
   period, drawn from the verse references we already have. It uses data we
   have, it invents nothing, and it still conveys "the land changed". It is a
   different feature from what was asked for, and it should be pitched as such
   rather than substituted quietly.

**What must not happen: drawing approximate boundaries because they look
right.** A hand-drawn "roughly the extent of Assyria" polygon would be
indistinguishable to a user from scholarship, and it would be the one place in
the whole app where Lantern made something up.

---

## 7. Build effort, by piece

Effort bands match the deep-dive research doc's convention (CHEAP / MEDIUM /
HEAVY). These are build-effort estimates, `unverified` in the sense that no
implementation has been attempted beyond the measurement scripts in §10 — which
did, however, exercise the ETL and the artwork pipeline end to end, so those two
rows rest on something real.

| # | Piece | Effort | Notes |
|---|---|---|---|
| 1 | ETL script → `places.json.gz` | **CHEAP** | The measurement script in §10.2 is already 80% of it. Pure data transformation, unit-testable without a browser, no network at runtime. |
| 2 | Base artwork pipeline (clip → project → simplify → SVG paths) | **CHEAP–MEDIUM** | §10.4 proves the pipeline. The remaining work is cartographic judgement — which ε, which layers, how the coastline is *drawn* — not code. |
| 3 | Bundle loader | **CHEAP** | Copy `src/bible/self-hosted.ts`'s fetch + gzip-sniff + memoized-promise pattern. Genuinely near-free. |
| 4 | SVG map component + viewBox pan/zoom + gesture handling | **MEDIUM** | ~120 lines of pointer maths, all pure-function testable. Marker screen-space scaling and momentum are the fiddly parts. |
| 5 | Confidence encoding + alternatives UI + unknown-location handling | **MEDIUM** | §3.3's four rules. Mostly design; the data is already in the bundle. |
| 6 | Chapter↔map integration (reading view ↔ places in this chapter) | **MEDIUM** | The index makes the lookup trivial; the work is the surface, plus the 164-places-in-Joshua-15 density problem. |
| 7 | Label placement / decluttering | **MEDIUM** | Greedy collision suppression ranked by confidence. Easy to get 80% right, fiddly to get to 95%. |
| 8 | Attribution, licence and honesty copy | **CHEAP** | Required by CC BY 4.0 and by §3/§4.2. Small, non-optional. |
| 9 | Terrain raster layer | **deferred** | §4.2. Additive; decide after the vector map exists. |
| 10 | Timeline slider | **BLOCKED** | §6. Not an effort question. |

### The single riskiest part

**Not the code — the cartography.** Specifically: **piece 2, making 380
generated paths look hand-drawn and beautiful rather than like a plotted
shapefile.**

Everything else in this brief is de-risked. The data is measured. The bundle
sizes are measured. The projection maths is written and run. The loader already
exists in the codebase. Pan/zoom is a viewBox. Those pieces will work.

What is *not* de-risked is that "custom SVG map from Natural Earth vectors" and
"looks hand-made, topographic, unmistakably Lantern" are separated by a
substantial amount of visual-design work that no dataset supplies. A simplified
coastline rendered with a plain stroke looks like a GIS export. Getting to
hand-drawn means textures, layered strokes, deliberate imperfection, considered
typography, terrain treatment — and if that work does not land, the feature
fails on the requirement Dennis stated most emphatically, while every technical
metric reads green.

**Mitigation: prove the look before building the interaction.** A static SVG of
the region, one chapter's places on it, styled to the intended standard, is a
few hours of work and answers the only question that matters. If it looks like
a Bible-study map, everything downstream is ordinary engineering. If it does
not, that is discovered before any pan/zoom, index or component work is spent —
and the terrain-raster decision (§4.2) becomes the obvious next lever rather
than a late rescue.

---

## 8. Sources, with checked dates

All checked **2026-08-30**.

| # | Source | URL | Licence |
|---|---|---|---|
| 1 | OpenBible Bible-Geocoding-Data | <https://github.com/openbibleinfo/Bible-Geocoding-Data> | CC BY 4.0 (OSM-derived geometry: ODbL 1.0) |
| 2 | — its documentation | `readme.md` in the repo above | — |
| 3 | — its browsable interface | <https://www.openbible.info/geo/> | — |
| 4 | — place page pattern (verified HTTP 200) | `https://www.openbible.info/geo/ancient/<id>/<slug>` | — |
| 5 | Natural Earth terms of use | <https://www.naturalearthdata.com/about/terms-of-use/> | **Public domain**, no attribution required |
| 6 | Natural Earth GeoJSON conversions | <https://github.com/nvkelso/natural-earth-vector> | repo `NOASSERTION`; data terms per #5 |
| 7 | aourednik/historical-basemaps | <https://github.com/aourednik/historical-basemaps> | **GPL-3.0** |
| 8 | Pleiades gazetteer | <https://pleiades.stoa.org/> · <https://pleiades.stoa.org/credits> | **CC BY 3.0** |
| 9 | Ancient World Mapping Center GIS data | <https://awmc.unc.edu/gis-data/> | **CC BY-NC 4.0** — partly `unverified`, see §6.2 |
| 10 | Protomaps | <https://protomaps.com/about> | spec public domain; code BSD-3; styles CC0; OSM data ODbL |
| 11 | MapLibre GL JS | npm registry, `maplibre-gl@6.6.0` | BSD-3-Clause, 19.5 MB unpacked |
| 12 | CC BY 4.0 deed | <https://creativecommons.org/licenses/by/4.0/> | — |
| 13 | ODbL 1.0 | <https://opendatacommons.org/licenses/odbl/> | — |
| 14 | JSON Lines format | <http://jsonlines.org/> | — |

Claims explicitly labelled **`unverified`** in this document: Brotli's advantage
over gzip on this payload (§2.3); the size of a clipped Natural Earth terrain
raster (§4.2); the existence of any openly-licensed palaeo-coastline dataset for
the Levant (§4.2); AWMC's exact licence text (§6.2); CShapes' and World
Historical Gazetteer's licences (§6.2); whether GPL-3.0 meaningfully attaches to
geographic data (§6.1); feasibility of deriving Paul's journeys from this data
alone (§4.4); the build-effort bands in §7.

---

## 9a. RESOLVED with Dennis, 2026-09-02

1. **Extent: the wider "Bible world" frame** (10→60 / 20→45, 98.6% coverage)
   with edge indicators, as §4.3 recommends. The tighter Levant crop is more
   beautiful and drops Rome, Babylon and Ur off the canvas — Acts and the exile
   stop making sense without them.
2. **Terrain raster IS in v1, as a view option** — a change from §4.2's
   recommendation, made deliberately. The vector map always ships and stays the
   default; terrain is an opt-in layer, lazily fetched only when switched on, so
   it cannot bloat the ~170 KB base payload for readers who never use it.
   **§4.2 records the raster size as `unverified`, so the build MEASURES it
   first and reports the number.** Natural Earth's raster series is public
   domain on the same terms as the vectors, so there is no licence question.
3. **The GPL email to `aourednik` is dropped.** It could only unblock era
   polygons for evaluation, and §6.1's accuracy finding — the 700 BC Levant
   geometry being byte-identical to the 1000 BC file — kills the timeline
   regardless. Nothing to buy with the effort.
4. **The interim place-filtering slider (§6.4 option 3) is dropped.** It is a
   different feature wearing the timeline's clothes, and shipping a lookalike
   for a thing we decided not to build is worse than the absence.

Everything else in this brief stands: SVG with pre-projected paths, no map
library, confidence as a required feature, and the timeline out on evidence.

### Slice 1, as built (2026-09-03) — data and artwork, nothing renders

- `scripts/build-map-data.mjs` (`npm run build:map-data`) is the ETL, pinned to
  OpenBible `7eb18a5` and natural-earth-vector `ca96624`. Source data is not
  committed; the derived bundles are. It re-measures every number this brief
  claims on each run and prints them.
- `src/utils/mapData.ts` holds the projection, the simplifier, the index keys,
  the confidence bands and the lazy gzip-sniffing loader. The build script
  imports it through tsx, so the artwork is projected by the SAME code that will
  project the place points in the client — those two cannot drift.
- `public/map/places.json.gz` (142.0 KB), `public/map/base.json.gz` (59.0 KB),
  `public/map/terrain.png` (685 KB, opt-in). All three are excluded from the
  service-worker precache by `**/map/**` in `vite.config.ts` — the terrain layer
  is a `.png`, which the precache glob otherwise matches.
- No new dependency. No UI, no route, no component, no timeline slider and no
  place-filtering slider.

---
## 9. Open questions for a human

1. **Extent.** §4.3 recommends "Bible world" (10→60 / 20→45, 98.6% coverage)
   with edge indicators for outliers. A tighter Levant frame is more beautiful
   and drops Rome, Babylon and Ur off the canvas. This is a design call the data
   informs but does not settle.
2. **The GPL question.** Worth one email to `aourednik` asking for an explicit
   data licence — it costs nothing and would at least unblock the Persian and
   Roman era polygons for evaluation. It would not fix §6.1's accuracy problem.
3. **Terrain raster in v1 or after.** §4.2 recommends after; if the hand-made
   look proves to depend on relief, that flips.
4. **Whether the place-filtering interim slider (§6.4 option 3) is wanted at
   all**, given it is a different feature from the one that was asked for.

---

## 10. Reproducing every measurement

All scripts were run on 2026-08-30 against freshly downloaded data. Inputs:

```bash
mkdir obgeo && cd obgeo
for f in ancient.jsonl modern.jsonl source.jsonl geometry.jsonl; do
  curl -sSL -o $f https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/data/$f
done
for f in ne_10m_coastline ne_10m_lakes ne_10m_rivers_lake_centerlines; do
  curl -sSL -o $f.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson
done
for y in bc1000 bc700 bc500 100; do
  curl -sSL -o hb_$y.geojson https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_$y.geojson
done
```

**10.1 — place, verse and confidence counts (§1.2, §3.2).** Load
`ancient.jsonl`; count records; count `verses` entries; group `verses[].sort` by
`[:5]` for chapters and by full value for verses; for each place collect every
`identifications[].resolutions[]` with a `lonlat`, tagged with the parent
identification's `score.time_total`; bucket the maximum score per place; count
places whose deduplicated candidate coordinates number more than one.

**10.2 — bundle sizes (§2.3).** Build the §2.2 structure for all 1,342 places
(joining `modern.jsonl` on `resolution.modern_basis_id` for the modern name and
`precision.meters`), serialise with `json.dumps(separators=(',',':'))`, and
compare `len(gzip.compress(b, 9))` across the three variants.

**10.3 — the empty `votes.sources` finding (§3.4).** Iterate every
identification in `ancient.jsonl`; count those with a `votes` object (2,842 of
3,259) and those whose `votes.sources` is non-empty (0).

**10.4 — base artwork sizes (§4.2).** For each Natural Earth GeoJSON: flatten
every geometry to coordinate runs, drop coordinates outside the extent (with a
2° margin), apply the Lambert Conformal Conic forward transform (standard
parallels 27°/40°, central meridian 35°E), run Douglas-Peucker at the stated ε,
emit `M x,y x,y …` path strings at 2 decimal places, concatenate into
`<path d="…"/>` elements, and gzip at level 9.

**10.5 — extent coverage (§4.3).** Collect all 4,806 `lonlat` values and count
how many fall inside each candidate bounding box.

**10.6 — the historical-basemaps finding (§6.1).** For `world_bc1000` and
`world_bc700`, select features with any coordinate inside lon 31–40 / lat 28–37,
list their `NAME` values, and compare `json.dumps(feature['geometry'])` between
the two files for `Kingdom of David and Solomon`, `Hittites` and `Egypt`. Also
tally `BORDERPRECISION` across `world_bc1000` (163 features, all `1`).

Verified independently: `public/bible/bsb.json.gz` is 1,273,758 bytes on disk;
`https://www.openbible.info/geo/ancient/a15257a/jerusalem` and
`.../a7e13e1/ai-1` both return HTTP 200.

---

## 11. Suggested backlog entry

**This brief does not modify `docs/BACKLOG.md`.** The text below is written to
be pasted there by a human, unchanged.

```markdown
### Interactive Bible map — v1 (place layer)

Signature free-core feature. Tap a place in the chapter you're reading and see
where it is; trace journeys; feel real distances. Spec:
`docs/proposals/bible-map-v1.md` (2026-08-30).

Build-time ETL over OpenBible Bible-Geocoding-Data (CC BY 4.0) → a
~110 KB-gzipped `public/map/places.json.gz` holding 1,342 places, 4,806
candidate locations, confidence scores, and chapter + verse indexes. Rendered
as hand-authored SVG over ~60 KB of Natural Earth (public domain) coastline,
lake and river paths, pre-projected at build time (Lambert Conformal Conic,
27°/40°). Pan/zoom is one SVG viewBox — no map library, no new npm dependency,
fully offline. Bundle loader copies the gzip-sniffing pattern already in
`src/bible/self-hosted.ts`.

Confidence is a REQUIRED part of v1, not polish: 58% of biblical places have
more than one proposed modern location and 35% have no confident identification
at all, so the map must show confidence per point, reveal alternatives for
contested places, mark the 7 genuinely unlocated places as unknown, and surface
the scholarly vote tally with a deep link to the OpenBible place page. Rendering
every place as one confident dot would be false.

Riskiest part is cartographic, not technical: making generated Natural Earth
paths look hand-drawn rather than like a GIS export. De-risk first with one
static styled SVG of the region before building any interaction.

NOT in v1: timeline slider, historical boundaries, terrain rasters, OpenBible's
ODbL geometry polygons, location photographs, place-name search. The later
Protomaps `.pmtiles` + MapLibre approach is triggered only by evidence users
need on-the-ground detail the vector artwork can't resolve — not by ambition.

BLOCKED (do not build): the timeline slider. No openly-licensed, historically
correct era boundary data exists for the biblical periods.
`aourednik/historical-basemaps` is GPL-3.0 (incompatible with this MIT repo) and
its 700 BC file is byte-identical to its 1000 BC file over the Levant, still
labelled "Kingdom of David and Solomon" and "Hittites" — 230 years after the
kingdom divided and ~500 after the Hittites fell. AWMC is CC BY-NC; Pleiades is
a gazetteer, not boundaries. Unblocking means licensing or commissioning real
scholarly boundary data, not finding a better download. See
`docs/proposals/bible-map-v1.md` §6.
```
