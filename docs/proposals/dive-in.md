# Dive in — the verse has depth

*2026-09-14, designed in session with Dennis; second pass after his review.
Mockup at `design/dive-in.html`, generated from real data (the rows,
headings, place positions, coastlines and route legs are the shipped ones).
The page is interactive: tap the glimpse under Genesis 15:6.*

## The idea in one line

A verse that has something behind it shows a glimpse of it. Touch the glimpse
and the verse opens: it stays exactly where it is while the page gives way and
the depth rises under it. You never leave the verse; the verse opens.

## What Dennis corrected, and why this shape

- Labels do not pull. Both entrance forms in the first pass were labels
  ("Dive in") and neither felt like an invitation. A *glimpse* does: ghosted
  fragments of what is beneath, fading to the right, and a small handle.
- Separate doors that open one at a time are not a dive. One composed view,
  in the order a person unpacks a verse, is.
- "Quotes it" is too bare and "fulfils" is too much. The line has to say what
  a friend would say: who is speaking, on what, and how it relates, with every
  word a fact.
- The map has to be clear about what it shows, keep a bearing, and make a
  journey followable. Numbers alone do not survive a route that doubles back.

## The entrance: the glimpse

Under a chosen verse with depth: one strip, no border, no word for it. Ghosted
serif fragments of what is beneath — the first references, who wrote them, a
place — fading out to the right, and a short accent handle. Touching it, or
pulling the verse down, opens the depth. A verse with nothing behind it shows
nothing at all. The strip's content is built from the same presence data that
decides whether the depth exists, so it never promises what it cannot show.

## The transition: the verse opens

The selected verse keeps its place. The verses above and below give way (they
collapse and fade, ~320 ms on the app's calm easing), the selection bar leaves,
and the depth rises into the space beneath the verse with a short delay so the
page has moved before the new content arrives. "Back to the page" reverses it.
Reduced motion: instant. The mockup runs this transition for real.

On desktop the depth is a side panel beside the text; the glimpse is the same.

## The view, in order

1. **The verse, held.**
2. **Where Scripture picks this up.** The three strongest passages in the
   cross-reference data's own order. Each row: the reference, then one italic
   *context line*. The first row also shows the passage's first sentence; the
   others do not, so the block stays short.
3. **Where this happens.** An engraved parchment thumbnail already framed on
   the chapter's places, labels only, no controls, with a caption in plain
   words and no dashes. Fixed bearings stay faintly present (Jerusalem, the
   Great Sea, Egypt, the Jordan) even when the chapter never names them, so the
   reader is never lost. When the chapter carries a journey this section moves
   **above** the connections, because that is what the verse is about.
4. **One fold** for the remaining connections.
5. Provenance, once.

The word door stays inside the translators' note only.

## The context line

Three facts joined into one sentence; none of them a claim about meaning.

| Part | Example | Source |
| --- | --- | --- |
| Who | *James* · *Paul, writing to the Galatians* · *the psalmist* · *the writer of Hebrews* · *Luke* | the book's traditional author and addressee, stated as attribution |
| On | *on "Faith and Works"* | the BSB section heading, quoted, gated to ten verses per `setting-line.md` |
| Relation | *quoting this word for word* (a shared run of 4+ words) · *naming Damascus too* (shared proper nouns) · *picking up the same wording* (3+ shared content words) · nothing | measured on the text on screen |

So Genesis 15:6 → James 2:23 reads *James, on "Faith and Works", quoting this
word for word*, and Galatians 1:17 → Acts 9:20 reads *Luke, on "Saul Preaches
at Damascus", naming Jerusalem and Damascus too*. The mockup's last section
prints every real row with its line and the measurement behind it. Dropped as
interpretive: "fulfils", "the same promise, restated", "an earlier telling of
the same event", "explains".

## The journey

Numbering alone fails on a route that doubles back. Four things together:

- Revisited legs are separate arcs, never stacked; a repeated stop shows its
  visits ("1·3").
- The legs run from indigo to warm ink, first to last, so direction reads
  without looking for the arrowheads; the arrowheads are there too.
- Silent stretches are dotted.
- The route **draws itself in**, leg by leg in reading order, when the card
  scrolls into view (about a second; instant under reduced motion).

Under the map, the journey in words with the same numbers as the stops and the
verse for each leg, so a reader who cannot follow the line follows the list.
In the full map that list becomes a step-through: next advances one leg,
lights the stop, shows the verse. The full map keeps every place faintly for
context and gives weight only to the chapter's places and the route.

## What changes in code

- `VerseDoorways` becomes the glimpse strip; presence = connections door or
  chapter places or journey, and the fragments are built from that data.
- The verse-opens transition lives in the reading surface: the selected verse
  row is pinned, sibling rows collapse, and a `DiveIn` panel mounts beneath it
  (chapter surface and saved-passage surface; desktop renders it as a panel).
- `DiveIn` composes the held verse, the connection rows with the context line
  (reusing the connections door's stack and fold), a pure-SVG `MapThumb` from
  the shipped bundles with the gradient route and draw-in, the fold, and the
  provenance. Its map card opens `MapView` framed the same way.
- `connections.ts` gains the context-line builder (who table, heading, run
  length, shared proper nouns, shared content words), unit-tested, replacing
  quotes/echoes.
- The connections door's foot map line goes; `MapLine` stays as the card's
  tap target. The parchment pass on the full map is queued separately.

## Open

The "who" table needs completing for all 66 books (the mockup covers the
books its rows touch) and a decision on Old Testament narrative books: the
book's name ("Genesis, on …") is the honest default.
