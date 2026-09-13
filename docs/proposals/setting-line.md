# The setting line — one short objective sentence per cross-reference

**Recommendation: ship the BSB's own section heading, framed as a heading and
gated by how far the verse sits below it. Do not ship a sentence generated from
per-verse metadata, and do not use a model at all.** The heading is the only
candidate source that covers the whole problem (100% of the connection rows a
reader can reach), is already short enough to obey the word cap without editing
(median 4 words, longest 9 in the entire Bible), is public domain, and reads as
English rather than as a caption. Every metadata source measured here — the two
open knowledge graphs and Lantern's own place data — produces lines that are
true and useless: 27% of the generated lines say only that the passage *names
God*, and another 28% name an "event" that is really a whole book
("Part of Prophecies of Isaiah"). A model cannot fix that, because the problem
is missing information, not clumsy wording; a model that made those lines read
well would be inventing the facts they lack, which is the one failure mode the
rules below exist to prevent.

Status: **data + rules brief, nothing built.** Written 2026-09-13, companion to
`docs/proposals/connections-door.md` (which shipped the door this line would sit
in, and set the salience threshold this brief measures against) and
`docs/proposals/footnotes-door.md` (same register: measured, with reproduction
commands, and a blind audit before a classifier ships). All numbers below come
from `scripts/measure-setting-line.mjs`, which this brief adds. **It walks the
whole corpus rather than sampling** — all 1,189 cross-reference chapters fetch
in ~35s at concurrency 8 and cache to disk — so every figure is exact, not an
estimate from 200 verses. §9 says how to re-run each one.

---

## 1. The stance

1. **The line says where the reader is about to land, not why it matters.** The
   door already ranks connections; the value it does not yet deliver is being
   able to tell three references apart — *which one was the letter to Rome and
   which one was Abraham at Moriah* — which is a question about the destination
   passage alone.
2. **Therefore the line is a function of the destination verse only, never of
   the pair.** This is the brief's most consequential structural finding, and it
   collapses the data problem: 39,209 reachable connection rows point at just
   11,491 distinct destination verses, so a destination-keyed file needs 3.6x
   fewer entries than a `(source, destination)`-keyed one and contains exactly
   the same information (§6.1).
3. **A source that cannot answer "whose passage is this, and where or when" is
   not a source for this feature.** People and places *mentioned in a verse* are
   a different fact from who is speaking and where they are, and the audit in §5
   is what happens when the two are conflated.
4. **Provenance is visible on every line, always.** The line is a note from
   Lantern quoting a named source. That framing is load-bearing rather than
   cosmetic: it is what makes an editorial section heading an honest statement of
   *where the verse sits* rather than Lantern asserting what the verse means
   (§3, R5).

---

## 2. The population a line has to cover

The connections door opens only where a verse's strongest connection clears the
shipped salience threshold — `THRESHOLD = 30` in `src/utils/connections.ts`, set
by `connections-door.md` §5. The measurement script **reads that constant out of
the TypeScript** rather than restating it, so this brief cannot silently drift
from the shipped behaviour if the threshold is ever retuned.

| | Count | Share |
|---|---|---|
| BSB verses | 31,086 | — |
| verses whose door opens (top score ≥ 30) | **1,810** | 5.8% of verses |
| connection rows inside those doors (score > 0) | **39,209** | — |
| …of which shown prominently, in a top-3 slot (§6.2 there) | **5,403** | 13.8% of rows |
| **distinct destination verses** | **11,491** | 37.0% of all verses |
| rows per destination verse | median **2** | — |

The 5.8% figure is the exact whole-corpus number for the sampled 5.5% in
`connections-door.md` §5 — a useful independent confirmation that its 200-verse
sample was drawn honestly.

---

## 3. The sources, each opened rather than summarised

### 3.1 BSB section headings — public domain, 100% coverage, already short

The headings are **already in the chapter feed Lantern fetches**:
helloao's `content` array interleaves `{ type: 'heading', content: [...] }`
nodes with verse nodes, which `src/bible/helloao.ts` already types (it parses
them and the reading page currently drops them — §6.3). A verse's heading is the
nearest heading above it in that array.

| Measured over the whole BSB | |
|---|---|
| chapters carrying ≥1 heading | **1,189 / 1,189 (100%)** |
| headings per chapter | median 2 |
| verses that sit under a heading | **31,086 / 31,086 (100%)** |
| destination verses under a heading | **11,491 / 11,491 (100%)** |
| connection rows under a heading | **39,209 / 39,209 (100%)** |
| top-3 rows under a heading | **5,403 / 5,403 (100%)** |
| heading length | median **4 words**, longest **9** |
| headings over the 12-word cap (§4, R4) | **0** |

