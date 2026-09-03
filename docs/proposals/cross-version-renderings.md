# Showing the same phrase across BSB, KJV and NET — or rather, not the phrase

**Recommendation: build it at VERSE level, and never at phrase level.** Showing
the whole verse in the three translations Lantern holds is trivially correct,
costs one cached fetch, and answers the reader's actual question. Highlighting
*the corresponding phrase* inside those other verses cannot be done accurately
with anything we hold or could cheaply build, and the measurement below says the
best cheap approach lands on words the note has no opinion about often enough to
teach a reader something false. So the phrase comparison is not deferred for
effort reasons — it is **declined on evidence**.

The one-line version: *we can honestly show a reader three whole verses. We
cannot honestly point at a word inside two of them.*

There is a narrow, honest middle path, and it ships: when the BSB translators'
own alternative wording **literally appears** in the KJV or NET verse, we can say
so, because that is a string the reader can check with their own eyes rather than
an alignment we computed. Measured, that is **27.6%** of notes — real, and a
minority, which is exactly why it cannot be the feature's headline.

Status: **design + data brief, not yet spec'd.** Written 2026-09-02. Rung-two
material alongside `docs/proposals/word-door-guardrails.md`; it consumes the
footnotes door (`docs/proposals/footnotes-door.md`, slice 1 + 2 shipped
2026-09-01) as its trigger and adds nothing to it. Every figure below is measured
on real data — the committed bundles and the live helloao API, on 2026-09-02.
§10 says how to re-run each one. Anything not measured is labelled **unverified**.

**Build status, 2026-09-03: `CrossVersionPanel.tsx`, `verbatimMatch.ts` and the
`FootnoteDoor.tsx` trigger are built** (verse-level, N1-N8 respected as
specified, the §5.1.3 verbatim mark included). Two things are parked rather than
finished — see `docs/BACKLOG.md`'s entry and this task's escalation for the full
findings: (1) the door needs a chapter reference threaded from `ReadingMode.tsx`/
`BookDetailPage.tsx`, neither in the building task's scope, so it is not yet
opened from either reading surface; (2) the panel is shipped as its own portalled
sheet at every width (a real answer to §9.1, not yet reviewed by Dennis), because
building both a popover AND a sheet variant without being able to visually verify
either was not a good use of the same constrained pass.

---

## 1. The stance

1. **The verse is the unit we can defend.** Verse boundaries are shared data;
   phrase boundaries across translations are not. We show what we hold, at the
   granularity we hold it.
2. **We never compute a correspondence and draw it on scripture.** A highlight is
   a claim ("*this* is the KJV's version of *that*"). We are not in a position to
   make that claim, and a wrong one is invisible to the reader who most needs it
   to be right.
3. **A string match is a fact; an alignment is an inference.** Where the note's
   own alternative wording appears verbatim in another translation's verse, that
   is reportable. Where it does not, we say nothing rather than approximate.
4. **Three renderings side by side, in canonical order, with nothing said about
   them.** No ranking, no "closer to the Greek", no gloss on the difference. The
   range is the content; the comparison is the reader's to make.

---

## 2. The hard question, first: can phrases be aligned?

### 2.1 What we actually hold

- A BSB footnote's marker gives **a character offset into the BSB text only**
  (`src/bible/provider.ts`, `VerseNote.offset`), and even that is the phrase's
  *end* — the start is inferred by `src/utils/footnoteSpan.ts`, which is itself
  a measured approximation (footnotes-door §10b).
- The KJV and NET bundles (`public/bible/{kjv,net}.json.gz`) are **flat verse
  text**: `{ book: { chapter: [[verse, text], …] } }`. No word tagging, no
  Strong's numbers, no morphology, nothing that says which English word renders
  which original word.
- The BSB Translation Tables give per-word Strong's alignment **for the BSB
  alone** (word-door §3). There is no equivalent table for KJV or NET in our
  data, and the word-door brief already settled that the door is structurally
  BSB-only for exactly this reason (word-door §9a, "The translation question").

