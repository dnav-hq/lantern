# The footnotes door — showing the translators' own "or…" without unsettling anyone

**Recommendation: build it, ship the alternate-rendering notes only, and make
the reader open the door.** The data is already in the response we fetch and
throw away; the work is almost entirely in deciding *which* notes and *what the
closed door looks like*. Both are decided below, and both are decided from
measurement rather than taste: 4,853 BSB footnotes were classified, and the
classifier was audited twice against hand labels on real notes.

The one-line version: *a footnote is a translator saying "I had a choice here."
That is the first honest reason a reader has to go deeper, and it is the only
thing we ship in rung one.*

Status: **design + data brief, not yet spec'd.** Written 2026-08-31. First rung
of Arc 2 in `docs/ROADMAP.md`; companion to `docs/proposals/deep-dive-study.md`
(which placed footnotes as the cheapest layer and split the layer in two) and
`docs/proposals/word-door-guardrails.md` (which counted 2,185 word-anchored
notes as the word door's salience signal — §7 confirms that number and corrects
what it means). Every figure below is measured against real data on 2026-08-31;
§11 says exactly how, so any of it can be re-run. Anything not measured is
labelled **unverified**.

---

## 1. The stance

1. **We show the translators' own note, verbatim, and add nothing to it.** No
   paraphrase, no explanation, no "this means". The BSB note is primary data in
   exactly the sense the deep dive uses the term; a sentence we write about it
   is not.
2. **Alternate-rendering notes ship. Textual-variant notes do not ship in rung
   one, and do not ship behind a mere tap in rung two.** §6 takes the position
   the deep-dive addendum asked for, and it is more conservative than "gate it
   behind a deliberate action".
3. **Nothing auto-expands, ever.** Every study method Lantern is built around
   teaches observe-before-consult. A note that opens itself has consulted for
   the reader before they have looked.
4. **The closed state must be quieter than the verse.** The failure mode is not
   a bad panel; it is a chapter that stops reading like scripture and starts
   reading like a study Bible. §5 keeps the resting affordance below the
   threshold where that happens, and §5.3 shows the density numbers that say it
   is achievable.

---

## 2. What is actually in the data

### 2.1 The shape, and what we currently discard

`GET https://bible.helloao.org/api/BSB/{USFM}/{chapter}.json` already returns,
alongside `chapter.content`:

```jsonc
"footnotes": [
  { "noteId": 1, "caller": "+",
    "text": "Literally vapor or breath; the Hebrew words translated in Ecclesiastes as forms of futile or fleeting can also be translated as vanity or meaningless.",
    "reference": { "chapter": 1, "verse": 2 } }
]
```

and the marker itself lives inline in the verse's own content array:

```jsonc
{ "type": "verse", "number": 2, "content": [
  { "text": "“Futility", "poem": 1 },
  { "noteId": 1 },
  { "text": "of futilities,”", "poem": 1 }, … ] }
```

That is Ecclesiastes 1:2, fetched live. The marker sits **between two words** —
it is anchored to "Futility", not to the verse. `src/bible/helloao.ts`'s
`flattenVerseContent` drops both: `{ noteId }` contributes no visible text and
is skipped, and the sibling `footnotes` array is never read, because
`BibleVerseLine` is `{ verse, text }` and a plain string cannot carry an anchor.

**The bytes are already paid for.** Footnotes are 612,331 of the 6,893,426
bytes of chapter content across the whole BSB — **8.9% of a payload we already
download and discard**. On the two chapters checked live: Ecclesiastes 1, 425 of
6,761 bytes (6.3%); Psalm 119, 807 of 31,218 (2.6%).

### 2.2 The corpus, counted

