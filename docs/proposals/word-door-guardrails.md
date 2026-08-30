# The word door — how to ship a lexicon without teaching people to misread

**Recommendation: build it, and make the *sentence* the unit of display, never
the gloss.** The data is clean, open and already tagged word-by-word; the risk
is not the pipeline, it is the interface. A screen that answers "what does
*hebel* mean?" with a definition teaches a reader to import that definition
into every verse, which is the single documented way lay word-study goes wrong.
A screen that answers it with *"here are the 73 places this word stands, in
their sentences, and here is the grammar of this one"* teaches the method
instead. Same data, opposite outcome.

This brief takes the second path and specifies it concretely. It decides the
data plan, the presentation rules, and the trigger. It deliberately decides no
visual design — §9 lists what still needs a pass with Dennis.

Status: **design + data brief, not yet spec'd.** Written 2026-08-30. Companion
to `docs/proposals/deep-dive-study.md`, which placed the word door as the
highest-value layer of the deep dive; this brief is the guardrail work that
document deferred. Every number below is measured against the real files, not
estimated — see §4 and §11.

---

## 1. The stance

Three sentences, because everything after them is detail.

1. **We show primary data and grammar; we never publish a meaning.** The reader
   assembles the meaning. This is the same line the deep dive draws at
   author/book and theme, applied one rung lower.
2. **A word's senses are a range, not a ranked list with a winner.** Presenting
   any sense as "the" meaning is the mechanism by which every documented
   failure mode operates, so we never present one.
3. **Occurrences beat definitions.** Where the data lets us choose between
   telling a reader what a word means and showing them the word working, we
   show it working.

The one-line version, for the UI copy brief: *the door opens onto the word's
neighbourhood, not onto its definition.*

---

## 2. What goes wrong, and who documented it

These are not our worries. They are named, decades-old findings in biblical
semantics, and the reason a "just show them Strong's" build would be actively
harmful rather than merely thin.

### 2.1 The root fallacy