**What real phrase alignment would require**, in ascending order of cost: a
Strong's-tagged edition of each target translation (exists for KJV in
circulation, does not exist for NET), joined lemma-by-lemma to the BSB tables;
or a statistical word-alignment model (IBM/fast_align-class) trained over a
parallel corpus of the two translations, which is a research project, a new
dependency, and a build-time artefact of its own. Neither is in scope for a rung,
and the second one would still be a probabilistic guess rendered as a definite
underline.

So the only candidates that fit inside a rung are **cheap positional heuristics**,
and the honest thing is to measure them rather than assert they work.

### 2.2 The upper bound, before any heuristic runs

If the words a heuristic could match are not in the other verse at all, no
alignment exists to find. Measured over the whole ship set — 2,099
alternate-rendering notes, of which 2,075 have an underlined phrase containing at
least one content word:

| Of the BSB phrase we underline… | KJV | NET |
|---|---:|---:|
| **every** content word also appears in the same verse | **624 · 30.1%** | **920 · 44.3%** |
| at least one content word does | 1,184 · 57.1% | 1,407 · 67.8% |

(Content word = not in a 49-item stop list; matching is stem-relaxed, so
"comprehend"/"comprehended" counts.)

**For roughly seven doors in ten, the KJV simply does not contain the words the
BSB phrase is made of.** That is the ceiling on any exact-match alignment, and it
is not a tuning problem — it is what "a different translation" means.

### 2.3 The measurement: two cheap aligners against real ground truth

The problem with grading an aligner is that we have no gold alignment. So we
borrowed one from the data: **for the 390 notes whose alternative wording appears
verbatim in the KJV verse, the KJV's own words tell us where the corresponding
phrase is.** John 1:5 is the archetype — the BSB underlines "overcome", the note
says "Or comprehended", and the KJV reads "the darkness comprehended it not", so
the true target span is known without a human labelling it.

Two aligners were run on that set, each mapping the BSB span's word-index range
into the KJV verse:

- **Proportional** — map word indices by ratio of verse lengths.
- **LCS-anchored** — take the longest common subsequence of stemmed tokens as
  anchor pairs and interpolate between them. This is the best cheap approach: it
  is what a `difflib`-style matcher does, it uses shared vocabulary where it
  exists, and it needs no model and no new data.

| Aligner (n = 390 gold cases) | exact span | any overlap with the true span |
|---|---:|---:|
| Proportional | 99 · **25.4%** | 214 · **54.9%** |
| **LCS-anchored** | 168 · **43.1%** | 281 · **72.1%** |

**Read that carefully, because the sample is the easy end of the distribution.**
These are the verses where the two translations demonstrably share the exact
wording in question — the friendliest possible case for a lexical aligner. Even
there, the best cheap approach puts the underline entirely in the wrong place
**28% of the time**, and gets the phrase exactly right fewer than half the time.
(7.2% of the gold cases are themselves ambiguous — the alternative occurs more
than once in the KJV verse — so a couple of points of that failure is the ground
truth's fault, not the aligner's. It does not change the verdict.)

### 2.4 The hand audit, on what a reader would actually see

Aggregate overlap scores understate how bad a wrong underline looks. So 30 notes
were drawn from the **whole** ship set (not the gold subset) with the same seeded
LCG the footnotes brief used (`s = (s*1103515245 + 12345) mod 2^31`, seed `777`),
the LCS-anchored aligner was run, and the resulting KJV spans were read.

| Verdict, n = 30 | count |
|---|---:|
| Lands cleanly on the corresponding words | **19** |
| Right region, but overruns onto words the note has no opinion about | **7** |
| Plainly wrong | **4** |

The four plainly wrong, in full, because they are the argument:

