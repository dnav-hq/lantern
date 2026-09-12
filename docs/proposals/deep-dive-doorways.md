# The deep dive as one system — doorways, a glance, and one way deeper

Status: **mockup + note, not yet spec'd.** Written 2026-09-12. Mockup:
`design/deep-dive-doorways.html` — phone width, both themes, every number read out of the
shipped bundles. Companion to `deep-dive-study.md`, `word-door-guardrails.md` and
`bible-map-v1.md`.

**Why now.** The word door shipped and Dennis tried it on his phone: the entrance reads
as tacked on and the door hands over everything at once. A concordance, a connections
feature and a map built that way are three tools bolted to a reader.

## The rule

1. **One entrance**, under a verse the reader deliberately chose.
2. **Two to four doorways**, each an invitation in the reader's own words, only the doors
   this verse has, each carrying the smallest fact that makes its question askable.
3. **One question per door**, and its **glance** is one phone screen that answers it.
4. **One quiet fold**, in the same words on every door, for everything else.

Point 3 is what was broken; point 4 keeps a door from growing into a database browser.

## The verse: Genesis 12:3

Chosen over Ecclesiastes 1:2 because all three doors are genuinely full, measured:

| Door | Genesis 12:3 | Ecclesiastes 1:2 |
|---|---|---|
| Word | *bāraḵ* H1288 — **3× in the verse**, 330× in the OT, 141 English forms | *hebel* H1892 — the best word door in the Bible |
| Connections | quoted by name in **Galatians 3:8** and **Acts 3:25**; repeated to Isaac and Jacob | thin — the inclusio at Eccl 12:8 |
| Map | Genesis 12 carries **8 geocoded places**, Haran to Egypt | Ecclesiastes 1 carries **one** (Jerusalem, v. 1) |

Ecclesiastes 1:2 has one and a half doors; its word door stays drawn in
`design/word-door.html`, which nothing here supersedes.

## Each choice, and why

**The row sits in the text, not in the selection bar.** The bar answers *do something to
this verse* (Note, Highlight); the row answers *go into this verse* — two registers, two
places, no third button in a bar that already carries two. It occupies the space the
shipped `WordDoor.tsx` entrance line occupies, so it is that line generalised, not new
furniture.

**A door names a fact, not an answer** — "3× here", "2 quote · 4 echo", "Haran → Egypt".
The information-gap finding in `deep-dive-study.md`'s addendum: nothing shown produces
no curiosity, the answer shown produces no tap. **The footnotes door stays out of the
row** — it owns the dotted underline inside the sentence, where a translator's
alternative belongs. One door, one costume.

**The word door opens on the word the doorway named**, not on a chooser that answers
nothing until the reader picks; the verse's other five content words wait under the
fold, in verse order.

**Four things moved to make the glance end on one screen; the arithmetic is the
argument.** The same content laid out as the shipped door measures **1,220px** at 390
wide — a screen and a half, which is the complaint. Under the fold went the rendering
chips (one sentence says the same thing), the pinned repeat of the verse (the heading is
200px above it) and the chooser; an occurrence row shows a **two-line window** of its
sentence instead of all six lines of Genesis 1:28. **807px**, nothing deleted. The
window must centre on the tapped word, with a leading ellipsis where it starts
mid-sentence: a window that hides the word is a bare reference in a sentence's clothes,
which is what R1 forbids.

**All three of the verse's own occurrences are tinted** — one Hebrew word wearing three
English coats in one sentence ("I will bless", "bless", "will be blessed"), which is the
anti-single-meaning argument made on the reader's own verse, asserting nothing. The
shipped door tints one instance; this is a change. **There is no family or root line**,
because the index has no such field: a lemma entry carries lemma, transliteration, morph
class, gloss, Greek sense, renderings and occurrences, and no relation to any other
lemma. R5 keeps etymology out anyway.

**The connections door carries the reason, and no meter.** "Quotes it", "said again, to
Jacob" is why a reader taps; a filled rail is not. Relevance is order and prominence —
full text, one line, bare reference — as `reference-deep-dive.html` validated in place
of its rejected meter.

