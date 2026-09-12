# The map as part of the story — how geography follows the reader

Slice 3 made the map move. It is genuinely cool and Dennis has said so — and
also that it's crowded, because it currently answers a question nobody asked
yet: "show me everywhere." What he actually wants is smaller and more useful:
while he's reading a chapter, let the map help him understand *this* passage —
the places named here, the journey it describes, the distances that make the
narrative make sense. This brief works out how, before any more map code is
written. It assumes `docs/proposals/bible-map-v1.md` throughout and doesn't
re-derive what that brief already settled.

## 1. How people actually use a study-Bible map

A study Bible's map pages are never opened at random. They're opened *from* a
passage, at a specific moment, to answer a specific question — and the
question is different every time:

- **"Abram leaves Ur" (Genesis 11:31–12:5).** The reader wants to see the
  *shape* of the move: Ur, up to Haran, down through Canaan to Shechem. The
  question is "how far, and which direction, and does this route make sense
  geographically" — not "where is every place in Genesis."
- **"Paul's second missionary journey" (Acts 15:36–18:22).** The question is
  "what's the order of the stops, and how do they relate to each other" — a
  route with a sequence, spanning three landmasses, where the *shape* of the
  journey (why sail here, why walk there) is the entire point of looking.
- **"Jesus goes up to Jerusalem" (e.g. Luke 9:51 onward).** The reader knows
  Jerusalem is a hill city and "going up" isn't a metaphor — the question is
  "what does the terrain actually do here, and where is Galilee relative to
  Jerusalem, and why does that trip take that long."
- **The wilderness itinerary (Numbers 33).** Fifty-seven campsites in one
  chapter. Nobody wants fifty-seven pins; they want "we were wandering, and
  here's the shape of the wandering" — the *scale* of forty years compressed
  into one glance.
- **The divided kingdom's wars (e.g. 2 Kings 15–17).** The question is
  relational: where is Samaria relative to Assyria, and Judah relative to
  both, so a reader can feel why a small kingdom between two empires keeps
  losing.

**What a generic all-places map fails to answer in every one of these
moments:** it shows everywhere at once, so the reader has to *find* Ur, Haran
and Shechem among 1,342 other dots before the map has told them anything. A
map that shows everything is not more helpful than one that shows the right
three things — it's a harder puzzle with the same content buried in it. The
reading moment doesn't need *the atlas*; it needs *the page the atlas would
have you turn to.*

## 2. The map door: framed from the verse, not from zero

**Recommendation: when a chapter or verse names geocoded places, the door
opens the map already zoomed and centred on those places, with everything
else faded, the current chapter's places named, and a journey line drawn when
the passage is a journey.** Nothing else changes about the map underneath —
same data, same rendering, same gestures once it's open. The door is a
*framing* decision, not a new feature surface.

### 2.1 Finding a chapter's places — already free

This needs no new data and no inference. `public/map/places.json.gz` already
carries a chapter index, `ch: { "06010": [12, 88, 341] }` (`BBCCC` → place
indices) built straight from OpenBible's own verse references (bible-map-v1
§1.3, §2.2). Opening the map from Genesis 12 is `ch["01012"]` — a lookup, not
a search. The only new work is: fit the viewBox to the bounding box of those
place indices' best candidates (the same `fitViewBox` slice 3 already has,
just given a smaller extent than "the whole Bible world"), full-opacity those
markers, and drop everything else to a low-opacity backdrop so the coastline
and faded dots keep giving geographic context without competing for
attention. All of this is existing code paths fed a filtered marker list; no
new gesture logic, no new SVG path types.

**Chapter-density still needs its own answer.** Joshua 15 has 164 places in
one chapter, Numbers 33 has 57 — the door can't just "show all of this
chapter's places" undifferentiated, or it recreates the crowding problem one
level down. The honest fix carried over from bible-map-v1 §4.4: rank by
reference count / confidence and show the top N with full labels, fold the
rest into "+148 more" that the existing card/list surface can hold. This
brief doesn't solve that ranking — it flags it as slice 4's actual hard part
(§6).

### 2.2 Journeys — one is free, most are not