| Ref | Note | BSB underlines | Aligner underlines in KJV | KJV actually reads |
|---|---|---|---|---|
| Hosea 2:16 | "Hebrew *my Baal*" | "my Master" | "**no more**" | "shalt call me no more Baali" |
| 2 Chr 26:15 | "Or *to protect those who shoot*" | "skillfully designed devices to shoot" | **14 words**, "engines invented by cunning men … to shoot" | — |
| Acts 7:54 | "Literally *On hearing these things, they were cut in their hearts,*" | "enraged" | "**the**" | "they were cut to the heart" |
| 1 Peter 1:1 | "Literally *To the elect sojourners of the Diaspora…*" | "chosen" | "**Bithynia**" | "elect according to the foreknowledge" |

An underline on "the" is embarrassing. An underline on "Bithynia" for a note
about *elect* is worse than embarrassing — it is a confident, legible, wrong
claim about what the KJV translators did.

**The bar this fails is the project's own.** The footnotes door shipped strategy
B because a hand audit found "no embarrassing span" (footnotes-door §10b). The
cross-version equivalent produces one in roughly every seven doors. Same method,
same adjudicator, opposite answer.

### 2.5 Verdict

**Phrase-level alignment is not achievable here and is not worth the build.**
Not "not yet" — the missing ingredient is per-word tagging for KJV and NET, which
for NET does not exist and cannot be licensed (the licence grants text only, §6),
and for KJV would be its own source, its own ETL and its own audit for a feature
whose verse-level version is already correct and already free.

---

## 3. Why verse level is the honest granularity — and it is structurally safe

Verse level is not the consolation prize. It is the granularity the data
actually shares, and three facts make it a good feature rather than a fallback.

**1. The verse ids line up almost perfectly.** Counted across all three
committed bundles:

| | verses |
|---|---:|
| BSB | 31,086 |
| KJV | 31,102 |
| NET | 31,085 |
| **verse ids present in all three** | **31,085** |
| present in only one or two | 17 |

Sixteen of the seventeen are KJV-only New Testament verses — Matthew 17:21,
18:11, 23:14; Mark 7:16, 9:44, 9:46, 11:26, 15:28; Luke 17:36, 23:17; John 5:4;
Acts 8:37, 15:34, 24:7, 28:29; Romans 16:24. The seventeenth is 2 Corinthians
13:14, present in BSB and KJV, absent from NET's numbering. **These are exactly
the textual-variant verses**, and they are a philosophy hazard, not a data bug —
see §5's rule 6.

**2. The three renderings genuinely differ, so the comparison carries
information.** Using the word-level sequence similarity of
`docs/audits/translation-divergence-2026-09-01.md` (word-level Levenshtein,
normalised 0–1, its 0.6 "breaks following" threshold):

| Pair | verses | mean similarity | below 0.6 | at or above 0.9 |
|---|---:|---:|---:|---:|
| BSB ↔ KJV | 31,085 | 0.453 | 79.3% | 1.0% |
| BSB ↔ NET | 31,085 | 0.561 | 56.2% | 5.4% |
| KJV ↔ NET | 31,085 | 0.406 | 85.3% | 0.5% |

On the 1,995 footnoted verses specifically — the ones a door would open on — the
divergence is *higher* than the Bible-wide average (BSB↔KJV mean 0.438, 83.7%
below 0.6; BSB↔NET 0.533, 62.0%). Translators footnote the hard places, and the
hard places are where translations part company. **A reader who opens this panel
will nearly always see three visibly different sentences**, which is the whole
point.

That same table is the second, independent argument against phrase alignment:
the audit's finding that word *order* diverges heavily is what makes positional
heuristics fail, and it holds a fortiori for the verses this feature triggers on.

**3. It costs almost nothing.** KJV and NET already have providers
(`src/bible/service.ts`), a cache-forever IndexedDB layer, and committed
self-hosted bundles. A chapter of KJV or NET from helloao measures **9,779 and
9,862 bytes** (John 1, fetched 2026-09-02), against the BSB's 12,217 — and it is
fetched once per chapter, ever. Verse lengths (median / p90 characters: BSB
115/195, KJV 123/211, NET 118/204) put a three-up panel at roughly 350 characters
in the typical case and ~600 at p90, which is a card, not a page.

---