**The map arrives already framed** on this chapter's coordinates, the places around it
faded so the world is still visible. Disagreement is drawn: Bethel and Ai come through
as disputed (3 and 5 rival candidates, best scores 716 and 522 on OpenBible's
1,000-point scale) and a hollow ring says so. **No route line** — Haran → Shechem →
Bethel → Negeb → Egypt is read out of the chapter, not the geodata, and a drawn arc
claims a path nobody recorded.

**The long tail is paged, not capped and not searchable.** 109 grouped forms is a wall,
so twenty show and the rest page — the control the occurrence list already uses, so the
door has one paging idiom, not two. A bare cap loses the fact that the tail exists, and
the tail is the evidence that the range is wide. A search box is worse: a reader who
types "vanity" into a rendering list finds the meaning they expected, which is
confirmation dressed as research.

**The gloss stays last and weightless** — R2 and R3 obeyed by placement, not a disclaimer.

## Deeper, for the other two doors (described, not drawn)

- **Connections — more of the same list, plus movement:** the remaining references,
the thematic ones (weaker, so under the fold), and the stacked follow-a-connection
behaviour `reference-deep-dive.html` proved — following never leaves the page, the
origin stays reachable, the breadcrumb reads "Genesis 12:3 *quoted in* Galatians 3:8".
The prototype *is* the deeper layer.
- **Map — the map itself:** release the frame. Free pan and zoom out to the whole Bible
world, the rival candidates for a disputed place as the small open marks `MapView.tsx`
already draws, every verse a place appears in — slices 1–3 have all of it, and the
glance is a constrained view.

## What changes in code, in order

**1. The connections door (new, first).** Verse-anchored and translation-independent —
no per-word alignment, so it works on the BSB, the KJV and the NET alike and never has
to say "the deep dive works on the BSB" — and its glance is naturally one screen, so it
is the cheapest place to prove the rule. Work: a build step for the reference data
(helloao `open-cross-ref` plus the quotation database for quote-vs-echo typing) shaped
like `scripts/build-word-index.mjs`; a `ConnectionsDoor.tsx` reusing `WordDoor.tsx`'s
sheet, fold and provenance; a loader beside `wordIndexLoader.ts`.

**2. The doorways row.** A `VerseDoorways.tsx` that asks each layer "do you have
anything for this verse?" and renders two to four invitations, rendered by
`ReadingMode.tsx` and `StudyWorkbench.tsx` in place of `WordDoorEntrance`. The §8.2
salience model is still not built; the row can ship on presence alone, ordered word →
connections → map — a stated ordering, not a fake ranking.

**3. The word door's glance/deeper split.** Mostly done (2026-09-12, "a glance first,
the rest behind one fold"). Left: open on the word the doorway named, tint every
instance of the lemma, move grammar, chips and the chooser under the fold, and window
the occurrence rows.

**4. The map door.** A chapter-framed `MapView.tsx`: derive the viewBox from the
chapter's places (`mapViewport.ts` already fits), fade everything else, name and list
them with their verses. `bible-map-v1.md` item 6, and the map's first real entry point —
`App.tsx`'s `?map` is still temporary.

## The decisions I need from Dennis

**1. Is the map door allowed to be chapter-scoped?** Genesis 12:3 names no place;
Genesis 12 names eight. Verse-scoped is the strict reading of "only the doors that verse
has" and would show no map door here — which makes the map nearly unreachable, since
most narrative verses name no place. **Recommendation: chapter-scoped, worded as the
chapter** — "Where this chapter happens", never "where this verse happens".

**2. Does a region get drawn as a dot?** Canaan, Egypt and Negeb arrive from OpenBible
as single coordinates, so Egypt is a dot in the Delta and Canaan a dot north of Shechem
— quietly asserting something false. Options: a diffuse mark; in the list but not on the
map; or a dot labelled "region". **Recommendation: a diffuse mark** — a soft halo, no
boundary, since we have none and inventing one is worse.

**3. How much grammar, and in whose words?** Artboard 5 names the parse plainly ("Verb ·
Nifal · perfect · third person common plural") and notes that the verse's other two
instances are Piel. It does **not** say what a Nifal *is* — that sentence would be ours,
not the data's, though it is method rather than meaning and the parse is unusable without
it. **Recommendation: one plain line per stem/tense a reader meets**, written once and
marked as ours — the same call as the honest-limits line.