That last row matters more than it looks: the word cap this brief imposes is a
constraint the heading source satisfies *for free, everywhere*, with no
truncation, no summarisation and therefore nothing for a model to do.

**The one real defect is distance.** A heading describes the section it opens,
and a verse deep inside a long section may have little to do with it:

| Verses below its heading | Destinations | Rows covered |
|---|---|---|
| 0 (the first verse under it) | 1,272 | 5,311 · **13.5%** |
| ≤ 2 | 3,579 | 13,274 · **33.9%** |
| ≤ 4 | 5,564 | 20,261 · **51.7%** |
| **≤ 10 (recommended)** | **9,152** | **32,671 · 83.3%** |
| no gate | 11,491 | 39,209 · 100% |

Median distance is 5 verses, p90 is 15, and **20.4% of destinations sit more than
10 verses below their heading** — concentrated exactly where you would expect:
Job (median 11), Proverbs (median 11), Lamentations (10.5), Nehemiah (8),
Psalms (8). The worked example is Proverbs 21:30, whose nearest heading is *"The
King's Heart"*, **29 verses up**, and which is about nothing of the kind. The
recommended `reach ≤ 10` gate excludes it.

**Licence.** The BSB is dedicated to the public domain (berean.bible/licensing.htm,
*"officially placed into the public domain as of April 30, 2023"*, and
*"All uses are freely permitted"* — the same basis `scripts/build-bsb-bundle.mjs`
already relies on to redistribute the whole text, cited in `footnotes-door.md`
§8). helloao adds *"no copyright restrictions whatsoever"*. **May ship.** No
attribution is legally required; we show it anyway, because R5 is about honesty
to the reader rather than compliance.