## 4. Does the motivating example generalise?

John 1:5 is real and it is checkable: BSB "the darkness has not **overcome** it",
note "Or *comprehended*", KJV "the darkness **comprehended** it not". The note's
alternative is not a hypothetical — it is another translation's actual wording.

**How often does that hold?** Over all 2,099 ship-set notes, of which 2,012
(95.9%) offer a measurable alternative phrase (extracted with
`footnoteSpan.ts`'s own rules), asking whether that alternative appears as a
verbatim token sequence in the same verse of each translation:

| | notes | share |
|---|---:|---:|
| Alternative appears in **KJV** | 390 | **19.4%** |
| Alternative appears in **NET** | 308 | **15.3%** |
| **In KJV or NET** | **556** | **27.6%** |
| In both | 142 | 7.1% |
| *Control: appears in a decoy verse (same book, ±10 verses)* | *22* | *1.1%* |

The control matters: at 1.1% for an unrelated verse against 19.4% for the right
one, this is a real signal and not string-matching noise. Relaxing the match to
stemmed tokens moves it barely at all (28.1% either), which says the hits are
whole-word agreements, not morphological near-misses.

It is strongest exactly where the note is shortest and sharpest:

| Alternative length | notes | matched in KJV or NET |
|---|---:|---:|
| 1 word | 481 | **44.3%** |
| 2 words | 414 | 39.1% |
| 3 words | 307 | 27.7% |
| 4 words | 234 | 16.2% |
| 5 words | 194 | 10.8% |
| 6+ words | 382 | 9.7% |

| Note lead | notes with an alternative | matched in KJV or NET |
|---|---:|---:|
| "Or …" | 1,286 | 26.1% |
| "Literally …" | 354 | 31.6% |
| "Hebrew …" | 304 | 32.6% |
| "Greek …" | 41 | 7.3% |

And the John 1:5 shape specifically — an "Or …" note offering one or two words —
is **571 notes, 39.4% of which the KJV or NET actually uses**.

**The honest reading.** Roughly one door in four is a direct hit, and about two
in five for the crispest kind of note. That is a good feature and a bad headline.
It means the panel must be framed as *here are the three translations at this
verse*, never as *here is what the others say instead* — because three times in
four, they do not say the note's alternative, and a UI that promises otherwise is
wrong most of the time it is opened.

---

## 5. What ships, and what the UI must never do

### 5.1 What ships

**A "in three translations" panel, opened deliberately, inside a door.**

1. **Trigger.** From the footnotes door's open state (rung 1 shipped the
   underline, the popover and the note), and from the deep dive's doorway list.
   **Not** an always-on control on the reading page, and **not** a per-verse
   affordance — calm scripture is the constraint the footnotes door already
   protects (footnotes-door §5.1), and a second permanent mark in the same
   costume was rejected once already (word-door §9a decision 3).
2. **Content.** The verse, whole, in BSB, KJV and NET, in that fixed order, each
   labelled, each carrying its existing attribution treatment
   (`TranslationFooter`'s `FinePrint` already renders the NET notice and the
   "(NET)" link; KJV and BSB need none). No commentary between them, no
   difference summary, no count of how many words differ.
3. **The confirmation line, where the data supports it.** When the note's
   alternative appears **exactly once** in a translation's verse, mark that
   wording in that verse and label it as what it is: *the wording the BSB
   translators offered, as it stands in the KJV*. Measured coverage of the
   unique-match rule: **362 notes (18.0%) in KJV, 292 (14.5%) in NET, 529
   (26.3%) in at least one**. The 33 notes (1.6%) whose alternative occurs more
   than once get no mark — a repeated word gives us no way to say which
   occurrence is meant, and that is an alignment question again.
   *This is a string match on the translators' own words, never a computed
   correspondence, and the reader can verify it by reading the verse.*
4. **Degradation.** If a translation's chapter is unavailable (offline, and the
   bundle not yet fetched), that column is **absent**, not empty or spinning, and
   the panel still works with two. The bundles are lazy by design
   (`self-hosted.ts`) and this feature must not become a reason to eagerly fetch
   2.5 MB of KJV + NET on a reading path.

