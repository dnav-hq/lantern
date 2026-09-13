# Word-level highlights that survive a translation switch

Status: **proposal, not started.** Written 2026-09-12. Dennis wants to mark
specific words, not only whole verses, because that is how he actually reads.
`note-object.md` §2 already declined sub-verse highlighting once, on the
grounds that word offsets differ between translations and verse anchoring is
the property Lantern wins on. This brief takes that objection seriously,
proposes a design that does not reopen it, and measures — rather than guesses
— how often the design actually works.

## tl;dr

- **The offset objection is about *position*, not *text*.** Storing a word
  *offset* (character N to character M) breaks the moment the translation
  changes length. Storing the exact *quoted text* and looking it up at render
  time does not have that failure mode: it either finds the quote verbatim in
  the verse being displayed, or it doesn't, and either way the verse anchor —
  the thing translation-independence actually rests on — is untouched.
- **Measured, not assumed: a BSB word-span survives verbatim into KJV 34.0%
  of the time and into NET 47.0% of the time** (seeded sample of 200 verses,
  seed 42; see §3). That is the real number this brief was commissioned to
  produce.
- **This is not a reason to decline the feature.** The design's fallback is
  the whole-verse tint Lantern already renders for every highlight today, so
  a miss never produces a broken or misleading display — it produces exactly
  today's behaviour. The feature can only ever do as well as today or better,
  never worse, which is the property that makes a ~34–47% cross-translation
  hit rate an acceptable place to start rather than a blocker.
- **Recommendation: build it**, sized to a first slice that stores one
  verbatim quote per highlight, renders it inline where it matches and falls
  back where it doesn't, and leaves editing, multi-verse spans, and the
  desktop selection gesture for later.

## 1. Why verse-level today, restated

From `src/utils/noteKind.ts` and `note-object.md` §2: a highlight is a note
with no body, anchored at verse granularity, for one load-bearing reason —
**word offsets differ between translations**, so a sub-verse highlight
anchored by position (character range, word index) in one translation lands
on the wrong words, or no words, when the reader switches translations.
Verse anchoring survives a translation switch by construction, because verse
numbers are the one thing `bible.helloao.org` guarantees is stable across
every edition it serves (`src/bible/helloao.ts`'s book-code table was
verified against a language switch, not just a translation switch, for
exactly this reason).

That reasoning is correct and this brief does not challenge it. What it
challenges is the assumption that *any* sub-verse representation inherits the
same failure mode. It doesn't, if the representation is text instead of a
position.

## 2. The design under test: verse anchor + quoted text

Store the highlighted words as an **exact text quote**, alongside the
existing verse anchor — not as an offset, not as a word index. At render
time, for whatever translation is currently on screen:

- If the quote appears **verbatim** as a substring of that translation's text
  for the anchored verse, render the word span (wrap just that substring in
  the highlight colour) inside the verse.
- If it does not, render the **whole-verse tint** — today's existing
  behaviour, unchanged.

This never fails silently and never mis-highlights: a miss degrades exactly
to what the app already does for every highlight today. The anchor
(`anchor_start_verse`/`anchor_end_verse`) stays the single source of truth for
*where* the note is; the quote is purely a rendering hint layered on top of
it. Translation-independence is not forfeited — it is what makes the fallback
safe.

The open question this brief exists to answer is not "can this work
correctly" (it can, by construction) but "**is it worth building**", which
depends on how often the verbatim match actually fires. That's §3.

## 3. Measuring survival

### Method

`scripts/measure-word-span-survival.mjs` reads the same self-hosted bundles
the app already ships for its offline fallback path —
`public/bible/{bsb,kjv,net}.json.gz` (`src/bible/self-hosted.ts`,
`kjv-self-hosted.ts`, `net-self-hosted.ts`) — decompresses them with Node's
built-in `zlib`, and needs no network access and no new dependency.

1. Build the full, order-stable list of BSB verses (book ascending, chapter
   ascending, verse ascending; 66 books, ~31,000 verses).
2. Seed a `mulberry32` PRNG with **SEED = 42** and Fisher–Yates-shuffle the
   verse list, taking the first **200** as the sample.
3. For each sampled verse, draw a **1–3 word phrase** from the BSB text at a
   random offset, using the *same* seeded RNG stream (so the whole run is a
   pure function of the seed). The phrase is taken verbatim — whatever
   punctuation is attached to its boundary words stays attached, because
   that's what a reader's selection would actually capture, not a
   punctuation-stripped token. This is a conservative choice: stripping
   boundary punctuation would inflate the measured survival rate relative to
   what an exact-substring lookup will actually find at render time.