**One caveat, stated plainly: the headings are editorial, and only the BSB has
them.** Checked live: helloao's `eng_kjv` Genesis 15 response contains 21 verse
nodes and **zero** heading nodes — the KJV has no section headings at all. So a
KJV, NET or Tamil reader would be shown a heading the translation on their
screen does not contain. That is defensible (the heading describes the passage,
not the wording, and §3's R5 names its source on the line), but it is Dennis's
call, and it is question D2 in §8.

### 3.2 Canonical Hebrew superscriptions — real scripture, thin coverage

116 chapters carry a `hebrew_subtitle` node (Psalms, plus Habakkuk 3), and these
are *part of the text*, not editorial: *"A Psalm of David, when he fled from his
son Absalom."* That is precisely the sentence this feature wants — speaker and
circumstance, in the text's own voice.

Coverage is the problem: **958 destination verses (8.3%) and 2,887 rows (7.4%)**.
And roughly half of each superscription is performance direction rather than
setting (*"For the choirmaster. With stringed instruments."*), so the generator
drops those clauses (see `superscriptionLine`). **May ship** (public domain,
same basis as §3.1). Worth having as a second-choice source precisely where the
heading gate is weakest (Psalms, median distance 8), which is why it sits second
in the fallback chain in §6.1.

### 3.3 Theographic Bible Metadata — CC BY-SA 4.0, may ship, but the lines are vacuous

The knowledge graph the business case implies: people, places, events and a year
per verse, keyed `verseID` = `BBCCCVVV` — **byte-identical to the `VerseKey`
`src/utils/mapData.ts` already uses** for the map's verse index, so it joins to
Lantern's existing data with no mapping layer.

**Licence, checked two ways (GitHub's API *and* the file):** `license.spdx_id` is
`CC-BY-SA-4.0`, and the repository root carries a real `LICENSE` file whose first
line is *"Attribution-ShareAlike 4.0 International"*; the README restates it
(*"free to use and copy under a Creative Commons Attribution Share-Alike 4.0
License"*). **It may ship, with attribution, and the share-alike term applies to
the derived data file** — i.e. the generated lines would themselves be CC BY-SA
4.0, which is a term Lantern already lives with: `src/bible/service.ts` renders
exactly this for the Tamil translations through `TranslationFooter`. No new
category of obligation.

Coverage, over its 31,102 verse records:

| Field | Verses carrying it |
|---|---|
| `people` | 16,506 · 53.1% |
| `event` | 15,619 · 50.2% |
| `places` | 4,811 · 15.5% |
| `yearNum` | 28,024 · 90.1% |

On the destinations that matter: **8,628 of 11,491 (75.1%)** carry at least one
of people/places/event, and a template can be filled for **29,751 of 39,209 rows
(75.9%)**. On coverage alone it looks like a serious contender. It is not, for
three measured reasons:

1. **26.6% of the generated lines say only that the passage names God or Jesus**
   (2,292 of 8,628). "The text names God." is true of most of Scripture and
   distinguishes nothing, which is the entire job.
2. **28.0% name a book-scale "event"** (2,413 of 8,628) — Theographic's `event`
   for Isaiah 59:18 is *"Prophecies of Isaiah"*, which spans 1,292 verses. That
   is a bucket, not a setting.
3. **`people` and `places` are entities *mentioned*, not a speaker and a
   location.** A template that rendered them as "Moses at Sinai" would assert
   presence the data does not carry, so the generator says "the text names …" —
   honest, and unmistakably a caption rather than a sentence.

**`yearNum` is excluded deliberately, and not for coverage reasons** (it is the
best-covered field at 90.1%). Theographic dates creation to −4003; the numbers
are a *chronology*, which is a contested interpretive framework, not a neutral
fact about a passage. A line reading "about 4004 BC" would smuggle a position
into a feature whose whole premise is leaving the meaning to the reader. R2
forbids it.

### 3.4 Lantern's own place data — already shipped, but only answers "where", rarely

`public/map/places.json.gz` (built by `scripts/build-map-data.mjs` from OpenBible
Bible-Geocoding-Data, **CC BY 4.0**, confirmed again this run via GitHub's API,
attribution string already embedded in the bundle) carries 1,342 places and a
verse index of 5,616 verses. Read from the repo with no network.

On the destinations: **1,149 verses (10.0%)** and **2,483 rows (6.3%)**. It is a
strict subset of the "where" Theographic gives, it names no speaker, and it is
already loaded for a different feature. **Verdict: not a line source.** Its role
is the map thread, which §7 puts explicitly out of scope.

### 3.5 STEPBible TIPNR — CC BY, the richest who/where, and not worth it yet

*Translators Individualised Proper Names with all References* — every proper name
in the ESV with an exhaustive occurrence list, per-individual (so two Zechariahs
are two entities).

**Licence, read from the file's own header** rather than from GitHub, whose API
reports `license: null` for `STEPBible/STEPBible-Data` (no `LICENSE` file — the
same shape of trap `deep-dive-study.md` §"correction" caught twice): *"Data
created by www.STEPBible.org based on work at Tyndale House Cambridge (CC BY
4.0)"*, granting *"Include any part of this data in software or publications
without requesting permission"* and *"Download the data and reformat it for your
application"*. It also asks *"Please do not redistribute it yourself"* — the
same tension `deep-dive-study.md` already recorded and resolved the same way: a
transformed derived subset is inside the grant; republishing the file is not.
**May ship, with attribution.**

Coverage, as a deliberate **lower bound**: a regex over unambiguous `Bk.C.V`
tokens finds 11,010 distinct verses, reaching **3,528 destinations (30.7%)** and
**10,945 rows (27.9%)**. It is a lower bound because TIPNR abbreviates reference
runs in its "All refs" column, so a faithful index needs a real parser for its
reference grammar — an afternoon's work, not a regex.

**Verdict: named, licensed, measured, and deferred.** It is the best available
answer to "which individual", but it answers the same question Theographic
already answers (who is *mentioned*), and §5's audit shows that question does not
produce a usable line at any coverage. Its name forms are also ESV-derived, and
Lantern ships no ESV. Revisit only if a "who is speaking" dataset appears to pair
it with.

### 3.6 Named and excluded

| Dataset | Why it is out |
|---|---|
| `spookylukey/bible-quotation-database` | **No licence at all** — `license: null`, no `LICENSE`, and itself an aggregation of two unlicensed personal sites. Already excluded by `connections-door.md` §3.2; nothing has changed. |
| OpenScriptures Strong's | No licence (`license: null`, no README). Already out of the word door per `deep-dive-study.md`. |
| STEPBible TBESH *Meaning* column | Abridged BDB, © Online Bible; header requires permission first. Out, per `deep-dive-study.md`. |
| ESV / NIV section headings | Copyrighted editorial content of translations Lantern does not licence. Never a candidate. |
| NET section headings | The NET grant Lantern relies on is **text only** — the same reason `src/bible/helloao.ts` refuses to *read* the NET footnote array rather than filtering it. Treated identically: not read. |
| Easton's Bible Dictionary (bundled in Theographic) | Public domain (1897) and genuinely usable, but it defines *terms*; it says nothing about a passage's setting. Wrong shape, not a licence problem. |
| Theographic `yearNum` | Licensed and well-covered, excluded on the rules: a chronology is an interpretation (§3.3). |

### 3.7 The licence table, in one place

| Source | Licence | Verified how | May ship? |
|---|---|---|---|
| BSB section headings + superscriptions | Public domain | berean.bible/licensing.htm + terms.htm; helloao's own terms | **Yes** (attribution shown anyway, per R5) |
| OpenBible cross-references (the rows themselves) | CC BY 4.0 | dataset metadata in every `open-cross-ref` response | **Yes, with attribution** (already shipped) |
| Theographic Bible Metadata | CC BY-SA 4.0 | GitHub API `spdx_id` **and** the `LICENSE` file **and** the README | **Yes, with attribution; derived file inherits share-alike** |
| OpenBible Bible-Geocoding-Data (Lantern's places) | CC BY 4.0 | GitHub API; attribution embedded in `places.json.gz` | **Yes** (already shipped) |
| STEPBible TIPNR | CC BY 4.0 | the file header (GitHub reports `license: null`) | **Yes, with attribution**; "do not redistribute the file" respected |
| bible-quotation-database, OpenScriptures, TBESH Meaning, ESV/NIV headings, NET headings | none / restricted / not ours | see §3.6 | **No** |

---

## 4. The rules, as hard constraints on the data

These are not style guidance. Each one is checkable, and §5 checks them.

- **R1 — The line describes the destination passage's own setting.** Allowed
  content: who is speaking, who is addressed, where, when, or *the heading the
  passage sits under*. Nothing else.
- **R2 — The line never states the significance of the connection.** It may not
  mention the source verse at all. "Paul quotes this to argue…" is forbidden;
  so is any dating or framing that embeds a position (§3.3 on `yearNum`).
- **R3 — The line never says what either verse means.** Banned outright:
  *means, meaning, teaches, shows that, proves, fulfils, fulfilment, points to,
  is about, reminds us, applies to* and equivalents. Enforced as a build-time
  reject list over every generated string, not as a reviewer's habit.
- **R4 — At most 12 words.** A reject, not a truncation: a line that exceeds the
  cap is dropped and the next source in the chain is tried. Measured: **0 of
  11,491** headings exceed it (longest in the Bible: 9 words); **194 of 8,628**
  template lines do, and are dropped.
- **R5 — Visible provenance on every line.** The row shows that this is a note
  from Lantern *and* names what it is built from — "a note from Lantern ·
  section heading, Berean Standard Bible". This is what makes an editorial
  heading honest: "New Life in Christ" printed unattributed is Lantern claiming
  what Ephesians 4:24 means; the same words presented as the heading the verse
  sits under is a true statement about the text's own layout.
- **R6 — A heading may only describe a verse within 10 verses of it** (§3.1's
  reach gate). Past that it is a section label that happens to be above the
  verse.
- **R7 — Nothing runs per reader.** Every line is generated at build time into a
  versioned static file, hand-reviewable, diffable, and identical for everyone.
  No inference at read time, ever.

---

## 5. Generation, and the 40 lines it actually produced

**Template-first, and — recommended — template-only: no model anywhere in this
pipeline.** The generator is three pure functions in
`scripts/measure-setting-line.mjs` (`headingLine`, `superscriptionLine`,
`templateLine`); the shipped build would import the same logic. The fallback
chain is: gated heading → superscription → Theographic template → **no line at
all** (a row with nothing to say shows nothing, exactly as the door shows no
score).

### 5.1 Twenty heading lines, drawn seeded from real destinations

| # | Destination | Line | Words |
|---|---|---|---|
| 1 | Isaiah 42:5 | Here Is My Servant | 4 |
| 2 | Isaiah 63:9 | God's Mercies Recalled | 3 |
| 3 | Isaiah 44:24 | Jerusalem to Be Restored | 4 |
| 4 | Psalm 94:13 | The LORD Will Not Forget His People | 7 |
| 5 | 1 Samuel 2:7 | Hannah's Prayer of Thanksgiving | 4 |
| 6 | Psalm 73:22 | Surely God Is Good to Israel | 6 |
| 7 | Luke 9:27 | Take Up Your Cross | 4 |
| 8 | Psalm 42:2 | As the Deer Pants for the Water | 7 |
| 9 | Ezra 8:21 | Fasting for Protection | 3 |
| 10 | Psalm 62:1 | Waiting on God | 3 |
| 11 | 1 Corinthians 10:9 | Warnings from Israel's Past | 4 |
| 12 | Matthew 9:16 | The Patches and the Wineskins | 5 |
| 13 | Isaiah 60:7 | Future Glory for Zion | 4 |
| 14 | Deuteronomy 30:6 | The Promise of Restoration | 4 |
| 15 | Joshua 24:24 | Choose Whom You Will Serve | 5 |
| 16 | Hebrews 2:8 | Jesus like His Brothers | 4 |
| 17 | Genesis 18:13 | Sarah Laughs at the Promise | 5 |
| 18 | Isaiah 27:1 | The LORD's Vineyard | 3 |
| 19 | 1 Chronicles 10:13 | Jabesh-gilead's Tribute to Saul | 4 |
| 20 | 2 Samuel 6:20 | Michal's Contempt for David | 4 |

**These read well enough to ship** — as headings, with R5's frame. Roughly half
name a setting outright (5, 17, 19, 20 give a person and an act); the rest name a
theme, which the frame makes honest rather than editorial.

### 5.2 Twenty template lines from Theographic, drawn the same way

| # | Destination | Line | Words |
|---|---|---|---|
| 1 | Luke 9:58 | Part of Seaside Parables and Miracle; the text names Jesus. | 10 |
| 2 | Joshua 23:14 | The text names God. | 4 |
| 3 | Isaiah 59:18 | Part of Prophecies of Isaiah. | 5 |
| 4 | 2 Corinthians 3:14 | The text names Jesus. | 4 |
| 5 | Exodus 25:2 | Part of Tabernacle Built; the text names Israel. | 8 |
| 6 | 2 Peter 3:5 | The text names God. | 4 |
| 7 | Hebrews 13:16 | The text names God. | 4 |
| 8 | Ezekiel 37:24 | Part of Prophecies of Ezekiel; the text names David. | 9 |
| 9 | Numbers 24:17 | The text names Israel and Seth, and Moab. | 8 |
| 10 | Jeremiah 23:26 | Part of Prophecies of Jeremiah. | 5 |
| 11 | Acts 21:11 | Part of Voyage from Miletus to Jerusalem; the text names Jerusalem. | 11 |
| 12 | Acts 1:18 | Part of Matthias replaces Judas. | 5 |
| 13 | 2 Samuel 5:19 | Part of Reign of David; the text names David and God. | 11 |
| 14 | Matthew 24:4 | Part of Olivet Discourse; the text names Jesus. | 8 |
| 15 | Proverbs 16:4 | The text names God. | 4 |
| 16 | Isaiah 29:16 | Part of Prophecies of Isaiah. | 5 |
| 17 | Revelation 21:14 | The text names Jesus. | 4 |
| 18 | 1 Kings 2:28 | Part of Reign of Solomon; the text names Joab and Adonijah. | 11 |
| 19 | Exodus 34:27 | The text names Moses and Israel. | 6 |
| 20 | Matthew 13:50 | Part of Seaside Parables and Miracle. | 6 |

**Verdict, stated as the acceptance criteria ask: the templates alone do NOT
read well enough.** Eight of these twenty (2, 4, 6, 7, 15, 17, and effectively
3 and 16) carry no information at all. Four are genuinely good — 12, 14, 18, and
11 read like settings — and the pattern behind them is instructive: **they are
the ones whose `event` is a real episode rather than a book**. That is a
narrower, better-targeted use of Theographic than "fill every gap", and §7 files
it as the second slice rather than throwing the dataset away.

### 5.3 No model, and what would have to be true to change that

A model was considered for exactly one job — smoothing wording at build time —
and is **not recommended**, because the measured failure is missing information,
not awkward phrasing. Asked to improve "The text names God.", a model can only
do one of two things: return it unchanged, or add facts from its own training
about the passage. The second is fabrication with a Lantern byline on it, and R1
through R3 exist to make it impossible.

If that verdict is ever revisited, the bar is written down here so it cannot be
skipped:

- **Model:** `claude-haiku-4-5` at build time, temperature 0, run once per line
  and committed to the data file. Never at read time (R7).
- **Prompt, verbatim:** *"Rewrite this caption as one sentence of at most 12
  words describing only the setting of the passage: who speaks, who is
  addressed, where, or when. Use only the facts given below. Do not add any fact
  not listed. Do not say what the passage means, teaches, shows or fulfils. If
  the facts given are insufficient, reply exactly NONE."* followed by the
  structured fields and nothing else — **never the verse text**, which is the
  only way to keep the model from summarising the passage's content.
- **Spot-check plan:** every output mechanically rejected if it exceeds 12 words,
  contains an R3 verb, or contains a proper noun absent from its input fields
  (the fabrication check, and the one that matters); then a blind hand audit of
  100 lines by the same method as §6 here, with a ship bar of **zero**
  fabrications and ≤5% R1 failures; then a second blind 50-line audit of the
  *diff* against the template output, to prove the model earned its place.

---

## 6. The hand audit — 50 generated lines against the rules

Drawn seeded from destinations that reach a top-3 slot (the lines a reader
actually reads, rather than the tail behind "and N more"): 35 exactly as the
pipeline would ship them, plus 15 forced through the Theographic template so the
fallback generator is audited too. Reproduce the identical draw with
`node scripts/measure-setting-line.mjs` (seed 20260913).

**Result: 20 clean passes, 12 that pass only because of R5's frame, 18 failures.
All 50 are within the word cap (longest: 10 words).** Split by source, the
verdict is unambiguous:

| Source | Lines | Clean pass | Pass only when framed as a heading | Fail |
|---|---|---|---|---|
| BSB heading | 30 | 15 | 12 | **3 (10%)** |
| Theographic template | 20 | 5 (3 clear, 2 weak) | — | **15 (75%)** |

### 6.1 The three heading failures, shown

These are the ones that matter, because they are wrong *inside* the recommended
reach gate:

| # | Destination | Line | Reach | Why it fails |
|---|---|---|---|---|
| 33 | 1 Samuel 15:29 | "Saul's Confession" | 5 | **The speaker is wrong.** The verse is Samuel speaking (*"the Glory of Israel does not lie…"*); the heading names Saul's act five verses earlier. A reader scanning for "who is speaking" is actively misled. |
| 29 | Luke 5:16 | "The Leper's Prayer" | 4 | **Different episode.** The verse is *"Yet He frequently withdrew to the wilderness to pray"* — in the same section, about neither a leper nor his prayer. |
| 35 | Hebrews 13:14 | "Christ's Unchanging Nature" | 9 | **Off-topic and evaluative.** The verse is about not having a permanent city; the heading belongs to 13:8. Read in Lantern's voice it also states a doctrinal claim (R3). |

Proverbs 21:30 under *"The King's Heart"* — reach **29** — is the same failure at
its worst, and is the reason R6 exists: the gate excludes it.

**What the three failures do and do not justify.** They are not R1 violations
once R5's frame is applied: the verse *is* in the section titled "Saul's
Confession", so "in the section *Saul's Confession*" stays true even when the
heading misdescribes the verse. The frame converts a false claim into an
imprecise one — which is why the frame is a rule and not a design preference.
They do, however, put a **10% imprecision rate** on the shipped source, and that
is the number Dennis should be deciding against (§8, D1).

### 6.2 The framing-dependent twelve

"Imitators of God" (Eph 5:6), "Dead to Sin, Alive to God" (Rom 6:11), "Release
from the Law" (Rom 7:2), "Walking by the Spirit" (Gal 5:19), "Beware of
Antichrists" (1 John 2:18), "Put On the New Self" (Col 3:10), "Here Is My
Servant" (Isa 42:9), "Obey the LORD's Commands" (Deut 26:18), "The Day Is Near"
(Rom 13:12), "Guard the Faith" (1 Tim 6:20), "The Lord of the Harvest" (Matt
9:36), "Readiness at Any Hour" (Mark 13:32).

Every one is a proposition or an imperative. Printed bare under a reference, each
reads as Lantern telling the reader what the passage means — a straight R3
failure. Printed as *the heading this passage sits under*, each is a true
statement about the BSB's layout. **The whole feature's honesty rests on that one
presentational decision**, which is why R5 is a hard rule and why the design pass
must not "clean up" the line by dropping its label.

### 6.3 The fifteen template failures

Eleven are vacuous ("The text names God." ×6, "…names Jesus." ×2, "…names God
and Jesus." ×2, "…names Israel and God."); four name a book-scale event ("Part of
Prophecies of Isaiah" ×3, "Part of Prophecies of Jeremiah"). Two of the 20 also
exceeded the word cap before R4 dropped them ("Part of Creation of Adam and Eve;
the text names Adam and God." at 13 words).

The five that work are worth naming, because they define the second slice:
Exodus 20:3 *"Part of Ten Commandments Given."*, John 3:6 *"Part of Jesus and
Nicodemus; the text names Holy Spirit."*, Psalm 106:19 *"The text names Horeb."*,
1 Samuel 12:24 *"Part of Reign of Saul…"*, Luke 14:11 *"Part of Teaching and
Healing in Perea to Jerusalem."* — four of the five are carried by a
**right-sized event**, not by a name list.

---

## 7. Shape

### 7.1 The file

**Destination-keyed, not pair-keyed** (§1.2). The key is the same `BBCCCVVV`
`VerseKey` `src/utils/mapData.ts` already defines, so this file joins to the map
data and to any future per-verse index with no new key format:

```jsonc
// public/bible/setting-lines.json.gz
{
  "v": 1,
  "attribution": "Section headings: Berean Standard Bible (public domain). …",
  "lines": {
    "01015006": ["God’s Covenant with Abram", "h"],   // h = BSB section heading
    "19003001": ["A Psalm of David, when he fled from his son Absalom.", "s"],  // s = superscription
    "02020003": ["Part of Ten Commandments Given.", "t"]  // t = Theographic template
  }
}
```

The one-letter source code is what R5 renders as provenance, and it is per line
because the fallback chain means different lines come from different sources.

**Measured sizes** — built for real and gzipped by the script, not estimated:

| Variant | Entries | Raw | gzip -9 |
|---|---|---|---|
| **Slice 1: gated headings only** | **9,152** | 339.8 KB | **51.5 KB** |
| Full chain (heading → superscription → template) | 10,827 | 479.4 KB | 64.0 KB |
| A `(source, destination)`-keyed file, same content | 39,209 | — | — (3.6× the entries) |

51.5 KB gzipped is small enough that the interesting question is not size but
*when* it loads.

### 7.2 How it loads

**Lazily, on the first time a connections door opens, and then cached — not with
the chapter.** The reasoning follows the shipped code rather than taste:

- Connections themselves are **fetched per chapter from helloao at read time**
  (`src/bible/connections.ts`) and cached in IndexedDB by
  `connectionsCacheKey(book, chapter)`. There is no per-chapter connections
  *bundle* to attach 51.5 KB to.
- Only 5.8% of verses open a door at all, and a reader who never taps one should
  never pay for this file — the same discipline `self-hosted.ts` follows for
  `bsb.json.gz` ("fetched lazily, never on a successful read") and
  `build-map-data.mjs` for `terrain.png` (opt-in).
- It is one static asset from the app's own origin, so the fetch is the cheap
  part; the door's own verse previews already cost more round trips than this.

**Deliberately excluded from the PWA precache**, for the same reason
`public/bible/bsb.json.gz` is: precaching it would inflate every install for a
feature most sessions never touch.

### 7.3 Offline

Honest position, matching the one `self-hosted.ts` already takes: **once fetched,
the file is cached and works offline; a reader who has never opened a door and
then goes offline sees no setting lines.** That is acceptable because the door
itself is already offline-limited — it needs helloao for the connection list on
any chapter not already in the IndexedDB cache, so a setting line with no
connections to sit under would be pointless. The file is versioned (`v`) and
immutable per build, so cache invalidation is a filename change, not a
negotiation.

---

## 8. What needs Dennis

- **D1 — the imprecision rate.** The recommended source is wrong about the
  verse's own subject in **3 of 30 audited lines (10%)**, always as an
  imprecision rather than a falsehood once R5's frame is shown. Tightening R6 to
  `reach ≤ 4` roughly halves the exposure and costs 31.6 points of row coverage
  (83.3% → 51.7%). Ship at ≤10, or tighten? *Recommendation: ship at ≤10.* A
  labelled section heading that is vaguely right is a smaller sin than an empty
  row, and §5's concentration numbers make a targeted hand review cheap: the
  1,000 most-referenced destinations cover 34.8% of all rows (the top 100 cover
  6.7%), so a one-evening pass over the head of the distribution fixes the lines
  a reader is most likely to meet.
- **D2 — headings for non-BSB readers.** The KJV feed has no headings at all
  (verified live), and NET's are not ours to use (§3.6). Show the BSB heading to
  a KJV/NET/Tamil reader with its source named, or show nothing outside the BSB?
  *Recommendation: show it, labelled.* The heading describes the passage, not
  the wording, and R5 already names its source on every line.
- **D3 — the second slice.** Is the right-sized-event template (§6.3) worth
  building for the ~15% of rows a gated heading misses, given it needs a
  threshold on event span and a hand pass? *Recommendation: not yet* — revisit
  once D1's hand review has shown what the heading source actually feels like in
  use.

No part of this brief needs a decision before slice 1 can start; D1 and D2 are
the two questions the design pass must not answer silently.

---

## 9. The first buildable slice

**Slice 1 — the heading line, build-time, no UI beyond one row of text.**

What it is: a build script (`scripts/build-setting-lines.mjs`, following
`build-map-data.mjs`'s shape — pinned sources, derived artefact committed, source
data not) that emits `public/bible/setting-lines.json.gz` containing gated
heading lines and superscription lines; a loader beside
`src/utils/connectionsLoader.ts` that lazily fetches and caches it; and one line
of text under each connection row in `src/components/ConnectionsDoor.tsx`, with
its provenance label.

**Acceptance criteria**

1. `public/bible/setting-lines.json.gz` exists, is ≤ 80 KB gzipped, and contains
   a line for **≥ 80% of the connection rows** an opened door shows (measured by
   the same script: 83.3% today).
2. Every line in the file is **≤ 12 words** and contains **none** of R3's banned
   verbs — asserted by a unit test over the shipped file, not by review.
3. **No line is generated for a verse more than 10 verses below its heading**
   (R6), asserted the same way.
4. The line generator is pure and unit-tested in `src/utils/` (import-shared with
   the build script, the way `build-map-data.mjs` shares `src/utils/mapData.ts`),
   with cases for: heading in reach, heading out of reach, superscription with
   musical direction stripped, word-cap reject, banned-verb reject.
5. A connection row shows the line **only when one exists**, and always with its
   provenance label ("a note from Lantern · section heading, Berean Standard
   Bible"). A row without a line is visually unchanged from today.
6. The file is fetched lazily on first door open, cached, and **absent from the
   PWA precache** — asserted by a test that the service worker manifest does not
   list it.
7. `npx vitest run`, `npm run lint` and `npm run build` pass; `docs/BACKLOG.md`
   updated.

**Explicitly out of slice 1**

- **The map thread.** No place pins, no geography, no use of
  `public/map/places.json.gz` (§3.4).
- **The reverse direction.** Nothing about "who quotes this verse" — still the
  whole-corpus inversion `connections-door.md` §2.3 deferred.
- **Theographic and TIPNR entirely.** No new dataset, no new attribution
  obligation, no share-alike on a derived file until D3 says so.
- **Any model, at build time or read time** (§5.3).
- **Speaker/addressee as structured data.** No source measured here carries it;
  claiming it would need a dataset that does not yet exist in the open.

**Suggested backlog entry** (one line, added to `docs/BACKLOG.md` by this brief):
*The setting line under a cross-reference — see `docs/proposals/setting-line.md`,
slice 1: gated BSB heading lines, build-time, ~51 KB gzipped.*

---

## 10. Reproducing every number

```bash
node scripts/measure-setting-line.mjs          # everything in this brief
SEED=7 node scripts/measure-setting-line.mjs   # a different 50-line audit draw
NO_NETWORK=1 node scripts/measure-setting-line.mjs   # cache only, fails loudly if cold
```

First run downloads ~70 MB into `.cache/setting-line/` (7.8 MB BSB
`complete.json`, 36 MB Theographic `verses.json`, 7.7 MB TIPNR, ~20 MB of
cross-reference chapters) and takes about two minutes; re-runs are ~3 seconds and
need no network. Nothing is written into the repo, and `.gitignore` already
covers `.cache/`.

Which section each figure comes from:

| Figure | Report section |
|---|---|
| Door population, rows, distinct destinations (§2) | *The population a setting line has to cover* |
| Heading coverage, word lengths, reach curve (§3.1) | *1. BSB section headings* |
| Superscriptions (§3.2) | *2. Canonical Hebrew superscriptions* |
| Theographic fields, vacuity rates (§3.3) | *3. Theographic Bible Metadata* |
| Lantern places (§3.4) | *4. Lantern's own shipped place data* |
| TIPNR licence + lower-bound coverage (§3.5) | *5. STEPBible TIPNR* |
| Licences (§3.7) | *Licences (checked this run)* |
| File sizes (§7.1) | *Shape: the file, actually built and gzipped* |
| Hand-review concentration (§8, D1) | *How much a hand review would have to cover* |
| The 40 examples (§5.1, §5.2) | *20 real heading lines* / *20 real template lines* |
| The 50-line audit (§6) | *50 lines for the hand audit* |

Two guards worth knowing about, because they are what keeps this brief from
rotting:

- The script **reads `THRESHOLD` out of `src/utils/connections.ts`** and fails
  loudly if it cannot find it. Retune the shipped threshold and these numbers
  move with it rather than quietly describing a door that no longer exists.
- Licences are re-read **live** on every run (the cross-reference dataset's own
  metadata object, GitHub's API for Theographic, the TIPNR file header, the
  attribution string inside `places.json.gz`) — never restated from this
  document.