### 5.2 What it must never do

Each of these is a rule with a failure mode behind it, in the shape the other two
briefs use.

- **N1 — Never draw a computed highlight in another translation's verse.** §2 is
  the whole reason. If a future contributor "improves" the panel by underlining
  the corresponding phrase, they have shipped the 1-in-7 wrong claim this brief
  declined.
- **N2 — Never render rung 1's underline inside the panel.** This is the subtle
  one, and it is why §7 names it the riskiest part: if the BSB verse in the panel
  carries its dotted underline while the KJV verse sits beneath it, the eye
  completes the alignment for us and the reader believes we pointed at something.
  The panel shows plain text in all three columns.
- **N3 — Never rank, grade, or characterise the difference.** No "more literal",
  "closer to the Greek", "modern equivalent", no ordering by anything but canon
  convention. Ranking is the mechanism by which "a range of defensible choices"
  becomes "we think this one is right", which is the line
  `docs/ROADMAP.md`'s philosophy statement draws.
- **N4 — Never present the note's alternative as what another translation says
  when it does not appear there.** True for 27.6% of notes; silence for the rest.
- **N5 — Never auto-open.** Observe-before-consult, the same rule as
  footnotes-door §1.3. A comparison that opens itself has compared for the reader
  before they have read.
- **N6 — Never show a verse that exists in one translation and not another.**
  The 17 verses of §3 are precisely the textual-variant material the footnotes
  door deliberately withholds (footnotes-door §6). Rendering "KJV: *For then must
  he needs have suffered…*" beside an empty BSB row asserts a claim about textual
  transmission that we have decided not to author, in the one place we forgot to
  look for it. Where a verse is missing from a translation, that column is
  **omitted with no marker and no note** — the same "withheld means genuinely
  absent" rule the seam already implements.
- **N7 — Never read another translation's footnote apparatus.** Structural, and
  already enforced: helloao's `eng_net` leaks 39 "Translator's Note" footnotes
  the NET licence does not grant us (footnotes-door §8), and the KJV's 6,959
  notes are a different format needing their own parser and audit. This feature
  uses **text only** from KJV and NET, which is exactly what both licences give
  us.
- **N8 — Never call it "the same phrase".** Including in the copy, the doorway
  label and the commit messages. It is the same *verse*. The title of this brief
  is a question, and the answer was no.

### 5.3 Copy

One label and one line, in the shape §7 of the word-door brief settled on —
descriptive, permanent, not a warning:

> **This verse in three translations**
> BSB · KJV · NET — the three Lantern carries in full. Translators differ; the
> differences are theirs, not ours.

Copy is Dennis's call; the *shape* — a statement of what is on screen, with no
instruction about how to read it — is this brief's decision.

---

## 6. ESV is out, with the licensing in hand

`docs/proposals/translations-esv-niv.md` §1 (checked 2026-07-22) records
Crossway's terms, and they decide this without needing a new opinion:

| Term | Value | Consequence for a comparison panel |
|---|---|---|
| Rate limit | **5,000 queries/day, 1,000/hour, 60/minute — per application**, shared across every Lantern user | A panel on a door that opens on 1,995 verses would spend the *whole app's* daily quota on ~5,000 chapter opens, across all users combined |
| Local storage | **500 verses, or half a book, whichever is smaller** | At a measured mean of 26.1 verses per chapter (1,189 chapters, median 24), the store holds **~19 chapters**. `esv-cache.ts` enforces exactly this (`MAX_CACHED_VERSES = 500`) with LRU eviction — a reader working through a book re-fetches constantly |
| Footnotes | `'include-footnotes': 'false'` at `supabase/functions/esv-proxy/handler.ts:91` | No ESV note has ever reached Lantern by construction, and footnotes-door §8 says leave it that way |
| Offline | Impossible — online-only proxy path | The panel would be present or absent depending on the network, for one column only |