4. Look up the same verse (same book/chapter/verse number) in the KJV and NET
   bundles and test whether the phrase is a **case-sensitive exact substring**
   of that translation's verse text.
5. Report hits / sample size per translation.

Matching is case-sensitive and whitespace-literal on purpose: it measures
exactly the lookup the render path in §2 would perform, not an idealized
approximation of it.

### Result

| Translation | Sample size | Seed | Max phrase length | Exact-match survival |
|---|---|---|---|---|
| KJV | 200 | 42 | 3 words | **34.0%** (68/200) |
| NET | 200 | 42 | 3 words | **47.0%** (94/200) |

Reproduce with:

```
node scripts/measure-word-span-survival.mjs
```

The script also prints the first few misses per translation for spot-checking.
Two representative ones, checked by hand against the bundles:

- Isaiah 28:28 — BSB: "…the horses **do not** crush it." KJV: "…nor bruise it
  with his horsemen." NET: "…but his horses **do not** crush it." (the NET
  translator chose closer wording than KJV here — this is genuine translation
  variance, not a bug in the measurement.)
- Leviticus 13:1 — BSB: "Then the LORD **said to** Moses and Aaron," KJV:
  "And the LORD spake unto Moses and Aaron, saying," — "said to" simply isn't
  KJV's phrasing.

### What this means

