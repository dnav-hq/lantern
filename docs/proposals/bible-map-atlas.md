# The map as a real atlas — a visual direction

**Recommendation: treatment (c), the engraved atlas — no relief raster at the
reader, land and sea from a 1-bit mask and terrain as hachures, both derived
from the hillshade we already build, with every colour a theme token.** It is
the only one of the three that looks like the plate in the back of a study
Bible *and* costs nothing we do not already ship (21 KB per frame against
685 KB), and the only one that is correct in all 20 themes by construction
rather than by a filter chain.

Status: **mockup + measurements, nothing built.** Written 2026-09-13.
The artboards are `design/bible-map-atlas.html` (open it at 390 px); every
shape in them is real shipped geometry, exported by
`scripts/export-map-frame.mjs`, which also prints the byte table below.

## What was compared

Three treatments of the same Galatians 1 frame — Damascus, Arabia, Jerusalem,
Syria and Cilicia — at the width a phone actually gives the map, in both
themes, plus a Genesis 12 desktop artboard in the recommended treatment:

- **(a) Parchment relief.** Hypsometric colour over the shaded relief, hairline
  coast, warm parchment land. The printed-plate look.
- **(b) Quiet relief.** The hillshade we already ship, held to a whisper and
  tinted into the app's warm neutrals.
- **(c) Engraved atlas.** No raster: sea from a 1-bit mask, terrain as hachures,
  everything in theme ink.

All three carry the same furniture, and the furniture is most of the effect:
route line, numbered stops, place names in the app's serif, regions and seas in
small caps, a scale bar measured at the frame's own latitude, a north mark that
tilts with the meridian, and a legend.

## What each costs

Measured against the shipped bundles, not estimated. "Per frame" is one
chapter's view at phone size.

| | New bytes at the reader | Galatians 1 frame | Source and licence |
|---|---|---|---|
| (a) | a colour relief or elevation raster | **213 KB** | Natural Earth HYP / NE1 cross-blended hypsometric tints, public domain, not currently downloaded by the build |
| (b) | none — `terrain.png` is already built and opt-in | **685 KB** once (213 KB cropped) | Natural Earth SR_50M, public domain, shipping today |
| (c) | 3.4 KB sea mask + 20.5 KB hachures, gzipped | **24 KB** | derived at build time from the raster we already have |

Under all three: `base.json.gz` 59 KB and `places.json.gz` 142 KB, already in
the payload. This frame draws 11.8 KB of that artwork.

Two numbers behind the table. The full-colour Natural Earth relief was measured
once already, by `scripts/build-map-data.mjs`: 2,551 KB for the whole frame, 4×
the grayscale it rejected — so (a) is not a variant of what we ship, it is a
second, larger download. And the sea is a single flat value (206) in SR_50M,
which is why (c) is possible at all: the land/sea line can be recovered from
the hillshade, so a flat atlas needs no new source data.

## Why (c)

- **The atlas feeling is ink, not colour.** A hairline coast, a serif place
  name, a region in small caps and an honest scale bar do more for "this is a
  real map" at 342 px than a relief photograph does.
- **Relief at phone size is mostly noise.** 685 KB of hillshade resolves to
  about 340 px of screen. What survives the shrink is texture, and texture is
  what hachures draw for 20 KB.
- **A raster cannot be themed; ink can.** In dark mode both relief treatments
  need their whole filter chain inverted, and (a)'s ramp comes back cool and
  lunar — a colour no printed atlas has. (c) takes `currentColor`.
- **It keeps the map inside the app's rules.** No new dependency, no new
  licence, no new fetch, and the opt-in relief toggle can retire.

## What changes in code

Nothing in this proposal touches the reader's data model or `BereanApi`.

1. `scripts/build-map-data.mjs` gains two derived outputs beside the bundles it
   already writes: a 1-bit **sea mask** (flood-filled inward from the frame
   edge, so flat land at the sea's value is not swallowed) and **hachures**
   (short contour-following strokes wherever the hillshade has relief, skipping
   anything within two pixels of water — the shoreline is the steepest gradient
   in the raster and would otherwise ring every coast and leave the mountains
   bare). Both live in `base.json.gz`; `terrain.png` becomes a build input.
   The derivation is already written and tested by eye in
   `scripts/export-map-frame.mjs` and would move across largely as-is.
2. `src/assets/main.css` gains the `--atlas-*` palette per theme, replacing the
   four `--map-*` values `.map-view` sets today.
3. `src/components/MapView.tsx` draws, in order: land, hachures, sea through the
   mask, lakes, rivers, coast, route, markers, labels, furniture. The scale bar
   and north mark are computed from the frame (both derivations are in the
   exporter); label classes and the confidence geometry are unchanged.
4. Region labels need an editorial offset table. OpenBible ships one point per
   region — `Syria 2` sits exactly on Damascus — and the polygons that would
   give a region its true extent are ODbL and deliberately excluded
   (`bible-map-v1` §1.1), so region placement is hand-authored, like the
   journeys table.

Not in scope here: the journey line's own data (`scripts/data/journeys.yml`
already holds twelve journeys; Galatians 1 is not one of them and would be
added), and marker clustering.

## Two decisions

**1 · Does the map paint its own palette, or the app's?** (a) and (c) give it a
parchment-and-sea palette: it looks like a map wherever it appears, and slightly
like a guest in Lantern. (b) keeps the app's neutrals — calmer, more of a piece,
less map-like. *Recommended:* (c)'s palette, derived from theme tokens rather
than fixed, so a parchment map in the light theme becomes an ink map in the dark
one.

**2 · Does the 685 KB relief raster keep shipping?** If (c) is the direction,
hachures replace relief for every reader and `terrain.png` becomes a build-time
input — the opt-in toggle and its download leave the product. The alternative is
to keep it as a "relief" switch for the reader who wants the photograph, at the
cost of a toggle, a second visual language and the bytes. *Recommended:* retire
it; one map, drawn one way.