Against that, **BSB, KJV and NET are self-hosted, free at any scale, offline-
capable and already fetched**. Adding ESV would make the app's calmest new
surface its most quota-fragile one, and would reproduce the "doors quietly
disappear" degradation the word-door brief flagged as a strategic problem
(word-door §9a).

**ESV stays out. NIV is not even a candidate** — Lantern has no NIV source at
all, and `translations-esv-niv.md`'s standing verdict is "do not build now".
Nothing in this brief re-opens either.

*(Unverified, and not load-bearing: whether Crossway would regard a three-up
comparison as a "quotation" use at all. We do not need the answer, because the
quota arithmetic already decides it.)*

---

## 7. Where this lives, effort, and the riskiest part

### 7.1 Placement

**Rung two, alongside the word door — not an addition to the footnotes door.**
The footnotes door (rung 1) shipped 2026-09-01 and is complete as specified: it
shows the translators' note verbatim and stops. This is a *second* door, opening
on a different question, and folding it into rung 1 would retroactively widen a
rung that is already done.

How the three relate:

| | Needs | Provides |
|---|---|---|
| **Footnotes door** (rung 1, shipped) | helloao's `footnotes` + marker offsets | The ship set (2,099 notes, 1,995 verses), `classifyFootnote`, `footnoteSpan` |
| **Word door** (rung 2) | BSB Translation Tables ETL, STEPBible lexicons, ~4 MB of new bundles | Per-word Strong's, morphology, occurrences |
| **This** (rung 2) | The ship set + existing KJV/NET providers. **No new data, no new ETL, no new dependency** | A second, cheap doorway on the same 1,995 verses |

**Blocking, stated plainly: rung 1 blocks this** (it is the trigger and the
source of the note text). **The word door does not block this, and this does not
block the word door** — they share no data and no code beyond the ship set both
already consume. This is the cheapest thing in rung two by a wide margin, and it
is a reasonable candidate to ship *before* the word door precisely because it
needs nothing built.

### 7.2 Effort

Ideal focused sessions, for one person who knows this codebase, on the same scale
the other two briefs use:

| Piece | Effort | Notes |
|---|---:|---|
| Fetch + present two extra chapters behind the door (providers exist) | **0.5** | `service.ts` already exposes KJV and NET; this is composition, not plumbing |
| The panel, desktop + mobile | **1.5** | Three verses, fixed order, attribution line. Mobile is the constraint |
| The unique-match confirmation mark (§5.1.3) + its tests | **0.5** | Pure function over two strings; test the marked substring, never the index |
| Versification guard (N6) + missing-column degradation | **0.25** | 17 known verses, and offline |
| Copy, provenance, and a test that rung 1's underline is absent (N2) | **0.25** | |
| **Total** | **~3** | |

### 7.3 The single riskiest part

**Not the code — the layout.** Every rule in §5.2 except N2 fails loudly if
broken. N2 fails silently and beautifully, in exactly the way footnotes-door §9
describes its offset bug: put the BSB verse in the panel with its dotted
underline still on, and the reader's eye draws the alignment we refused to
compute. Nothing throws, no test fails, and the reader walks away believing
Lantern pointed at the KJV's corresponding phrase. The mitigation is a test that
asserts the panel renders no note markup at all, plus this paragraph, so the
next person to touch it knows the underline's absence is load-bearing rather than
an oversight.

Second-riskiest is scope drift back into §2: the phrase highlight is the obvious
"improvement" for anyone who has not read the measurement. That is why the
numbers are in this document rather than in a commit message.

---

## 8. Suggested backlog entry

Pasteable into `docs/BACKLOG.md` under **Deferred**, by a human, once this brief
is accepted. **This brief does not edit that file** (out of scope for the task
that produced it).