The survival rate only matters when a reader views the highlighted verse in a
**different** translation than the one they highlighted it in — read back in
the same translation, the quote is always found (it's the same text), so this
feature's cross-translation cost is bounded exactly to the migration path this
brief's title names. A third-to-a-half hit rate on a translation switch,
degrading to the current whole-verse tint on a miss, reads as "the word
emphasis sometimes doesn't follow you across translations," which is an honest
description of language, not a bug reports will pile up on — it's weaker,
not broken.

One measurement gap, stated honestly: this only covers KJV and NET, the two
translations bundled self-hosted alongside BSB. ESV and NIV are gated by
licence (`translations-path-to-esv-niv.md`) and not measured here — if either
ships, re-run survival against it before assuming this design still holds;
a paraphrase-style translation could plausibly score lower than NET's 47%.

## 4. Data shape: a new nullable column, not a content encoding

**Decision: add `highlighted_text text` (nullable) to `public.notes`.**
Not an encoding inside `content`.

Reasoning: `content` already has a well-defined grammar — a leading verse
anchor, `@category` tags, and prose — parsed by `parseNoteLine` and read back
by `noteProse`/`isHighlight` (`src/utils/noteKind.ts`). A highlight is
*defined* as a note whose content, once anchor and tags are stripped, is
empty. If the quoted phrase were smuggled into `content` as a new
mini-syntax, two things break: (a) `isHighlight` would need special-casing to
avoid treating the quote as prose and reclassifying every word-level mark as
an ordinary note, and (b) the syntax would need its own escaping the moment a
reader's *actual* written note happens to contain a quotation mark, which
happens constantly in Bible study. A column sidesteps both — it's orthogonal
to `content` the same way `anchor_start_verse`/`anchor_end_verse`/`category`
already are, `isHighlight` needs zero changes, and existing notes are
untouched (`NULL` = "no word span," which is precisely every note written
before this ships).

Migration (additive, no backfill):

```sql
-- supabase/migrations/00xx_word_level_highlights.sql
alter table public.notes add column highlighted_text text;
```

Client-side: `Note` (`src/types`) gains `highlighted_text: string | null`;
`BereanApi.createNote`/`updateNote` accept it as an optional field, and the
memory stub (`src/api/memory.ts`) carries it the same way every other
optional note field is carried, for pure-UI dev with no backend.

## 5. Selection gesture on mobile

The conflict named in the brief is real: a single tap on a verse already
means "select this verse" (`handleVerseClick` in `ReadingMode.tsx`), and nothing
in the current mobile reading page listens for a text selection at all
(`window.getSelection()` is only used inside `NoteEditor.tsx`'s own textarea
today — the reading column has no selection handling to build on).

**Proposal: the native browser text-selection gesture (long-press, drag the
selection handles), scoped to the tapped verse's own text node.** This is
deliberately not a new gesture — every mobile browser already teaches this
exact interaction for selecting words, so there is nothing to learn. It is
distinguishable from the existing tap-to-select-verse gesture because it's a
long-press-and-drag, not a tap, and — checked directly in `ReadingMode.tsx`
— it does not collide with the existing verse-range marquee, because that
marquee is explicitly **desktop-only** (`useVerseMarquee`'s box-drag
selection; mobile verse selection is per-tap via `onClick`, with no drag
gesture at all today).

Flow:

1. Reader taps a verse as today — selects it, opens the existing
   selection-bar (Quick note / Highlight / Continue study).
2. Reader long-presses and drags inside that verse's rendered text. The
   browser shows its native selection handles. This is new event wiring
   (`selectionchange` scoped to the verse's DOM node) — nothing today reads a
   selection on the reading page, so this is real first-slice work, not a
   reuse of something that already exists.
3. On a non-empty selection that resolves entirely inside one verse's text
   node, the selection-bar gains a fourth action: **"Highlight these
   words."** Tapping it reads `window.getSelection().toString()`, trims it,
   and saves a highlight (as today: verse anchor + category colour) with
   `highlighted_text` set to the captured string.
4. A selection that spans more than one verse, or resolves to zero length on
   release, is discarded — it falls back to the plain whole-verse "Highlight"
   action already on the bar. A quoted span never crosses a verse boundary;
   the anchor stays single-verse-or-range exactly as it is today.

**Rejected alternative: tap-per-word chips.** Tokenizing the verse into
tappable word buttons was considered and rejected for a first slice — it
needs a new touch target per word, a new selection-extend gesture (tap first
word, tap last word, or drag across chips), and reinvents, worse, the exact
interaction (select a run of words by touch) the OS already gives every text
node for free.

Desktop is explicitly **not** solved by this design — see §6.

## 6. Rendering: reading page, Journal, export

**Reading page.** When `highlighted_text` is set and it is found verbatim in
the currently-displayed translation's verse text, wrap that substring in a
`<mark>` (or equivalent) using the note's existing category colour — the same
colour source the whole-verse tint already uses, so no new palette is
introduced. Everything about today's row-level `.highlighted` class and
selection-bar interaction is unchanged; the inline mark is additive. When the
quote is not found (including the translation-switch case measured in §3),
render nothing beyond today's whole-verse tint — the reader sees exactly what
they'd see today, with no error, warning, or visibly "broken" state.

**Journal.** Today a highlight entry (`JournalPage.tsx`) shows a coloured
verse-reference row with no text, because `isHighlight` notes carry no prose.
When `highlighted_text` is present, show the quoted phrase in place of the
blank body — e.g. italic, quoted: *"the light of the world"* — using the same
`highlight`-styled row it uses today. `isHighlight`/`noteKindOf` are
untouched by this (they key on `content`, not on `highlighted_text`), so a
word-level mark is still, correctly, a highlight — just one that now shows
which words it was about.

**Export.** `src/platform/export.ts` currently writes a highlight as
`- **meta** — *(marked)*`. Extend it to `- **meta** — *(marked: "quoted
phrase")*` when `highlighted_text` is set, and leave the existing `*(marked)*`
line byte-for-byte unchanged when it isn't — every export of every highlight
written before this ships stays identical.

## 7. Out of scope for a first slice

- **Desktop selection gesture.** No selection-driven UI exists on the desktop
  `StudyWorkbench` reading column today; wiring one is a companion piece, not
  a blocker — a word span created on mobile still displays correctly on
  desktop, since it's just data (§6's rendering rule is platform-agnostic).
  Desktop-authored word spans wait for that companion piece.
- **Editing a saved word span.** First slice is create-time only; changing
  the quoted words after saving means delete-and-recreate, same as today's
  highlight-to-note promotion path.
- **Multi-verse quoted spans.** A quote is scoped to a single verse's text,
  matching the existing single-verse-or-range anchor model; it does not
  stitch text across a verse boundary.
- **ESV/NIV.** Ungated by this brief (see §3's measurement gap) and by
  `translations-path-to-esv-niv.md`'s licence status generally.
- **Word spans as a Journal search/filter key.** `journal-retrieval.md`'s
  filtering stays scoped to prose and category; extending it to quoted
  phrases is a retrieval-surface question for that arc, not this one.
- **Any new colour or visual treatment for the inline mark** beyond reusing
  the highlight's existing category colour.

## 8. Suggested backlog entry

> **Word-level highlights — measured, not yet built (2026-09-12).**
> `docs/proposals/word-level-highlights.md`. Verse anchor + exact quoted text,
> not a word offset — a translation-switch miss falls back to today's
> whole-verse tint, so translation independence is not at risk. Measured
> against the self-hosted BSB/KJV/NET bundles (seed 42, n=200): a BSB
> word-span survives verbatim into KJV 34.0% of the time, into NET 47.0%.
> `highlighted_text` as a new nullable column on `notes`, not a `content`
> encoding — keeps `isHighlight`/`noteProse` untouched. Selection gesture
> proposed for mobile only (native long-press text selection scoped to a
> verse); desktop, editing, and multi-verse spans are explicitly out of
> scope for a first slice.