**A journey can be inferred, for exactly the chapters where the text itself
enumerates places in narrative order.** Numbers 33 is the case: every entry is
a `campsite`-typed place and the chapter *is* the itinerary — verse order is
route order, no interpretation required. Drawing that journey is: take the
chapter's places in `sort` (verse) order, connect them with a line. That's it.
This generalizes to any place list where the text itself is the route (a
short, checkable set — worth an explicit audit as part of slice 4, not
assumed to be large).

**Most journeys are not this cheap, and Paul's journeys are the sharp example.**
Acts narrates a journey in prose, not as an enumerated list — the places
Paul visits appear in the *right order* in the verse index (because verses are
sequential and Luke narrates in order), but nothing in the data distinguishes
"Paul journeyed to Philippi" from "Paul's letter mentions Philippi" or "a place
is merely referenced in a speech about the past." Inferring the route
correctly means either (a) hand-authoring a small table of named journeys —
journey name, ordered place list, source verse range — maintained like the
content it is, not derived, or (b) a heuristic (e.g. "places whose only
occurrence is a `travel`-flavoured verb nearby") that this brief has no
verified basis for and that bible-map-v1 §4.4 already flagged `unverified`.

**Recommendation: hand-author journeys, starting from a short list (Abram's
move, the Exodus route Numbers 33 partly covers, Paul's three journeys, the
Gospels' Galilee↔Jerusalem trips), rather than build an inference engine for a
problem the data doesn't cleanly solve.** This is editorial work with a real
but boundable cost — maybe a dozen journeys cover the passages people
actually read this way — and it keeps the map's evidentiary honesty: a drawn
line is either "the text lists these in order" (free, verifiable) or "an
editor decided this is the route" (labelled as such), never a silent guess
connecting nearby dots.

## 3. Confidence, reframed for three places instead of a thousand

Bible-map-v1 §3 already decided *that* confidence must be visible and *how*
it's encoded (solid disc → hollow ring → dashed ring by score band, rival
candidates shown, the 7 unlocatable places listed as unknown, never dropped).
None of that changes. What changes is what it *means* to see it.

At the whole-Bible zoom, a dashed ring is one faint outlier among 1,335 marks
— it reads as "this dataset has texture," true but low-stakes, easy to
skim past. **Framed on three or four places for one passage, the same dashed
ring is a third of the picture.** If the door for "Abram leaves Ur" shows Ur,
Haran and Shechem, and Ur is the disputed one (multiple candidate
identifications for `Ur of the Chaldees` is a live scholarly question — modern
Tell el-Muqayyar is the traditional identification but not undisputed), that
uncertainty is no longer decoration. It's the difference between "Abram
started *here*" and "Abram started in roughly this region, and reasonable
people place it two different ways." A reader who has just been told a single
confident story by a page of narrative text needs the map to be honest at
exactly the moment it's carrying the most weight per pixel.

**What the frame changes concretely:**

- **The alternatives can't stay a tap away.** At 1,335 markers, hiding rival
  candidates behind a tap is the right density trade. At 3–5 markers, there's
  room to show a contested place's rival candidates directly in the frame
  (the hairline-to-rival treatment slice 2 already draws), because there's no
  competing visual noise to hide them from.
- **The card copy should say why, not just how much.** "Ur — disputed,
  score 420 of 1000" is honest but sterile at any zoom. Framed on one journey,
  there's room for a phrase like "scholars place this two ways" pulled from
  the vote tally's shape (a near-even split between the top two candidates
  reads differently from one dominant candidate with a token dissent) —
  copywriting to design later, not a data change.
- **Unlocated places in-frame need to be named, not omitted.** If a
  hand-authored journey passes through one of the 7 unlocatable places, it
  must appear in the frame's place list as "location unknown" exactly as
  bible-map-v1 §3.3 rule 3 requires — the stakes of quietly dropping it are
  higher here (one of four things missing) than at whole-Bible scale (one of
  1,335).

No new confidence data or encoding is needed. This section is a design
instruction for the door, not a change to §3's data contract.

## 4. Design direction: a dynamic study-Bible atlas

Dennis's reference point is the printed atlas in the back of a study Bible —
not a web map, not a GIS export. Two concrete touchstones (described from
general familiarity with the genre, not copied from any single page — no
image is referenced or reproduced):