```markdown
- **This verse in three translations (deep-dive rung 2).** Design brief in
  `docs/proposals/cross-version-renderings.md`. From an open footnotes door,
  show the whole verse in BSB, KJV and NET — the three Lantern holds in full,
  offline and free — in fixed order, with no commentary and no ranking. Where
  the note's own alternative appears exactly once in another translation's
  verse, mark that wording as the translators' words standing in that text
  (measured: 529 of 2,012 notes, 26.3%). **Phrase-level highlighting is
  DECLINED on evidence, not deferred**: a BSB footnote anchors into BSB text
  only and no cross-translation word alignment exists in our data, so the best
  cheap aligner (LCS-anchored) was measured against real ground truth and gets
  the span exactly right 43.1% of the time and misses entirely 28% — on the
  easiest subset available — with 4 of 30 hand-checked spans plainly wrong
  ("the", "Bithynia"). Verse level is trivially correct instead: 31,085 verse
  ids are common to all three bundles, the 17 exceptions are the KJV-only
  variant verses and must be omitted silently (they are the textual-variant
  material rung 1 withholds). Needs no new data, no ETL and no dependency —
  KJV/NET providers, caches and bundles already exist; a chapter costs ~10 KB
  once. ESV is excluded on its own terms: 5,000 queries/day shared across all
  users and a 500-verse (~19-chapter) storage cap. ~3 sessions. Riskiest part
  is the layout, not the code: if rung 1's dotted underline renders inside the
  panel, the reader's eye completes the alignment we refused to compute.
```

---

## 9. What still needs a pass with Dennis

This brief decides the granularity, the rules and the placement. It decides no
visual design.

1. **Whether the panel is a third state of the footnote popover or its own
   sheet**, and how that reads on a phone where the popover is already
   competing with verse selection (footnotes-door §5.4).
2. **Whether the confirmation mark (§5.1.3) is worth its complexity at 26.3%
   coverage**, or whether the three plain verses alone are the cleaner product.
   The measurement supports either; the taste call is Dennis's.
3. **Whether a reader can reach this panel from a verse with no footnote.** The
   data supports it — any verse can be shown three ways — but it would need its
   own affordance, and calm scripture says no by default.
4. **The exact copy** (§5.3). The shape is decided; the words are not.
5. **Whether NET or KJV comes second**, which is a taste question about whether
   the reader's second column should be the familiar one or the modern one.

---

## 10. How to re-run every number here

No script was added to the repo — this is a doc-only change. All figures were
computed on 2026-09-02 on the HQ runner (Node 22), from throwaway scripts in
`/tmp`, against **the code this repo actually ships** rather than a
reimplementation:

1. `curl -sL https://bible.helloao.org/api/BSB/complete.json` (7,432,810 bytes,
   HTTP 200, fetched 2026-09-02).
2. Bundle the shipped logic for use from plain Node —
   `npx esbuild entry.ts --bundle --format=cjs --platform=node`, where `entry.ts`
   re-exports `classifyFootnote`/`footnoteShips` (`src/utils/footnotes.ts`),
   `footnoteSpan`/`footnoteSpans`/`alternativeWordCount`
   (`src/utils/footnoteSpan.ts`) and `flattenVerseContent`
   (`src/bible/helloao.ts`). esbuild is already present via Vite; nothing is
   installed and nothing is committed.
3. Rebuild the ship set exactly as `helloao.ts`'s `verseNotesFor` does (drop
   `reference.verse === 0`, drop non-`rendering` classes, drop anchors that are
   not a prefix of the flattened verse), then `footnoteSpans` for the underline.
   **This reproduced the footnotes brief's figures to the note**: 4,853 footnotes
   → 2,099 ship-set notes across 1,995 verses, 1,832 strategy B / 267 strategy A.
   That agreement is the check that the measurement harness is reading the same
   corpus the app does.
4. KJV/NET/BSB verse text from the committed bundles
   (`public/bible/{bsb,kjv,net}.json.gz`, gunzip → `{ book: { chapter: [[verse,
   text], …] } }`). No network, no new dependency.
5. The alternative a note offers is extracted with `footnoteSpan.ts`'s own
   regexes (`ALTERNATIVE_LEAD`, `ALTERNATIVE_TAIL`, `OFFERED_TAIL`), so §4's
   figures describe the same phrase the shipped underline is sized from.