Measured over `GET /api/BSB/complete.json` (66 books, 1,189 chapters, 31,086
verses per the translation's own metadata):

| | |
|---|---|
| Footnotes in the BSB | **4,853** |
| Chapters with at least one | 1,091 of 1,189 (91.8%) |
| Chapters with none | 98 |
| Distinct verses carrying a marker | 4,284 (13.8% of verses) |
| Markers inside verse nodes | 4,817 |
| Markers inside a psalm superscription (`hebrew_subtitle`) | 36 |
| Mean note length | 52 characters |

For context, `word-door-guardrails.md` §8.2 reported "4,854 notes across 4,314
verses (13.9% of verses)" from the STEP tables' footnote column. The helloao API
gives 4,853 across 4,315 referenced verses. **The two independent sources agree
to within one note**, which is a useful cross-check on both.

### 2.3 The `noteId` linkage, in practice

This is the part a build plan actually depends on, so it was checked
exhaustively rather than sampled. Across all 1,189 chapters:

- **0 dangling markers.** Every `{ noteId }` in a verse resolves to an entry in
  that chapter's `footnotes` array.
- **0 orphan notes.** Every footnote has exactly one marker somewhere in the
  chapter.
- **0 reference mismatches.** For every note, `reference.verse` equals the
  number of the verse whose content holds its marker, and `reference.chapter`
  always equals the chapter. `reference` is therefore *redundant* with marker
  position for verse-anchored notes — which is good news: either can be used,
  and they cannot disagree.
- **`noteId` is chapter-scoped and zero-based**, assigned in document order. It
  is not stable across translations and must never be persisted; a note is
  addressed by (translation, book, chapter, verse, ordinal), never by `noteId`.

**The one structural exception, and it is a real one.** 36 notes have
`reference.verse === 0` and their markers live in a `hebrew_subtitle` node — the
psalm superscriptions ("Sheminith is probably a musical term", "Maskil is
probably a musical or liturgical term"). Lantern's reading surface renders
`{ verse, text }` rows and has no superscription row at all, so these 36 have
nowhere to hang. **Rule: drop `reference.verse === 0` notes in rung one.** They
are 0.7% of the corpus, all of the low-value "probably a musical term" kind, and
inventing a superscription row to hold them is a bigger change than they are
worth.

### 2.4 How many notes a reader actually meets

| Notes on one verse | Verses |
|---|---|
| 1 | 3,814 |
| 2 | 416 |
| 3 | 46 |
| 4 | 7 |
| 5 | 1 |

Per chapter, across all 1,189: mean 4.1, median 3, and the densest are
Ezekiel 40 (25 notes / 49 verses), 1 Kings 7 (24/51), 1 Chronicles 1 (22/54),
Nehemiah 7 (22/73), Ezra 2 (21/70). Those are genealogies and building
specifications — the chapters where the notes are mostly name-spelling and
measure conversions, i.e. exactly the ones §3 filters out. §5.3 gives the
density of the set we actually ship, which is much calmer.

### 2.5 Where the markers sit

Of the 4,817 verse-anchored markers: **3,492 sit mid-verse** (there is more text
after them) and **1,325 are verse-final**. A mid-verse marker is anchored to the
word or phrase immediately before it; a verse-final marker is anchored to the
verse's last phrase, which in practice is often the whole clause. Both are
usable; §7 uses the distinction to correct a claim in the roadmap.

**334 notes say "also in verse(s) …"** — one marker, one note, but the note
explicitly covers other verses too. Rung one shows such a note only on the verse
that carries its marker. Propagating a note to the verses it names would mean
parsing English verse lists out of note prose, and is not worth it; the note's
own text tells the reader.

---

## 3. Telling a rendering note from a variant note

This is the line the deep-dive addendum drew and the reason this brief exists.
It is also the only part of the work where being wrong actually hurts someone,
so it is specified as code and measured, not asserted.

### 3.1 The classes, from the data up

The 4,853 notes were read in bulk and fall into six kinds. These are not
categories invented and then imposed; they are what the leading phrases actually
are.

| Class | Count | Example |
|---|---|---|
| **rendering** | 2,099 | "Or futile" · "Literally the temple" · "Hebrew my kidneys" · "Forms of the Hebrew *chesed* are translated…" |
| **variant** | 880 | "Some manuscripts omit this question." · "Hebrew; LXX *They worship Me in vain*…" · "BYZ and TR include *and whatever is right*…" |
| **gloss** | 666 | "That is, Babylonia" · "Beersheba means *well of seven*" · "Maskil is probably a musical term" |
| **citation** | 592 | "Cited in 2 Corinthians 4:6" · "Psalms 118:26" |
| **measure** | 350 | "15 cubits is approximately 22.5 feet or 6.9 meters." |
| **supplied** | 13 | "Hebrew does not include *of Egypt*." |
| **other** | 253 | "Pinions are the outer parts of a bird's wings." |

`supplied` is a class the audit forced into existence — see §3.4. It is small,
and it is held back with the variants.

### 3.2 The classifier

Ordered tests, first match wins. The order is the safety property: every test
that can produce a **hold** runs before every test that can produce a **ship**.

```ts
const SIGLA = ['MT','LXX','DSS','SP','BYZ','TR','WH','NA','NE','SBL','ECM','GOC',
  'Syriac','Vulgate','Targum','Tischendorf','Samaritan Pentateuch','Masoretic']

// 1. HOLD — any mention of manuscripts at all.
if (/\bmanuscripts?\b/i.test(t)) return 'variant'
// 2. HOLD — "Hebrew; …", "Aramaic, …": the BSB followed the source text and
//    something else reads differently. The semicolon is the whole signal.
if (/^(Hebrew|Aramaic|Greek)[;,]/.test(t)) return 'variant'
// 3. HOLD — a siglum LEADING a clause, i.e. introducing alternative text,
//    rather than cited as support ("see also LXX").
if (VARIANT_LEAD.test(t)) return 'variant'          // (^|[;.]\s+|\)\s+)(?!see|cited|compare)(SIGLA)\b
// 4. HOLD — omission language plus a siglum anywhere.
if (/\b(does not include|do not include|does not contain|lacks?|omits?)\b/i.test(t)
    && SIG_ANY.test(t)) return 'variant'
// 5. HOLD — omission language against the source text, with no siglum.
if (/\b(Hebrew|Greek|Aramaic|Latin)\s+(does not include|lacks|does not contain)\b/i.test(t))
  return 'supplied'
// 6-9. SHIP or ignore.
if (CITATION_LEAD.test(t)) return 'citation'
if (/\bapproximately\b/.test(t)) return 'measure'
if (RENDERING_LEAD.test(t)) return 'rendering'      // Or|Literally|Hebrew |Greek |Aramaic |
                                                    // Possibly|Probably|Perhaps|Forms of the|The Hebrew…
if (GLOSS_LEAD.test(t)) return 'gloss'
return 'other'
```

Three notes on why it is shaped this way, each of which is a thing that went
wrong before it was:

- **The siglum list is explicit, not "any all-caps token".** The BSB's most
  common all-caps tokens are `LXX` (589), `TR` (237), `BYZ` (213), `MT` (124)
  — and then **`LORD` (97)**, plus `YAH` (16), `YHWH` (7), `GOD` (3). An
  all-caps heuristic would classify the divine name as a manuscript witness.
- **`Hebrew ` and `Hebrew;` mean opposite things.** "Hebrew *El-Shaddai*"
  reports the source word behind the English — a rendering note. "Hebrew; LXX
  *west, and the Jordan*" means the BSB followed the Hebrew and the Septuagint
  reads otherwise — a variant. There are 324 of the first and 84 of the second,
  and **the only discriminator is the punctuation**. Test 2 exists for exactly
  this and nothing else.
- **"see also LXX" is support, not a variant.** "Or *not a nation*; see also
  LXX." is a rendering note that cites a witness in its favour; 49 of the 1,336
  "Or …" notes do this. The negative lookahead in test 3 keeps them shippable
  while "…; LXX *In His name the nations will put their hope*" is still held.

### 3.3 First audit — blind, n = 200, whole corpus

200 notes were drawn at random (seeded, reproducible — §11) from all 4,853,
printed **without** the classifier's verdict, and hand-labelled. The labels were
then compared. Adjudication rule, fixed before labelling: *a note is a variant if
any part of it asserts that some manuscript, version or text-family reads
differently from the text printed.*

| | v1 classifier |
|---|---|
| Full six-class agreement | 185/200 = **92.5%** |
| Ship-vs-hold agreement (variant or not) | 196/200 = **98.0%** |
| Variant precision | 35/35 = **100%** |
| Variant recall | 35/39 = **89.7%** |

The 11 full-class disagreements that were not ship/hold errors were all
gloss-versus-other boundary noise ("Nisan is the first month…", "Pinions are the
outer parts of a bird's wings") and carry no consequence — neither class ships.

### 3.4 What the audit actually found, which is the point of running one

All four misses were **one shape**: `"Hebrew does not include X."` — a claim
about the source text with no siglum and no "manuscripts", so nothing in v1 saw
it. Two of the four (Ezekiel 48:28, Obadiah 1:7) were classified **rendering**,
i.e. would have shipped. That is precisely the error this brief exists to
prevent, and no amount of reading the regex would have surfaced it.

There are 15 such notes in the whole BSB with no siglum. Reading them, they are
mostly not variants in the anxious sense at all — "Hebrew does not include *of
Egypt*" means the translators **supplied** a clarifying word the Hebrew lacks,
which is a translator's choice and arguably ideal word-door material. But they
are indistinguishable by prose shape from the genuine "the Hebrew lacks this
clause" cases, they are 0.3% of the corpus, and holding all 13 that the final
classifier catches costs the reader essentially nothing. Hence the `supplied`
class: **named, held, and revisitable** rather than silently swept either way.

v2 (the classifier printed in §3.2) adds tests 4 and 5. Re-scored on the same
200, it is 200/200 on ship-vs-hold and 188/200 full-class — but **that number is
fitted to the sample it was corrected from and should not be quoted as accuracy.**
Hence the second audit.

### 3.5 Second audit — fresh, blind, n = 120, drawn from the ship set

The number that matters is not overall accuracy. It is: *of the notes we would
actually put in front of a reader, how many are textual variants?* So a fresh
sample of 120 was drawn — from v2's `rendering` class only, excluding every note
seen in the first audit — printed blind, and read for variants.

**0 of 120 were textual variants.** With zero observed in 120, the rule of
three puts the 95% upper bound on the true variant rate in the ship set at
**3/120 = 2.5%**. Not one of the 120 required a reader to know anything about
manuscripts to make sense of it.

Two of the 120 were not strictly alternate renderings but adjacent, benign kinds:

- **Versification / punctuation choices** (Matthew 25:16, 3 John 1:14):
  "Translators vary as to the placement of the Greek adverb *eutheōs*…",
  "some translators begin a new verse (15) after *face to face*." These are
  translator's-choice notes about where a boundary falls. They ship.
- **Name-spelling notes** ("*Naphoth-dor* is a variant of *Naphath-dor*"). Dull,
  harmless, and honest.

**Stated plainly, so it is not overclaimed:** the two audits are 320 hand
labels by one adjudicator, drawn with a seeded shuffle from the full corpus.
They establish that the ship set is very clean; they do not establish that it
is perfect, and §9 keeps a reporting path open for the ones that get through.

### 3.6 The classifier is BSB-shaped and must not be reused blind

Run against the KJV's 6,959 helloao footnotes, **every single one falls into
`other`** — 0% classified. The KJV's notes are a different apparatus in a
different format: `"1.4 the light from…: Heb. between the light and between the
darkness"` — a caller prefix, the lemma, a colon, then the gloss (4,148 are
`Heb.`, 29 are `Gr.`). It is a perfectly good rendering apparatus and it needs
its own parser and its own audit. §8 keeps that out of rung one.

---

## 4. What ships: the set, precisely

**Ship** a note when `classify(note.text) === 'rendering'` **and**
`reference.verse !== 0`.

| | |
|---|---|
| Notes in the ship set | **2,099** |
| Verses carrying at least one | **1,995** (6.4% of the Bible) |
| Chapters carrying at least one | **915** of 1,189 |
| Mid-verse (word-anchored) markers | 1,658 |
| Verse-final markers | 441 |
| Note length: median / p90 / max | 32 / 79 / 262 characters |
| Notes ≤ 60 characters | 1,683 of 2,099 (80%) |

Four fifths of what we show is a phrase, not a paragraph. That is what makes the
presentation in §5 possible: the overwhelmingly common case is "Or *futile*",
and the panel is sized for that, not for the 262-character outlier.

---

## 5. The reading surface

### 5.1 The resting affordance: a hairline underline, and nothing else

**The closed state is a 1px dotted underline under the anchored word or phrase,
in the text colour at reduced opacity. No superscript number, no dot, no icon,
no colour, no bold.**

Reasoning, and the alternatives are named so nobody re-litigates them by
accident:

- **A superscript numeral is what a study Bible does, and it is the wrong
  signal.** It reads as an index into an apparatus — it says "there is a system
  here, and you are outside it". It also visually fragments a verse; on a
  chapter with eight of them the eye starts counting instead of reading.
- **A coloured or filled dot is a notification.** Lantern already uses colour on
  the reading page for the reader's own highlights (four categories,
  `MobileSelectionBar`). A second colour system that means "the translators said
  something" would compete with the one that means "*I* said something", and the
  reader's own marks must win that competition.
- **An icon in the margin loses the anchor.** The whole value of this data is
  that it points at a *word*. A margin marker points at a line.
- **Nothing at all** — i.e. a footnotes toggle in `ReadingControls` that reveals
  everything — was considered and rejected: it makes the notes a mode rather
  than a door, and a chapter in "notes on" mode is the study-Bible page we are
  trying not to become.

The dotted underline is the weakest mark that still says "there is something
under this word". It sits below the visual weight of both the verse text and a
highlight, it does not reflow the line, and on a chapter with no notes it is
simply absent.

### 5.2 The open state

Tap or click the underlined phrase → a small popover anchored to the phrase,
containing the note text verbatim and nothing else. Dismiss by tapping the
phrase again, or anywhere outside.

**Reuse `CrossRefPill`'s interaction model directly** (`src/components/
CrossRefPill.tsx`): it already implements hover-to-open on devices with hover
and tap-to-toggle on devices without, detected with
`matchMedia('(hover: hover)')` rather than a user-agent sniff, and it already
handles outside-tap-to-close. The footnote door is the same interaction with a
different payload, and it should be the same component family rather than a
second popover implementation with its own bugs.

One deliberate divergence: **the footnote popover does not open on hover.**
CrossRefPill previews a verse reference, where hover is cheap and welcome. A
footnote is a consultation, and §1 says the reader opens the door. Hover-to-open
means a reader who moves the pointer across a paragraph has consulted five notes
without deciding to. Desktop gets click-to-open, same as touch.

Rung two adds one line at the foot of the popover — "Where else this word
stands" — which is the word door. It is not in rung one.

### 5.3 Visual noise, measured

The question "does this ruin a dense chapter?" has an answer rather than an
opinion. Over the 915 chapters that carry any ship-set note:

| Rendering notes in a chapter | |
|---|---|
| median | **2** |
| p90 | 4 |
| p99 | 7 |
| maximum | **10** (Daniel 11) |

**The worst chapter in the Bible has ten underlined phrases spread over 45
verses.** The typical one has two. This is the payoff from §3's filtering: the
genealogy and building-spec chapters that carry 20+ raw footnotes (Ezekiel 40,
1 Kings 7, Nehemiah 7) are dense in name-spellings, measures and variants —
almost none of which ship. 274 chapters get no marker at all.

So no density escape hatch is needed in rung one. If one is ever wanted, the
right one is a preference in `ReadingControls` alongside the existing display
settings, defaulting to on, and it should be added on evidence rather than
pre-emptively.

### 5.4 Mobile, where the real constraint is

Mobile is not "the same thing, smaller". It has a specific collision:

**On mobile, tapping a verse already means something.** `ReadingMode`'s
`handleVerseClick` starts a verse-range selection, and `MobileSelectionBar`
rises with Note and Highlight. Note capture owns the tap. An underlined phrase
inside `.verse-text` that swallows taps would break selection on exactly the
verses most worth noting — the ones the translators flagged.

The resolution, in order of precedence:

1. **Selection wins whenever a selection is active.** If `MobileSelectionBar` is
   up, taps inside a verse continue to extend the range. Footnote markers are
   inert for the duration. A reader capturing a note is never interrupted by an
   apparatus.
2. **With no selection active, a tap that lands on the underlined phrase opens
   the note; a tap anywhere else in the verse starts a selection.** The hit
   target is the phrase's own bounds — not padded out, since padding is what
   would steal taps from the verse around it.
3. **A drag never opens a note.** `ReadingMode` already distinguishes a drag that
   just ended from a click (the marquee selection guard); the footnote handler
   sits behind the same guard.

The popover on mobile is bottom-anchored rather than floating beside the phrase
(a 390px viewport has no room beside anything), sized to content, dismissed by
tapping out — and it must not open the keyboard or shift the scroll position,
which is the failure the mobile composer work already learned to avoid.

**This is the part most likely to need a real device in hand rather than a
spec.** §9 flags it.

### 5.5 The seam change this needs

`BibleProvider.getChapter` returns `BibleVerseLine[]` = `{ verse, text }`, and a
plain string cannot carry an anchor. Rung one needs verse content to survive as
segments, not as one flattened string:

```ts
export interface BibleVerseLine {
  verse: number
  text: string                    // unchanged — every existing caller keeps working
  notes?: VerseNote[]             // additive
}
export interface VerseNote {
  /** index into `text` where the anchored phrase ends */
  offset: number
  text: string
}
```

Keeping `text` as the flattened string and expressing anchors as **offsets into
it** is deliberate: every existing consumer (the journal, search, note anchoring,
the offline mirror, the self-hosted bundles) keeps working untouched, and only
the reading surface reads `notes`. The alternative — returning a segment array
and making every consumer join it — is a much larger blast radius for no reader-
visible gain.

The offset is computable exactly, because `flattenVerseContent` is deterministic:
flatten the items before the marker with the same joining and punctuation rules
and take the resulting length. **This is the fiddliest correctness detail in the
whole feature** — the flattener collapses whitespace and eats the space before
closing punctuation, so a naive length sum drifts. It needs unit tests over real
chapters (Ecclesiastes 1, Genesis 1, Psalm 119, Daniel 11), and it is the one
place a bug is invisible to a type-checker and visible to a reader as an
underline in the wrong place.

**The self-hosted fallback has no notes and that is correct.** `bsb.json.gz`
stores `[verse, text]` pairs; during a helloao outage the reader gets scripture
with no doors, which is the right degradation and needs no code — `notes` is
simply absent. Do not rebuild the bundles to carry notes in rung one.

---

## 6. Textual-variant footnotes: the position

The deep-dive addendum's plan was "gate it behind a deliberate action, and
consider whether it needs a sentence of factual framing to be responsible". This
brief's answer: **a gate is not sufficient, and the framing sentence is not
something we can write.**

**Position: textual-variant notes do not ship — not in rung one, and not behind
a tap in rung two.** They are held, classified, and revisited only as a
deliberate later decision with its own brief.

The reasoning, which is about what a gate actually is:

1. **A gate controls *when* the reader sees it, not *whether they can evaluate
   it*.** The documented problem is that readers "often do not have enough
   information in the footnote to evaluate the variants". Making the reader tap
   first does not give them that information. It gives them the same
   unevaluable claim, with the added implication that they chose to be told.
2. **The reader cannot tell a big variant from a small one, and the notes do not
   help.** "Some manuscripts omit this question" (1 Samuel 23:11) and "Some
   early manuscripts end the Gospel of Mark after verse 8" (Mark 16:8) are the
   same shape and the same six words of preamble. One is a clause; the other is
   twelve verses of the resurrection account. A presentation that renders them
   identically is not neutral — it flattens a real difference in significance,
   and flattening is what produces the anxiety.
3. **The framing sentence would break the primary-data-only rule, and there is
   no honest short version.** Any sentence adequate to the job — the one that
   explains what a manuscript family is, why the variants exist, and why their
   existence is not evidence of corruption — is a claim we authored about the
   transmission of scripture. That is textual criticism, an area of genuine
   scholarly and confessional disagreement. `deep-dive-study.md`'s line is
   "mediated by method, not by conclusions"; a reassuring sentence about textual
   transmission is a conclusion, and a *contested* one. Writing it puts Lantern
   in the position of telling readers what to think about their Bible's text,
   which is the one thing this whole product refuses to do.
4. **The cost of holding them is small and known.** 880 notes, 18% of the
   corpus. The word door does not need them (§7). Nothing else in Arc 2 depends
   on them. This is not a painful trade.

**What would change this position**, stated so it is a decision rather than a
taboo: if the deep dive later ships a *book introduction* layer (Arc 2, rung 4 —
~66 authored, factual, humble pieces), a variant note could be shown inside a
context that has already, in the reader's own reading, explained how the text
reached them. The framing would live in the book intro, authored once and
attributable, not in a popover on a verse. Until that exists, the honest thing is
silence rather than a gate.

**And "silence" must be genuinely silent.** A held note gets no underline, no
"there is more here", no greyed marker. A visible-but-locked door is worse than
no door — it tells the reader something is being withheld about this verse,
which is the anxiety we are avoiding, delivered without even the content.

---

## 7. The link to the word door — confirming 2,185

`word-door-guardrails.md` §8.2 and `docs/ROADMAP.md` both use the figure 2,185.
Both are checked here, and they need different answers.

**The count is exactly right.** Counting BSB footnotes by leading word:

| Lead | Brief's figure | Measured |
|---|---|---|
| "Or …" | 1,336 | **1,336** |
| "Hebrew …" | 408 | **408** |
| "Literally …" | 387 | **387** |
| "Greek …" | 54 | **54** |
| **Total** | **2,185** | **2,185** |

Four for four, from a completely independent source — the brief counted the STEP
tables' footnote column, this counted helloao's `complete.json`. **Confirmed.**

**Two things the figure is called that it is not.**

1. **It is not 2,185 *alternate-rendering* notes.** Of the 2,185, the classifier
   holds **149 as textual variants** — 91 of the "Hebrew …" ones (the `Hebrew;`
   case from §3.2), 29 "Literally", 28 "Or", 1 "Greek". A further 39 are measure
   conversions ("Greek *about two hundred cubits away*; that is, approximately
   300 feet") and 11 are supplied-word notes. **The alternate-rendering subset of
   the 2,185 is 1,986.** The four-prefix count silently includes exactly the
   notes the roadmap says to ship separately and later.

2. **It is not 2,185 *word-anchored* notes**, which is the word the roadmap uses.
   All 2,185 are anchored in a verse (none is a psalm superscription), but only
   **1,704 sit mid-verse**; the other 481 are verse-final and anchor a trailing
   phrase rather than a word.

**The number to carry forward is 2,099** — the full rendering class, which
catches the "Aramaic …", "Possibly …", "Perhaps …", "Forms of the Hebrew …" and
"The Hebrew …" leads the four-prefix count misses, and drops the variants it
wrongly includes. Of those, **1,658 are word-anchored**, across **1,995 verses**.

### The linkage, specified

For the word door's salience rule (`word-door-guardrails.md` §8.2, signal 1:
"the BSB translators footnoted it as a rendering choice"):

- A word instance carries the footnote signal when **a ship-set note's marker
  immediately follows it** — i.e. the mid-verse case, 1,658 instances. The
  anchor is the marker's position in the verse content array, resolved to a
  character offset in the flattened text by the same computation §5.5 needs.
  **The two features need the same offset code**, which is a good reason to get
  it right in rung one and unit-test it there.
- A verse-final note (441) marks the *verse* as footnoted, not a word. It should
  feed the deep dive's doorway list, but it must not be used to pick "the"
  salient word, because it does not identify one.
- **Held classes carry no signal at all.** A verse whose only note is a variant
  is, for word-door purposes, a verse with no footnote. Otherwise §6's silence
  leaks out through the word door instead.
- 1,995 verses is 6.4% of the Bible. Signal 1 alone will not carry the word
  door — signals 2–4 (thematic density, unusual rendering, marked morphology)
  do most of the work. It is the *highest-quality* signal, not the most
  frequent, and it should be treated as the tie-breaker it is.

---

## 8. Licensing, per translation

### BSB — clear, with one question worth asking

- The BSB is dedicated to the public domain as of 2023-04-30
  ([berean.bible/licensing.htm](https://berean.bible/licensing.htm),
  [berean.bible/terms.htm](https://berean.bible/terms.htm), both fetched
  2026-08-31): *"The Berean Bible and Majority Bible texts are officially placed
  into the public domain as of April 30, 2023"*, and *"All uses are freely
  permitted."* This is the same basis `scripts/build-bsb-bundle.mjs` already
  relies on to redistribute the whole text.
- helloao, the API we fetch from, states *"no copyright restrictions whatsoever
  (including for modification or commercial uses)"*
  ([bible.helloao.org/docs](https://bible.helloao.org/docs/), fetched
  2026-08-31), and it serves the footnotes as part of the chapter response.
- **The open question, and it is worth one email before shipping:** both Berean
  pages say *"texts"* and neither says *"footnotes"*, *"notes"* or *"apparatus"*.
  The dedication is unqualified and "all uses are freely permitted" is broad, so
  the plain reading covers the whole published work — but the pages do not say so
  in terms. **Flagged as unverified.** The cost of resolving it is one message to
  Berean.Bible's contact form, and it costs nothing to send it before the build
  ticket rather than after. Note this is the same caveat
  `translations-esv-niv.md` §1 already raises for the KJV: *"annotated/study
  editions… can carry their own derivative-work copyright even where the base
  text doesn't"*.
- **Attribution: none required.** Public domain, no notice obligation.

### NET — text only, and helloao is leaking 39 notes

This is the one to be careful about, and there is a live finding.

- The NET licence grants the **text only**; the ~60,000 NET translator notes are
  explicitly excluded and are not ours. This is recorded in
  `translations-esv-niv.md` §6 and repeated at the top of
  `scripts/build-net-bundle.mjs`, which is exactly why `eng_net` (the notes-free
  ebible.org edition) was the safe thing to bundle. Attribution is one "(NET)"
  label linked to netbible.com. *(Primary source `netbible.com/copyright/`
  returned HTTP 403 from this runner on 2026-08-31; the terms above are carried
  from `translations-esv-niv.md`'s own verification on 2026-07-22 and are
  **not independently re-verified here**.)*
- **Measured 2026-08-31: `eng_net`'s `complete.json` is not entirely notes-free.
  It carries 39 footnotes across 17 chapters** — 22 of them in Isaiah 43, the
  rest single strays in Matthew, Mark, Luke, John, Acts, Romans and
  2 Corinthians. They are labelled in their own text: 19 begin `"Translator's
  Note"`, 3 begin `"Study Note"`. For example, Isaiah 43:13: *"Translator's Note
  Heb "hand" (so KJV, NASB, NIV, NRSV); NLT "No one can oppose what I do.""*
- **That is precisely the excluded material.** It appears to be an upstream
  data-hygiene artefact in helloao's `eng_net`, not a licence change. **Lantern
  must never render `eng_net` footnotes**, and the rule should be structural
  rather than remembered: the NET provider must not read the `footnotes` array
  at all — a per-translation capability flag, not a filter that someone can
  later "improve". Several also contain dangling references ("See the note at
  ."), so they are useless as well as unlicensed. *(Whether helloao considers
  these a bug is unverified; worth reporting upstream regardless.)*

### KJV — free, different apparatus, not in rung one

- Public domain in the US and almost everywhere; the UK's perpetual Crown
  copyright is the standing exception and does not reach a US-hosted app
  (`translations-esv-niv.md` §1, checked 2026-07-22). The derivative-work caveat
  for annotated editions applies to the apparatus specifically, which matters
  more here than for the bare text.
- helloao's `eng_kjv` carries **6,959 footnotes** (measured 2026-08-31) — the
  translators' marginal readings, 4,148 marked `Heb.` and 29 `Gr.`. Genuinely
  valuable and genuinely a different format (§3.6).
- **Not in rung one**, on effort not licensing: a separate parser and a separate
  audit. See §9's backlog note.

### ESV — footnotes are explicitly off, and should stay off for now

- Crossway's terms allow the text in a free non-commercial app under a
  per-application key, with a 500-verse storage cap and required attribution
  (`translations-esv-niv.md` §1, checked 2026-07-22).
- **`supabase/functions/esv-proxy/handler.ts:91` sends `'include-footnotes':
  'false'` today.** So no ESV note has ever reached Lantern, by construction.
- Leave it false. The ESV's notes are part of the copyrighted work; the storage
  cap already makes ESV a thin, online-only path; and the value of adding a
  second, differently-shaped, licence-restricted apparatus to rung one is
  negative. **Whether Crossway's grant extends to footnotes is unverified** and
  should be checked before anyone flips that flag — not before shipping this.

### Tamil (IRV, TCV) — free, and out of scope for a different reason

- Both are CC BY-SA 4.0 with attribution already rendered in
  `TranslationFooter` (`src/bible/service.ts`).
- `tam_irv` carries 533 footnotes and `tam_tcv` 892 (measured 2026-08-31). They
  are perfectly real notes, and none of §3's classification applies — the
  classifier keys on English leading phrases. Tamil footnotes need a Tamil
  reader to design for, not a regex. Out of rung one; **explicitly not blocked,
  just not specified.**

---

## 9. Effort, and the riskiest part

Estimates are in ideal focused sessions for one person who knows this codebase,
and they assume the audit work in §3 is not repeated (the classifier and its
test corpus are the deliverable of *this* brief).

| Piece | Effort | Notes |
|---|---|---|
| `footnotes.ts`: the classifier + its unit tests | **0.5** | §3.2 is nearly the implementation. Tests over the real corpus classes, not toy strings. |
| Provider: surface `footnotes` + `noteId` offsets through `helloao.ts` into `BibleVerseLine.notes` | **1.5** | The offset computation (§5.5) is the whole cost. Everything else is plumbing. |
| Reading surface: underline + popover, desktop | **1** | Reuses `CrossRefPill`'s open/close model. |
| Mobile: tap arbitration against verse selection | **1.5** | §5.4. Needs a device. |
| Cache + fallback behaviour, offline mirror sanity | **0.5** | Mostly proving nothing broke; `notes` is additive and absent in the bundle. |
| NET capability flag (never read `footnotes`) | **0.25** | §8. Small, and non-negotiable. |
| **Total** | **~5** | Roughly a week of evenings. |

Explicitly **not** included, and each is its own later item: KJV's apparatus
(different parser, own audit); Tamil footnotes; textual variants (§6); the word
door's use of the anchors (§7 — this rung produces the signal, it does not
consume it); ESV footnotes (§8).

**The single riskiest part is the character-offset computation in §5.5** —
mapping a `{ noteId }` marker's position in the content array to an offset in the
flattened verse string. It is risky for a specific reason: **it fails silently
and it fails beautifully.** A wrong offset does not throw, does not fail a type
check, and does not fail a test that only asserts "the note is present" — it
underlines the wrong word, and the reader's takeaway is that Lantern thinks the
translators flagged a word they did not. Every other piece here fails loudly or
visibly. Mitigation: unit tests that assert the *exact anchored substring* for a
fixed set of real verses spanning prose (Genesis 1), poetry with `poem` runs and
`lineBreak` items (Ecclesiastes 1:2, Psalm 119), and the densest ship-set chapter
(Daniel 11) — asserting the substring, never just the offset, because an offset
assertion is a test you can make pass by copying the current wrong answer.

Second-riskiest is §5.4's mobile tap arbitration, for the opposite reason: it
fails loudly, but it fails on the note-capture path, which is the product's
core loop. If it cannot be made clean, **ship footnotes desktop-only and say
so** rather than degrading capture.

---

## 10. What still needs a pass with Dennis

This brief decides the data, the classification and the rules. It deliberately
decides no visual design.

1. **The underline's exact weight and opacity**, and whether it survives dark
   mode and the visual themes. §5.1 decides the *kind* of mark; the values are
   taste.
2. **Whether the popover is Lantern's existing popover** or wants its own
   presentation for a translator's voice.
3. **Mobile arbitration on a real device** (§5.4) — the one thing here that a
   spec cannot settle.
4. **Whether a "translators' notes" display preference is wanted at all** in
   `ReadingControls`. §5.3's density numbers say it is not needed; a reader who
   wants absolute quiet may disagree.
5. **The §6 position on textual variants.** It is more conservative than the
   deep-dive addendum's plan, and it is Dennis's call to hold or relax. If
   relaxed, it needs its own brief, not a paragraph.
6. **Whether a "this note looks wrong" report path is wanted.** §3.5 puts the
   ship set's variant rate below 2.5% but not at zero; a way to hear about the
   ones that get through is cheap.

---

## 11. How to re-run every number here

No script was added to the repo — this is a doc-only change. Each figure above
is reproducible in a few minutes:

1. `curl -sL https://bible.helloao.org/api/BSB/complete.json -o bsb.json`
   (7.4 MB; 66 books, 1,189 chapters, 31,086 verses per its own `translation`
   metadata). The same endpoint pattern gives `eng_kjv`, `eng_net`, `tam_irv`,
   `tam_tcv` — this is the endpoint `scripts/build-net-bundle.mjs` already uses.
2. Walk `books[].chapters[].chapter`, reading `footnotes[]` and the `{ noteId }`
   items inside `content[].content[]`. §2.2–2.5's structural figures fall out of
   one pass.
3. Classify with §3.2's function to reproduce §3.1, §4 and §7's tables.
4. The two audits used a seeded shuffle so the samples are reproducible:
   audit 1, LCG `s = (s*1664525 + 1013904223) mod 2^32`, seed `20260831`,
   Fisher–Yates over all 4,853, first 200. Audit 2, LCG
   `s = (s*1103515245 + 12345) mod 2^31`, seed `77777`, over the `rendering`
   class minus audit 1's indices, first 120. Hand labels are recorded in this
   document's findings, not in the repo.

All figures fetched and computed 2026-08-31 against the live API.

---

## 12. Suggested backlog entry

Pasteable into `docs/BACKLOG.md` under **Deferred**, by a human, once this brief
is accepted. **This brief does not edit that file** (out of scope for the task
that produced it).

```markdown
- **Footnotes door — the translators' own "Or…" notes (deep-dive rung 1).**
  Design + data brief in `docs/proposals/footnotes-door.md`. The BSB chapter
  JSON we already fetch carries 4,853 footnotes and inline `noteId` markers,
  and `helloao.ts`'s flattener discards both. Surface the 2,099
  alternate-rendering notes (measured; 1,995 verses, 6.4% of the Bible) as a
  hairline dotted underline on the anchored phrase, opening a small popover
  with the translators' note verbatim on tap — never on hover, never
  auto-expanded, since observe-before-consult is the method. The other 2,754
  notes are held: 880 textual variants ("some manuscripts omit…") do NOT ship
  and are NOT gated behind a tap, because a gate controls when a reader sees a
  claim they still cannot evaluate, and the framing sentence that would fix
  that is a conclusion about textual transmission we have no business
  authoring; the rest are cross-references, measure conversions and glosses.
  The rendering/variant split is a specified classifier (brief §3.2) audited
  twice against hand labels: 98% ship-vs-hold agreement blind on n=200, and 0
  variants found in a fresh blind n=120 drawn from the ship set. Also produces
  the word door's highest-quality salience signal — 1,658 word-anchored
  instances (this corrects the roadmap's "2,185 word-anchored": the count 2,185
  is exactly right for the four leading-word classes, but 149 of them are
  textual variants and only 1,704 are word-anchored). ~5 sessions. Riskiest
  piece is the marker-to-character-offset computation, which fails silently by
  underlining the wrong word — test the anchored substring, not the offset.
  NET is excluded structurally: helloao's `eng_net` carries 39 stray
  "Translator's Note"/"Study Note" footnotes that the NET licence does not
  grant us, so the NET provider must never read the `footnotes` array.
```