1. **A classic study-Bible "journeys of Paul" spread** (the kind found at the
   back of an ESV or NIV study Bible): sepia-toned land, a soft green-brown
   relief wash rather than flat fill, place names in a small serif capitals
   set slightly above their dot, sea lanes drawn as dashed or dotted curves
   (visually distinct from land travel, drawn straight rather than
   coast-hugging), and a restrained palette — three or four ink colours
   total, land/sea/route/label, nothing saturated.
2. **A scholarly atlas plate in the Aharoni & Rainey *Carta Bible Atlas*
   tradition** (cited directly in bible-map-v1 §6.2 and §7 as the print
   cartography this app is explicitly not permitted to trace): finer
   contour-line relief rather than a flat hillshade, elevation conveyed by
   layered earth-tone bands, city dots sized and weighted by significance
   (Jerusalem heavier than a campsite), and typography that treats ancient
   and modern names as visually distinct registers (often italic for one).

**What "dynamic version of the map in the back of a study Bible" means in our
tokens.** The map already inherits the app's theme system through CSS custom
properties (`--map-canvas`, `--map-coast`, `--map-water`, `--map-ink`,
`--map-mark` — `src/assets/main.css`, the block above `.map-view`), which is
what makes this achievable without a redesign of the interaction:

- **Canvas and relief** — the light theme's `--bg` (`#f4f0e8`, warm cream) is
  already the sepia-parchment tone atlases use for land; the terrain layer
  (below) should sit *under* the coastline as a muted wash in that same warm
  family, not neutral grey — the shipped grayscale raster (`terrain.png`)
  needs a CSS `mix-blend-mode` or tint filter to read as "old paper relief"
  rather than "satellite hillshade." A rendering change, not a new data source.
- **Water** — `--map-water-fill: rgba(63, 123, 160, 0.14)` is already closer
  to a wash than a fill, which is the right instinct; the atlas reference
  suggests pushing it further — lower opacity still, letting the coastline
  stroke (not the fill) carry most of the read, the way engraved atlases use
  line density rather than solid colour for water.
- **Typography** — the app already ships `Source Serif 4` for scripture
  (`--scripture-font`, `src/assets/tokens.css`) alongside a sans UI font.
  Place labels should use the serif, not the UI sans — it's the one
  typographic move that most says "atlas" rather than "app chrome," and it
  costs nothing new to load since the font is already in the bundle for
  reading text.
- **Route and marker colour** — `--map-mark: var(--accent-ink)` (purple)
  works as an interactive-affordance colour but reads as "app," not "atlas,"
  where routes are traditionally warm (ochre, burnt sienna) against cool
  land. Worth a design pass: give journeys their own token, or keep purple as
  the one place the map admits it's a living app feature, not a facsimile.
- **Confidence encoding stays geometric** (solid/hollow/dashed, per
  bible-map-v1 §3.3 rule 1) rather than becoming another colour, which both
  keeps the colour palette restrained in the atlas style and avoids relying on
  colour alone for an accessibility-load-bearing signal.

**Honest note on the relief raster.** The shipped `public/map/terrain.png` is
`SR_50M`, Natural Earth's 50 m-per-pixel grayscale shaded relief, encoded at
1600×916 and measuring 701,424 bytes (685 KB) on disk in this checkout —
matching bible-map-v1 §4.2's build exactly. At the "Bible world" extent
(10→60°E, 20→45°N) that's roughly 30 pixels per degree, coarse enough that at
typical phone zoom over, say, the Judean hill country, the relief will look
soft and sampled rather than the crisp, engraved hachures a print atlas
achieves by hand-drawing contours. bible-map-v1 §4.2 measured but did not
build the 10 m series (`NE1_HR_LC_SR_W`, a 323 MB *source* download, not an
output size) because the 50 m series already exceeds the vector artwork's
display density — a sharper *raster* wouldn't fix "looks sampled, not drawn"
by itself, and would cost real bytes (roughly a 5x pixel-density step at this
extent, so plausibly 2–4x today's 685 KB even after re-compression;
`unverified`, no build attempted) for a texture that would still read as a
photo of terrain rather than an illustration of it. **The cheaper, probably
better fix is stylistic, not resolutional:** a tint/blend pass on the existing
raster (§4 above), or a hand-drawn hachure texture as an SVG overlay pattern
instead of a raster at all — a design decision, not a data-sourcing one, out
of scope here.