6. Similarity is the audit's metric: lowercase word tokens, word-level
   Levenshtein, normalised by the longer sequence, 0.6 threshold
   (`docs/audits/translation-divergence-2026-09-01.md`, "What breaks following").
7. The aligners: proportional word-index mapping, and LCS over stemmed tokens
   with linear interpolation between anchor pairs. Ground truth = the 390 notes
   whose alternative appears verbatim in the KJV verse.
8. The hand audit sample is reproducible: LCG `s = (s*1103515245 + 12345) mod
   2^31`, seed `777`, Fisher–Yates over the flattened ship set, first 30 with a
   KJV verse present. Labels are recorded in §2.4, by one adjudicator.

**Stated plainly, so nothing here is overclaimed:** §2.4's 30 labels are one
person's judgement on a small sample, and they are the *supporting* evidence.
The load-bearing numbers are §2.2's coverage ceiling and §2.3's aligner scores,
both of which are computed over the whole ship set or the whole gold set with no
human in the loop.

---

## 11. Sources

| Claim | Source |
|---|---|
| Ship set: 2,099 rendering notes, 1,995 verses, 1,832 B / 267 A | measured 2026-09-02 with the shipped `footnotes.ts` + `footnoteSpan.ts` over live `complete.json`; matches `docs/proposals/footnotes-door.md` §4, §10b |
| BSB footnote anchors into BSB text only; offset is the phrase's END | `src/bible/provider.ts` (`VerseNote.offset`), `src/bible/helloao.ts` (`verseNotesFor`) |
| No cross-translation word alignment in our data; word door is structurally BSB-only | `docs/proposals/word-door-guardrails.md` §3, §9a |
| Word-order divergence is what breaks positional heuristics | `docs/audits/translation-divergence-2026-09-01.md` |
| ESV: 5,000/day per application, 500-verse storage cap, attribution required | `docs/proposals/translations-esv-niv.md` §1 (checked 2026-07-22); enforced in `src/bible/esv-cache.ts` (`MAX_CACHED_VERSES = 500`) |
| ESV footnotes are off by construction | `supabase/functions/esv-proxy/handler.ts:91` |
| NET licence covers text only; helloao's `eng_net` leaks 39 excluded notes | `docs/proposals/footnotes-door.md` §8; `scripts/build-net-bundle.mjs`; `src/bible/net-self-hosted.ts` |
| KJV public domain (US), apparatus is a different format needing its own parser | `docs/proposals/translations-esv-niv.md` §1; `docs/proposals/footnotes-door.md` §3.6, §8 |
| BSB public domain from 2023-04-30 | [berean.bible/licensing.htm](https://berean.bible/licensing.htm), via word-door §4.1 (checked 2026-08-30) |
| Chapter fetch sizes 12,217 / 9,779 / 9,862 bytes (John 1) | `bible.helloao.org/api/{BSB,eng_kjv,eng_net}/JHN/1.json`, fetched 2026-09-02 |
| Attribution already rendered for NET and the Tamil texts | `src/components/TranslationFooter.tsx` (`FinePrint`) |

**Unverified / to confirm:**

- Whether Crossway would treat a three-up comparison as a permitted "quotation"
  use. Not load-bearing — §6 declines ESV on quota and storage arithmetic alone.
- The NET terms are carried from `translations-esv-niv.md`'s 2026-07-22
  verification and were **not** re-verified here (`netbible.com/copyright/`
  returned HTTP 403 from this runner on 2026-08-31, per footnotes-door §8). This
  brief relies only on the text grant, which is the same basis
  `build-net-bundle.mjs` already ships on.
- Whether a Strong's-tagged KJV edition exists under a licence Lantern could
  use. Asserted in word-door §9a as "in circulation" and **not checked here**; it
  is the only route by which §2's verdict could change, and it would still not
  give NET.
- §2.4's 30 hand labels are one adjudicator's, as stated in §10.
