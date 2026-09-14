# Dive in — one planned view for unpacking a verse

*2026-09-14. Designed in session with Dennis's direction; mockup at
`design/dive-in.html`, built from real data by a small generator (the rows,
headings, coastlines, route legs and place positions are the shipped ones).*

## What Dennis said, and what it corrects

After using the connections door and the map on his own devices: the entrance
is a plainly styled button, the doors open one at a time, the relation label is
a bare "quotes it", and the map shows dots without a story. What he wants is
that entering the dive feels **planned and beautiful**: one view that shows the
key related verses, each with a small line saying how it relates and where it
sits, then the map in a simplified form right there, so it follows how a
person naturally unpacks a verse.

This note replaces the "one line under the verse, doors open separately"
shape from `deep-dive-doorways.md` (Revised) with a single composed view. The
rules it inherits are unchanged: one entrance, nothing shown for a verse with
nothing behind it, the word door stays inside the footnote popup, the setting
line never states meaning.

## The entrance

Three forms are drawn on Genesis 15:6. **B is the recommendation**: the
selected verse's tint continues downward into a soft strip carrying two lines
in the verse's own serif, *Dive in* and a plain-words summary of what is behind
it ("9 passages pick this up · the land it promises"). It reads as part of the
verse, not a control placed under it, and its second line is honest about
what the reader will get. It appears only when the verse has at least one
section to show, and leaves with the selection.

A (a hairline rule and a serif line) is quieter but reads as a caption.
The current pills are the thing being replaced.

## The view

One sheet, fixed order, no tabs:

1. **The verse, held.** Large serif, exactly as on the page.
2. **Where Scripture picks this up.** The three strongest rows in the
   cross-reference data's own order. Each row: reference, the *relation line*,
   one sentence of the passage (the first sentence, not a six-verse dump), and
   its *setting* — the BSB section heading, labelled "Under …". Tapping a row
   stacks the passage over the view, as the connections door does today.
3. **Where this happens.** An engraved parchment thumbnail already framed on
   the chapter's places (or its journey), labels only, no controls, with a
   one-line caption. Tapping opens the full map, framed the same way. When the
   chapter carries a journey, this section moves **above** the connections:
   Galatians 1:17 leads with Paul's route because that is what the verse is
   about.
4. **One fold** for the remaining connections.
5. Provenance, once.

Nothing else. The word door is reached from the translators' note only.

### Simplicity check
Genesis 15:6 answers "what else says this, and where does it happen" on one
phone screen before scrolling: verse, three rows, the thumbnail's top edge.
No icons beyond the map. Nothing needs explaining.

## The relation line

A closed vocabulary, every phrase computed from facts we hold, none stating
significance:

| Part | Values | Computed from |
| --- | --- | --- |
| Direction | *later in Scripture* · *earlier in Scripture* · *in the same letter/book* | canonical order only — never "depends on" or "fulfils" |
| Wording | *quotes it word for word* | a shared run of **4+ consecutive words** in the translation on screen |
| | *names Damascus too* (etc.) | proper nouns shared by both verses |
| | *picks up the same wording* | 3+ shared content words, no run |
| | (nothing) | otherwise — silence is allowed |
| Setting | *Under "Faith and Works"* | the BSB heading, gated to ten verses, per `setting-line.md` |

On the real rows: Genesis 15:6 → James 2:23 is *later in Scripture · quotes it
word for word*, and its run is the whole clause "and it was credited to him as
righteousness"; Galatians 1:17 → Acts 9:20–25 is *earlier in Scripture · names
Damascus too*, under "Saul Preaches at Damascus". The mockup's last section
prints every row with the line it earns.

Dropped as interpretive, deliberately: "fulfils", "the same promise,
restated", "an earlier telling of the same event", "explains".

## The map thumbnail

Parchment (treatment *a* from `bible-map-atlas.md`), drawn engraved — sea
mask, hairline coast, rivers, hachures — because the thumbnail has no relief
raster and should not: it is a simplified view that opens into the full one.
Dark mode is a night parchment (ink on dark sepia), not an inverted image.

Routes: numbered stops, arrowheads mid-leg, revisited legs as separate arcs
(the exporter already curves them), the silent years dotted, only the route's
places labelled, everything else hidden. This absorbs the journey-clarity
mockup that was queued and never delivered.

## What changes in code

- `VerseDoorways` becomes the entrance strip (form B) and opens one
  `DiveInSheet` instead of separate doors. Presence = connections door **or**
  chapter places/journey; the strip's second line is built from the same
  presence data.
- `DiveInSheet` (new) composes: held verse; the connections rows (reusing
  `ConnectionsDoor`'s row, stack and fold) with the relation line; a
  `MapThumb` (new, pure SVG from the shipped bundles, no raster) that opens
  `MapView` framed; the fold; provenance.
- `connections.ts` gains the relation-line classifier (run length, shared
  proper nouns, shared content words), unit-tested, replacing the
  quotes/echoes pair.
- `MapView` gains the parchment treatment in its own pass (queued).
- The connections door's own foot map line goes; `MapLine` stays only as the
  thumbnail's tap target.

## Decisions for Dennis

1. **The strip's second line**: a factual summary ("9 passages pick this up ·
   the land it promises") or just *Dive in*? Recommended: the summary — it is
   the honest invitation and costs nothing.
2. **Journey chapters lead with the map** (Galatians 1) while other chapters
   lead with the connections (Genesis 15)? Recommended: yes — the order should
   follow what the verse is about, and a journey is the one case we can tell.