## 5. Measured: drag performance at 390px

A quick profile against the running preview (Chromium, 390×844 viewport, the
whole-Bible-extent map open, a synthetic ~600 ms one-finger drag covering
roughly 220×140 px) recorded frame-to-frame time via `requestAnimationFrame`
timestamps: **66 frames, average 16.67 ms, max 16.80 ms, zero frames over
33.4 ms (zero dropped frames against a 60 Hz target) in this environment.**
The interaction is smooth today at the whole-Bible extent, 1,335 markers, on
this hardware.

**Likely cause of that headroom, and the one thing to watch.** Slice 3 already
does the two things that matter most: markers live in screen space (a single
`--map-k` CSS custom property rescales the whole marker group once per frame,
so panning never touches 1,335 individual elements), and panning moves the
SVG `viewBox`, which the browser handles natively rather than through React.
But the one-finger pan and pinch handlers (`MapView.tsx`'s `onPointerMove`,
calling `applyToDom` directly around lines 264 and 269–271) write to the DOM
**once per native pointer event, not coalesced to one write per animation
frame** — unlike the button/double-tap zoom path (`animateTo`), which is
already rAF-driven. That costs nothing measurable here because this profile's
synthetic events land at roughly display-refresh rate; on a real device whose
touch digitizer samples faster than the screen repaints (increasingly common
on high-refresh-rate phones), the same code does more writes per rendered
frame than it needs to. **The fix, if this ever shows up as real jank: throttle
`onPointerMove`'s writes to one per `requestAnimationFrame`**, the same
pattern `animateTo` already uses. Not built here — today's measurement doesn't
justify it, and it's a half-day change if it ever does.

## 6. Slice plan

- **Slice 1** (done) — data + artwork, nothing renders.
- **Slice 2** (done) — the map draws: coastline, places, confidence geometry.
- **Slice 3** (done) — the map moves: pan, pinch, zoom, tap.
- **Slice 4 (this brief's proposal) — the map door, for one chapter type
  first.** Scope: pick the cheapest, highest-payoff case to prove the door
  end-to-end before generalizing —
  - a **non-journey chapter** with a small, clean place count (a handful of
    named cities, no journey line) to prove framing + fading + the confidence
    treatment at small-N (§2.1, §3), **and**
  - **Numbers 33** to prove the one journey type that needs no hand-authoring
    (§2.2), since it's free and it's the best stress-test of "a lot of
    places, drawn as a route, not a crowd."

  Deliberately NOT in slice 4: hand-authored journeys beyond Numbers 33 (§2.2
  — real editorial work, sequenced after the mechanism is proven), the
  Joshua-15-style dense-chapter list treatment (§2.1 — flagged, not solved,
  needs a design pass on ranking + "+N more"), the atlas-style visual pass
  (§4 — a design task that can land independently of the door mechanism), and
  any pointermove throttling (§5 — no evidence it's needed yet).

**Decisions Dennis needs to make before slice 4 starts:**

1. **Which non-journey chapter is the first proof case?** Needs a small,
   confident, well-known place set — a good showcase, not an edge case.
2. **Fund the journey table now, or defer past slice 4?** Numbers 33 needs
   none; anything beyond it (Paul, Abram, the Gospels) needs the
   hand-authored table in §2.2 and that's a real, ongoing content commitment,
   not a code task — worth deciding as a product commitment, not discovering
   mid-build.
3. **Ship the atlas-style visual pass (§4) alongside slice 4, or keep the
   current look and layer style later?** They're independent, but doing them
   together means the first thing anyone sees of "the map as part of the
   story" already looks like the destination rather than an interim step.
4. **How aggressively to fade the rest of the world.** Full fade (arguably too
   stark, loses "where in the world is this") vs. a soft dim that keeps
   orientation — a taste call the data doesn't settle.

`docs/BACKLOG.md` gains one line pointing here; see that file for the
placement.