**The claim:** that a word means what its parts or its history mean.
D. A. Carson opens the word-study chapter of *Exegetical Fallacies* (Baker,
2nd ed. 1996) with it, calling it "one of the most enduring of errors" — the
presupposition that the meaning of a word is bound up in its shape, components
or etymology. His stock example is Greek *hypēretēs* ("servant", 1 Cor 4:1),
routinely explained as an under-rower on the bottom deck of a trireme because
it decomposes into *hypo* + *eretēs*. It never meant that in the New Testament.
([Review, Wisconsin Lutheran Seminary](https://www.wisluthsem.org/review-exegetical-fallacies/);
[Word Study Fallacies, The Reformed Reader](https://reformedreader.wordpress.com/2017/01/28/word-study-fallacies-carson/)
— both checked 2026-08-30.)

**Why our data invites it:** Strong's entries carry etymological notes ("from
a primitive root meaning…"), and a lexicon lemma is itself a root-shaped
object. Show the etymology prominently and a reader will reason from it.

**What blocks it:** rule R5 (§6) — etymology is not shown at the door at all.

### 2.2 Illegitimate totality transfer

**The claim:** that a word carries, in any one verse, everything it means
anywhere. James Barr coined the term in *The Semantics of Biblical Language*
(Oxford, 1961, p. 218), aimed largely at Kittel's *TDNT*, where contributors
folded a word's whole attested range into each individual usage.
([Fallacy Fridays, Think Theology](http://thinktheology.org/2011/12/02/fallacy-fridays-the-lexical-fallacy/);
[The "Illegitimate Totality Transfer" Fallacy Illustrated](https://ancienthebrewpoetry.typepad.com/ancient_hebrew_poetry/2007/08/the-illegitimat.html)
— both checked 2026-08-30.)

**Why our data invites it, concretely.** Take the deep dive's own example.
`H1892` (*hebel*) stands 73 times in the BSB tables, 38 of them in
Ecclesiastes, and the BSB renders it 36 different ways. Among those
renderings, measured:

| BSB rendering of `H1892` | occurrences |
|---|---|
| "is futile" | 20 |
| "with their worthless idols" | 3 |
| "worthless idols" | 3 |
| "in vain" | 3 |
| "a breath" | 2 |
| …31 more renderings | 1–3 each |

A reader who meets *hebel* at Ecclesiastes 1:2 and is handed the word's full
range as a flat list will find "idols" in it. Nothing in that list tells them
that the idol sense belongs to Deuteronomy, Kings and Jeremiah and has no
business in Qoheleth's opening line. **A bare range list is a
totality-transfer machine.**

**What blocks it:** rules R1 and R2 (§6) — every sense is anchored to the
verses where it is actually attested, and occurrences are shown in their
sentences.

### 2.3 The specific problem with Strong's

Strong's *Exhaustive Concordance of the Bible* (James Strong, 1890) is the tool
a lay reader reaches for, and it is the wrong shape for the job in four ways.

- **It is an index, not a lexicon.** It catalogues where each English, Hebrew
  and Greek word appears in the King James Version. Strong described his own
  dictionaries as "brief and simple", not a substitute for "a more copious and
  elaborate Lexicon".
  ([Wikipedia, Strong's Concordance](https://en.wikipedia.org/wiki/Strong%27s_Concordance),
  checked 2026-08-30.)
- **Its "definitions" are KJV renderings.** What an entry lists is the set of
  ways the KJV translated that word — an artefact of one 1611 translation
  committee's choices, presented to the reader as the word's meaning.
  ([Ben Spackman, *On Strong's Concordance and Biblical Languages*](https://benspackman.com/2022/12/studying-the-bible-on-strongs-concordance-and-biblical-languages/),
  checked 2026-08-30: "you're not really getting meaning, you're getting the
  KJV single-word-equivalent-in-translation".)
- **It omits the grammar, which is where much of the meaning lives.** A
  Strong's number tags a *lemma*. It does not tell you that this instance is a
  Qal perfect third-person masculine singular, or a Hebrew Hiphil (causative)
  rather than a Qal — and in Hebrew the stem can change the meaning outright.
  Spackman's summary: Strong's conflates the stems, and "if you don't know
  about verbal stems, you're going to make real mistakes." For Greek the same
  loss is tense, voice and mood.
  (Spackman, above; [Strong's Concordance — a Good Tool Gone Bad](https://openoureyeslord.com/2016/08/16/strongs-concordance-a-good-tool-gone-bad/),
  checked 2026-08-30.)
- **It manufactures confidence.** This is the one that matters for a product.
  The tool is easy, it looks authoritative, and it makes a reader with no Greek
  feel they have checked the original. Spackman's phrase — "like handing a
  three-year-old a loaded language gun" — is intemperate, and it is also the
  exact user-experience risk we are designing against.

We use Strong's **numbers**, because they are the lingua franca that joins the
BSB's word tagging to an open lexicon. We do not use Strong's **dictionaries**
as our definition text — §5 covers what we use instead — and we never show a
reader a screen whose shape is a Strong's entry.

### 2.4 The failure modes, mapped to the rules that block them

| Failure mode | Source | Blocked by |
|---|---|---|
| Root fallacy | Carson, ch. 1 | R5 — no etymology at the door |
| Illegitimate totality transfer | Barr, p. 218 | R1 occurrences-in-sentences, R2 unranked range |
| Gloss mistaken for meaning | Spackman; Strong's own preface | R3 — never "really means"; R2 — no primary sense |
| Grammar silently dropped | Spackman | R4 — morphology surfaced per instance |
| False expertise | Spackman | R6 — the honest-limits line (§7) |

---

## 3. Why the hard problem is already solved

The expensive part of a word-study feature is normally the alignment: given the
English word a reader tapped, which original-language word is that? Producing
that mapping from scratch means an interlinear alignment project.

**We do not have to.** The BSB publishes its own translation tables, which are
the per-word alignment behind the translation: one row per original-language
word, carrying the Hebrew or Greek form, transliteration, morphological
parsing, Strong's number, the English words the BSB used for it, and any
translator footnote. This is the whole feature's data spine, and it is the
publisher's own file rather than a third-party reconstruction.

Measured against the real download (§11 for the method):

| Fact | Measured |
|---|---|
| Rows in `bsb_tables.tsv` | 754,647 |
| Rows carrying a Strong's number | 437,587 |
| Distinct Hebrew Strong's numbers | 8,539 |
| Distinct Greek Strong's numbers | 5,337 |
| Verses covered | 31,085 |
| Distinct morphology parsing codes | 3,818 |
| Translator footnote cells | 4,854, across 4,314 verses (13.9%) |
| File size / last modified | 85,525,373 bytes; Fri 31 Jul 2026 |

Worked example — Ecclesiastes 1:2, straight out of the file:

| Strong's | translit | parsing (expanded) | BSB English | footnote |
|---|---|---|---|---|
| 1892 | hă·ḇêl | Noun — masculine singular construct | "Futility" | "Literally *vapor* or *breath*; the Hebrew words translated in Ecclesiastes as forms of *futile* or *fleeting* can also be translated as *vanity* or *meaningless*." |
| 1892 | hă·ḇā·lîm | Noun — masculine plural | "of futilities" | |
| 559 | ’ā·mar | Verb — Qal — Perfect — third person masculine singular | "says" | |
| 6953 | qō·he·leṯ | Noun — masculine singular | "the Teacher" | |
| 1892 | hă·ḇêl | Noun — masculine singular construct | "futility" | |
| 1892 | hă·ḇā·lîm | Noun — masculine plural | "of futilities" | |
| 3605 | hak·kōl | Article \| Noun — masculine singular | "Everything" | |
| 1892 | hā·ḇel | Noun — masculine singular | "is futile" | |

Three things fall out of that one verse, and each of them is load-bearing:

1. **Morphology arrives free, already in English.** The tables carry both a
   compact code (`V-Qal-Perf-3ms`) and an expanded human string ("Verb — Qal —
   Perfect — third person masculine singular"). §2.3's most serious criticism
   of Strong's — that it drops the grammar — is answered by a column we already
   have.
2. **The footnote is anchored to the word, not the verse.** helloao gives us
   verse-level `noteId` markers (`src/bible/helloao.ts:16`); the tables put
   "Literally *vapor* or *breath*" on the *hebel* row itself. That is a
   per-word divergence signal, and §8.2 makes it the trigger.
3. **The alignment is many-to-many and we must honour it.** "of futilities" is
   two English words for one Hebrew word; *hebel* stands five times in a
   single verse. The door is opened on a *word instance*, never on a lemma in
   the abstract.

---

## 4. The data plan

### 4.1 Sources, with licences

| Source | What it gives | Licence position |
|---|---|---|
| **BSB Translation Tables** — `https://bereanbible.com/bsb_tables.tsv` (also `.xlsx`), listed at [berean.bible/downloads.htm](https://berean.bible/downloads.htm) | per-word Strong's, transliteration, morphology, BSB English, footnotes | Public domain. "The Berean Bible and Majority Bible texts are officially placed into the public domain as of April 30, 2023" ([berean.bible/licensing.htm](https://berean.bible/licensing.htm), checked 2026-08-30). Same basis on which `scripts/build-bsb-bundle.mjs` already bundles `bsb.txt`. |
| **STEPBible TBESG** — `Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt` ([github.com/STEPBible/STEPBible-Data](https://github.com/STEPBible/STEPBible-Data)) | Greek lemma, transliteration, morph class, one-word gloss, sense text | CC BY 4.0. Sense text is Abbott-Smith (1922) with Middle Liddell fallback — both public domain. **Usable.** |
| **STEPBible TBESH** — `Lexicons/TBESH - … for Hebrew - STEPBible.org CC BY.txt` | Hebrew lemma, transliteration, morph class, one-word gloss, sense text | **Split, and this matters — see §4.2.** The *Gloss* column is Tyndale House work under CC BY 4.0. The *Meaning* column is not. |
| **OpenScriptures Strong's** — [github.com/openscriptures/strongs](https://github.com/openscriptures/strongs) | Strong's Hebrew/Greek dictionaries, JSON/XML | **Licence UNVERIFIED — see §4.3.** |

### 4.2 The TBESH finding (this changes the plan)

`docs/proposals/deep-dive-study.md` records the STEPBible lexicons as "CC BY
4.0", flat. That is too coarse, and reading the file headers shows why.
TBESH's own header states, verbatim:

> Meaning — These are based on the Abridged BDB by Online Bible, © Larry Pierce
> of OnlineBible.net. They are for guidance only. **Permission should be gained
> from Online Bible before these are applied in any project.**

(`TBESH …CC BY.txt`, header line 47, file fetched from the repo 2026-08-30.)

The Greek file carries no equivalent restriction: TBESG's Meaning column is
Abbott-Smith with Middle Liddell fallback, both long out of copyright.

So the two halves of the lexicon are in different legal positions, and the
plan has to reflect that rather than average over it:

- **Greek:** ship TBESG glosses and sense text.
- **Hebrew:** ship the TBESH **Gloss** column (Tyndale, CC BY 4.0) plus lemma,
  transliteration and morph class. **Do not ship the TBESH Meaning column**
  until either (a) Dennis obtains permission from Online Bible, or (b) it is
  replaced with a public-domain Hebrew source.
- The asymmetry is not visible to the reader as a defect, because §6's rules
  already de-emphasise definition text in favour of occurrences and grammar.
  The Hebrew door shows a gloss, the grammar, and the occurrences; the Greek
  door additionally shows the sense range. **The Hebrew door is still the
  better-populated one**, since Hebrew is where the morphology payload is
  richest.

One further wrinkle, flagged rather than resolved: both files ask readers to
"Refer others to github.com/STEPBible as the source of the data. Please do not
redistribute it yourself." That request sits in tension with the CC BY 4.0
grant printed two lines above it, which permits redistribution with
attribution. **Our build derives a transformed subset rather than
redistributing the files**, which is squarely within CC BY 4.0 and within the
licence's own explicit permission to "download the data and reformat it for
your application". Attribution is therefore non-optional — see R7 (§6).

### 4.3 The OpenScriptures fallback is not verified

The deep-dive brief records OpenScriptures Strong's as MIT. **Unverified, and
the evidence points the other way:** as of 2026-08-30 the repository has no
`LICENSE` file and no `README.md` at its root (GitHub's API reports
`license: null`; the root tree is `build.pl`, `greek/`, `hebrew/`, `index.js`,
`package.json`, `strongs-dictionary.xhtml`, plus two to-do files), and it was
last pushed 2021-07-15.

Consequence for the plan: **OpenScriptures is not in the v1 build.** It was
only ever the fallback for lemmas the STEPBible files miss, and that gap is
small — measured, TBESH+TBESG cover **13,334 of the 13,876 (96.1%)** distinct
Strong's numbers the BSB tables actually use. The 542 uncovered lemmas get a
door that shows what we do have (form, transliteration, morphology,
occurrences) and no gloss, which is a perfectly honest door and arguably a
purer one. Resolving the licence is a nice-to-have, not a blocker.

---

## 5. The build: ETL, output format, sizes

This mirrors `scripts/build-bsb-bundle.mjs` deliberately — same pattern, same
place, same reasoning about not hammering a free service at runtime.

### 5.1 The script

`scripts/build-word-bundle.mjs`, run by hand and committed like
`public/bible/bsb.json.gz` is today. Steps:

1. Fetch `https://bereanbible.com/bsb_tables.tsv` (85.5 MB), honouring a
   `BSB_TABLES_PATH` env override for offline rebuilds — same escape hatch
   `build-bsb-bundle.mjs` gives with `BSB_TXT_PATH`.
2. Forward-fill the sparse `VerseId` column; map its book names to this repo's
   USFM `book_number` 1–66. **The spellings match `build-bsb-bundle.mjs`'s
   existing `BOOK_NAMES` table exactly** — verified, zero unmapped labels
   across all 754,647 rows — so the two scripts should share it.
3. Fetch the two STEPBible lexicon files from
   `raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/…`,
   parse from the `eStrong#` header row, and keep only lemmas the tables
   actually use. Apply the §4.2 rule: drop the TBESH `Meaning` column.
4. Emit the artefacts below, gzip level 9.
5. Assert loudly on drift — verse count 31,085, book count 66, ≥95% lexicon
   coverage — so a silently-changed upstream file fails the build instead of
   shipping a half-empty bundle.

### 5.2 Output format

```
public/bible/words/<bookNumber>.json.gz     66 shards
  { "<chapter>": { "<verse>": [ [english, strongs, translit, parseCode], … ] } }

public/bible/lexicon.json.gz                one file
  { "<H|G><4-digit>": [lemma, translit, morphClass, [gloss, …], [sense, …]] }
  (senses omitted for Hebrew entries — §4.2)

public/bible/parsing.json.gz                one file
  { "<parseCode>": "<expanded English>" }   3,818 entries

public/bible/wordnotes.json.gz              one file
  { "<b>": { "<c>": { "<v>": [note, …] } } }
```

Shapes deliberately echo `bsb.json.gz`'s (`{ book: { chapter: [...] } }`,
arrays-not-objects for the hot path, see `scripts/build-bsb-bundle.mjs`'s
header note).

### 5.3 Measured sizes, and why we shard

| Artefact | gzip | note |
|---|---|---|
| Word rows, **one monolithic bundle** | **4,218,526 B (4.02 MB)** | ~3.3× `bsb.json.gz`. Rejected. |
| Word rows, **66 per-book shards** | 4,304,924 B total | but you only ever fetch one |
| — largest shard (Psalms) | 249,391 B | |
| — median shard | 33,418 B | |
| — smallest shard (2 John) | 2,581 B | |
| — Ecclesiastes / John / Romans | 32,471 / 98,062 / 53,177 B | |
| Lexicon, gloss + morph only | 292,166 B | |
| Lexicon, with Greek sense text (the §4.2 shape) | ≈1.05 MB Greek + 158 KB Hebrew | |
| Parsing-code table | 33,778 B | |
| Word-anchored footnotes | 86,274 B | |
| *(reference)* `public/bible/bsb.json.gz` today | 1,273,758 B | |

**Decision: shard the word rows by book; keep the lexicon, parsing table and
footnotes as single files.** A monolithic 4 MB word bundle triples what the app
already ships for the whole Bible text, to answer a question about one verse.
Per-book, a reader in Ecclesiastes fetches **32 KB**; the worst case anyone can
reach is Psalms at 244 KB, which is smaller than the scripture bundle they are
already comfortable loading. Lazy, on first tap of a word door, never on
chapter render — exactly how `SelfHostedBibleProvider` already treats
`bsb.json.gz` (`src/bible/self-hosted.ts`), and the reason the pattern is worth
copying rather than inventing.

The lexicon stays whole because it is cross-cutting: a door for one word needs
one entry, and sharding by Strong's number would mean 13,334 tiny files. At
~1.2 MB it is the one genuinely large fetch, so **fetch the lexicon lazily and
per-need**: v1 can ship the 292 KB gloss+morph file for everyone and fetch the
Greek sense text only when a Greek door is opened. Whether that split is worth
the complexity should be settled by a real measurement on a phone, not here.

**The occurrence index is derived, not shipped.** "Where else does this word
stand?" indexed as `strongs → verse ids` measures 1,006,535 B gzipped — most
of a second megabyte to answer a question the per-book shards already contain.
Build it in memory the first time a reader asks, from whichever shards are
loaded, and widen it as they read. For the concordance view (§6, R1) we accept
loading additional shards on demand; a full-Bible answer for a common word is
the one case that pays the full 4 MB, and it should be paged rather than
eagerly loaded.

---

## 6. The presentation rules

Each rule states what it prevents. A rule without a failure mode behind it does
not belong in this list, and none of these are style preferences.

### R1 — Occurrences appear in their sentences, never as a gloss list

The "where else is this word" view shows **the verse**, with the tapped word
highlighted, one per row. Never a list of bare glosses or bare references.

*Prevents:* illegitimate totality transfer (§2.2). A reader who sees "worthless
idols" as a row in a list absorbs it as a possible meaning of *hebel*; a reader
who sees it inside Jeremiah 2:5 absorbs that Jeremiah is talking about idols.
The sentence is what does the work.

### R2 — The full sense range is shown, unranked, with no primary definition

No ordering by frequency, no bolding of a "main" sense, no "1)" numbering
carried over from the lexicon's own list, no single-word answer at the top of
the screen. Where TBESH's Gloss column gives one word ("vanity" for `H1892`),
it is presented as *a* gloss with its provenance, never as the answer.

*Prevents:* the gloss-as-meaning error (§2.3) and totality transfer's precursor
— the belief that a word has a core meaning that its uses modify. Note that the
raw data actively pushes the other way: TBESH's single gloss for `H1892` is
"vanity", which is neither the BSB's most common rendering (20 of 73 are "is
futile") nor a good fit for Ecclesiastes 1:2. **Passing the lexicon's own
ranking through to the reader would be a bug.**

### R3 — Never the phrase "really means", and never a definitional headline

Banned framings, explicitly, because they will otherwise be written by someone
in a hurry: "*hebel* really means…", "the literal meaning is…", "the Greek word
for X is Y", "properly translated". The door's heading is the word itself in
its verse, not a definition.

*Prevents:* every failure mode at once, since all of them are downstream of a
reader believing they have been handed the meaning.

### R4 — Morphology is surfaced per instance, wherever the data supports it

Every tagged word instance shows its expanded parsing ("Verb — Qal — Perfect —
third person masculine singular"), in plain English, attached to *this*
occurrence. Where the parsing distinguishes this instance from another
occurrence of the same lemma, that difference is visible rather than flattened.
The tables give this for 437,587 word instances across 3,818 distinct codes;
there is no reason to withhold it.

*Prevents:* the loss Spackman identifies as the most dangerous thing about
Strong's (§2.3) — a lemma-level tool letting a reader believe two instances are
the same word doing the same thing when the stem, tense, voice or mood differ.

### R5 — No etymology at the door

Not shown, not behind a disclosure. Not in v1, and the burden is on a future
proposal to argue it back in.

*Prevents:* the root fallacy (§2.1). Etymology is genuinely interesting and
genuinely misleading in the same breath, and there is no presentation of "from
a root meaning X" that a lay reader reliably reads as history rather than as
meaning. We are not obliged to ship every column we have.

### R6 — Translator footnotes are quoted as the translators' own words

When the BSB footnote is what triggered the door (§8.2), it appears as a quoted
translator's note with that attribution, not paraphrased into our voice and not
presented as our finding.

*Prevents:* the app appearing to adjudicate between renderings. "Or *vanity*"
is the BSB translators saying so; we are the messenger.

### R7 — Provenance is visible, on the entry, not in a settings page

Each door names where its data came from: BSB Translation Tables for the
alignment and morphology, STEPBible/Tyndale House for the lexicon. This is
required by CC BY 4.0 for the STEPBible material (§4.2), and it is also the
epistemics: a reader who can see that a gloss came from an abridged nineteenth-
century lexicon is better equipped than one who thinks it came from Lantern.

*Prevents:* the false-expertise problem (§2.3), plus a real licensing
obligation.

---

## 7. What the reader can honestly conclude, and how we say so

This is "mediated by method, not by conclusions" made concrete, and it is
where a brief like this usually goes wrong in one of two directions: a legal
disclaimer nobody reads, or a lecture about how they really need Greek.

**The position.** A reader with no Hebrew or Greek, given this data, can
legitimately conclude:

- **that a translator made a choice here** — because a footnote says so;
- **which original word stands behind their English word**, and where else in
  scripture that same word stands;
- **what grammatical form this instance is**, in English;
- **that the word's attested range is wider than this verse's rendering**;
- **that a sense attested elsewhere is not thereby present here** — which is
  the actual skill we are teaching.

They cannot legitimately conclude that a sense from another passage is the
"deeper meaning" here, that the English translation is wrong, or that they have
now checked the original. **Our design's job is to make the first list easy and
the second list unavailable**, which is why the honest-limits work is
overwhelmingly in the rules of §6 and only marginally in copy.

**The copy.** One line, at the foot of the door, permanent, unstyled, not a
dismissible banner and not a warning icon:

> These are the words behind the translation, and where else they stand. What
> a word means here is what it means *here*.

That is the whole intervention. Rationale: it is descriptive rather than
cautionary, it states the method rather than the risk, and its second sentence
is the totality-transfer guardrail phrased as an invitation to read the verse
rather than as a prohibition. Deliberately rejected alternatives, so nobody
re-litigates them by accident:

- "This is not a substitute for knowing the original languages" — true,
  discouraging, and it frames the reader as under-qualified for a feature we
  built for them.
- Any wording containing "be careful", "caution", "remember that" — preachy,
  and the reader has done nothing wrong yet.
- A dismissible first-run modal — dismissed once, then absent for exactly the
  readers who most need the frame.
- Nothing at all — leaves R3's work entirely to the absence of bad copy, which
  will not survive the fifth person to touch this screen.

Copy is Dennis's call in the end (§9), but the *shape* — one permanent
descriptive line, never a warning — is a decision this brief makes.

---

## 8. Triggering the door

### 8.1 Not every word. Explicitly.

Every word in a verse is tagged, so every word *could* have a door. **It must
not.** A chapter where all 200 words are tappable is the "dump" the doorways
model exists to prevent (`deep-dive-study.md`, "The USP"), and it is worse than
a dump here, because tappability reads as significance: making "and" a door
tells the reader there is something to find in "and". Underlining every word
also destroys the calm-scripture requirement the reading page is built around.

### 8.2 Salience: what earns a door

A word instance earns a door when at least one of these holds. In precedence
order, since the strongest signal should decide the door's headline:

1. **The BSB translators footnoted it as a rendering choice.** Measured, from
   the tables' footnote column: 4,854 notes across 4,314 verses (13.9% of
   verses), of which the alternate-rendering classes are — "Or …" 1,336,
   "Hebrew …" 408, "Literally …" 387, "Greek …" 54. That is roughly 2,185
   word-anchored divergence signals, and it is the highest-quality one we have,
   because a human translator decided it was worth flagging. The Ecclesiastes
   1:2 note in §3 is exactly this case.
2. **The word is thematically dense in this book.** Computable from the
   occurrence data: a lemma whose occurrences concentrate sharply in the book
   being read. *hebel* is 38 of 73 occurrences in Ecclesiastes — it is
   Qoheleth's word, and a reader in Ecclesiastes 1 should be offered it.
3. **The rendering is unusual for the lemma.** Where the BSB's English for this
   instance is a rare choice among the lemma's 36 renderings, something
   interesting happened in translation.
4. **The morphology is marked.** A stem or mood that changes the sense — a
   Hiphil, an imperative, a middle voice — where a reader would otherwise
   assume a plain indicative.

Function words (articles, conjunctions, particles, the direct-object marker
`853`) are excluded outright regardless of the above. Words the reader has a
note on rank up, since they have already shown that this is where their
attention is.

**The signpost, and the ranking, are what make this feel like the deep dive
rather than an interlinear.** A verse gets *one* word door offering *the*
salient word — "What *hebel* means", to use the deep dive's own phrasing —
not a door per candidate. Where several words qualify, the door leads with the
highest-precedence one and the others are reachable inside it.

Empty is never shown: a verse with no qualifying word gets no word door, and
the deep dive offers whatever other doors it has.

### 8.3 The interaction, and what it is not

The door is opened from the deep dive's doorway list, which is the model
`deep-dive-study.md` settled on. **The reading page's own word-tap behaviour is
out of scope for this brief** — whether a long-press on a salient word in the
main reader is a second entrance is a real design question with real
consequences for note capture (which owns text selection today), and it should
be decided with the reading page in front of you, not here. See §9.

---

## 9. What still needs a design pass with Dennis

This brief decides data, rules and triggers, and deliberately makes no visual
or taste decisions. What is genuinely open:

1. **The door's layout.** How the word instance, its grammar, its gloss and its
   occurrence list share one screen without the gloss becoming the headline.
   R2 and R3 constrain this hard and do not determine it.
2. **How occurrences are paged.** 73 occurrences for *hebel* — and lemmas with
   hundreds exist. What "show more" looks like, whether they group by book, and
   how the current verse is pinned.
3. **How the salient word is marked in the verse.** Or whether it is marked at
   all versus only named in the doorway line. This is the calm-scripture
   constraint versus discoverability, and it is precisely the taste call.
4. **Whether the reading page gets a direct word tap** (§8.3), and how it
   coexists with selection-for-notes on mobile.
5. **The exact wording of the honest-limits line** (§7). The shape is decided;
   the words are Dennis's.
6. **How morphology reads to a non-specialist.** "Qal perfect third person
   masculine singular" is accurate and opaque. Whether we soften it, layer it,
   or trust it as-is is a judgement call about who this app is for.
7. **Whether a Hebrew door visibly differs from a Greek one** (§4.2), or
   whether the asymmetry stays invisible.

---

## 10. Suggested backlog entry

Pasteable into `docs/BACKLOG.md` under **Deferred**, by a human, once this
brief is accepted. This brief does not edit that file.

```markdown
- **Word door — original-language word study (deep-dive layer 1).** Design +
  data brief in `docs/proposals/word-door-guardrails.md`. Tapping a salient
  word in a verse opens its original-language word: the Hebrew/Greek form,
  transliteration, per-instance morphology in plain English, and where else
  that word stands — shown in sentences, unranked, never as a definition. The
  brief exists because handing a reader a raw dictionary entry reliably
  teaches root fallacy and illegitimate totality transfer (Carson; Barr), and
  it specifies the presentation rules that block each one. Data is measured
  and clean: BSB Translation Tables (`bsb_tables.tsv`, public domain, 85 MB)
  give per-word Strong's + morphology + word-anchored translator footnotes;
  STEPBible TBESG/TBESH (CC BY 4.0) give the lexicon. Build is a
  `scripts/build-word-bundle.mjs` ETL in the same shape as
  `build-bsb-bundle.mjs`, emitting 66 per-book shards (median 33 KB, worst
  244 KB) plus a lexicon, parsing table and footnote file — sharded because a
  monolithic bundle measures 4.0 MB gzip against `bsb.json.gz`'s 1.24 MB.
  Two things need Dennis before/while building: (a) the TBESH *Meaning*
  column is © Online Bible and needs permission — v1 ships the Tyndale
  *Gloss* column instead, so the Hebrew door has no sense text; (b) the door's
  visual design, occurrence paging and the honest-limits copy are an unmade
  taste call (brief §9). Depends on the deep-dive entry surface (doorways
  model) existing, and on translator footnotes being rendered at all — ship
  footnotes first.
```

---

## 11. How the numbers were produced

So that any of this can be re-checked rather than trusted. All figures dated
2026-08-30, on the HQ runner (Node 22 / Python 3).

- `bsb_tables.tsv` downloaded from `https://bereanbible.com/bsb_tables.tsv`
  (HTTP 200, 85,525,373 bytes, `Last-Modified: Fri, 31 Jul 2026 15:01:49 GMT`).
  Parsed as tab-separated with quoting disabled — **the file contains raw `"`
  characters inside footnote text, so a default CSV reader corrupts it**; that
  is a real gotcha for whoever writes the ETL.
- Row/lemma/verse/footnote counts: forward-fill of the sparse `VerseId` column,
  then direct counting. Footnote classes counted on the first alphabetic token
  after stripping HTML tags.
- Lexicons downloaded from
  `raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/` —
  TBESH 3,288,045 bytes / 11,682 data rows / 9,345 distinct eStrong numbers;
  TBESG 4,736,912 bytes / 11,035 rows / 10,847 distinct. Data parsed from the
  `eStrong#` header row.
- Coverage: 13,334 of 13,876 distinct Strong's numbers used by the tables are
  present in TBESH ∪ TBESG (96.1%).
- All sizes are `gzip` level 9 over compact JSON (`separators=(',',':')`,
  `ensure_ascii=False`), matching what `build-bsb-bundle.mjs` produces.
- Repository metadata (licence null, root tree, last push) read from the GitHub
  REST API.

## 12. Sources

All checked 2026-08-30.

| Claim | Source |
|---|---|
| Root fallacy; Carson, *Exegetical Fallacies* ch. 1 | [wisluthsem.org](https://www.wisluthsem.org/review-exegetical-fallacies/) · [reformedreader.wordpress.com](https://reformedreader.wordpress.com/2017/01/28/word-study-fallacies-carson/) |
| Illegitimate totality transfer; Barr 1961, p. 218 | [thinktheology.org](http://thinktheology.org/2011/12/02/fallacy-fridays-the-lexical-fallacy/) · [ancienthebrewpoetry.typepad.com](https://ancienthebrewpoetry.typepad.com/ancient_hebrew_poetry/2007/08/the-illegitimat.html) |
| Strong's 1890, index to the KJV, "brief and simple" dictionaries | [en.wikipedia.org/wiki/Strong's_Concordance](https://en.wikipedia.org/wiki/Strong%27s_Concordance) |
| Strong's gives KJV renderings not meaning; conflates verbal stems; false confidence | [benspackman.com](https://benspackman.com/2022/12/studying-the-bible-on-strongs-concordance-and-biblical-languages/) |
| Strong's omits tense/voice/mood detail | [openoureyeslord.com](https://openoureyeslord.com/2016/08/16/strongs-concordance-a-good-tool-gone-bad/) |
| BSB public domain from 2023-04-30 | [berean.bible/licensing.htm](https://berean.bible/licensing.htm) |
| BSB Translation Tables download (`bsb_tables.tsv` / `.xlsx`) | [berean.bible/downloads.htm](https://berean.bible/downloads.htm) |
| STEPBible data CC BY 4.0 | [github.com/STEPBible/STEPBible-Data](https://github.com/STEPBible/STEPBible-Data) |
| TBESH Meaning © Online Bible, permission required | `Lexicons/TBESH …CC BY.txt`, header line 47 (file fetched 2026-08-30) |
| TBESG Meaning = Abbott-Smith / Middle Liddell | `Lexicons/TBESG …CC BY.txt`, header lines 77–79 |
| OpenScriptures Strong's licence | [github.com/openscriptures/strongs](https://github.com/openscriptures/strongs) — **no LICENSE file, no README, GitHub reports no licence; the "MIT" in `deep-dive-study.md` is UNVERIFIED** |

**Unverified / to confirm:**

- OpenScriptures Strong's licence (above). Not a blocker — §4.3.
- Whether STEPBible's "please do not redistribute it yourself" is intended as a
  restriction on the CC BY 4.0 grant or a courtesy request. We read it as a
  courtesy and derive rather than redistribute (§4.2); worth an email to
  STEPBible before shipping.
- Whether the BSB Translation Tables are covered by the same public-domain
  dedication as the BSB text. The dedication names "the Berean Bible and
  Majority Bible **texts**"; the tables are on the same free-downloads page
  under the same "free to access and free to share" framing, and the
  morphological tagging derives from WLC and Nestle base texts. Treated here as
  usable on the same basis the repo already relies on for `bsb.txt`, but the
  wording does not name the tables explicitly. Worth confirming with the
  publisher.
- Carson and Barr are cited via secondary sources that quote them, not from the
  books themselves; page/edition details are as those sources report.
