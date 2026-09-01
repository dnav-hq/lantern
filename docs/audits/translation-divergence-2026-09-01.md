# Can you follow an ESV reader while looking at BSB? — 2026-09-01

Lantern can only ship three translations offline and permanently: BSB, KJV and
NET. The two people actually hear read aloud in church and small group — ESV
and NIV — cannot be licensed for offline use at any price a solo developer
would pay. The open worry has always been guessed at, not measured: if you're
sitting in a study following along on your phone in BSB while the group reads
ESV aloud, can you actually keep up? This measures that on a sample, rather
than guessing.

**The headline: yes, mostly, and BSB is the right default of the three we
have.** About 7 in 10 sampled verses track closely enough by ear to follow
without effort. The other 3 in 10 will make you glance up to find your place —
worst in the Psalms and in short, idiomatic one-liners, not in narrative or
argument. KJV is meaningfully worse than either BSB or NET for this specific
purpose, for a reason that has nothing to do with translation philosophy and
everything to do with archaic pronouns and verb endings sounding nothing like
what's being read aloud. NIV could not be measured at all — see below.

---

## How this was run

- **Sample: 20 chapters, 571 verses**, hand-picked as passages that actually
  get studied in groups rather than a random or exhaustive sweep (Dennis
  explicitly asked for a rough read, not a whole-Bible job). The list spans
  every register a group study tends to hit — OT law, OT narrative, OT poetry,
  OT prophecy, Gospel teaching, Gospel narrative, epistle argument, epistle
  exhortation — so the result isn't just "how well BSB matches ESV in
  epistles":

  Genesis 1, Exodus 20, Psalm 23, Psalm 51, Proverbs 31, Isaiah 53, Matthew 5,
  Matthew 6, Luke 15, John 1, John 3, John 15, Acts 2, Romans 8, Romans 12,
  1 Corinthians 13, Galatians 5, Ephesians 2, Philippians 4, James 1.

- **ESV text came from Lantern's own live esv-proxy** (`supabase/functions/esv-proxy`,
  the same function `EsvBibleProvider` calls), using the app's public anon key
  the same way the deployed client does. **20 API calls total** — one GET per
  chapter, well inside Crossway's 5,000/day shared quota. No retries were
  needed. ESV text was held in process memory only, for the length of this
  run, and printed here only as aggregate statistics and a handful of
  six-word fragments (see "Worst cases" below) — nothing resembling bulk ESV
  text exists in this file, in a fixture, or anywhere else in this repo or its
  history.
- BSB, KJV and NET text came from the bundles already committed for the
  self-hosted fallback (`public/bible/{bsb,kjv,net}.json.gz`) — no extra
  network calls, no new dependency, nothing added to the app.
- The comparison script was a throwaway Node file, run from `/tmp`, never
  committed.

## What "breaks following" means, and the threshold

Textual similarity in the abstract (edit distance on the whole verse) isn't
the right question — the right question is whether someone tracking a verse
*by ear*, verse by verse, keeps their place. So the metric here is **word-level
sequence similarity**: each verse pair is tokenized into lowercase words and
compared with a word-level Levenshtein distance, normalized to a 0–1 score
(1.0 = identical word sequence, 0.0 = nothing in common). This rewards both
matching vocabulary *and* matching word order, which matters for tracking
speech — a verse that uses all the same words in a different clause order
still makes you lose your place exactly as much as one that uses different
words.

**Threshold: a verse below 0.6 similarity is counted as "breaks following."**
Below that line, less than 60% of the word sequence lines up, which in
practice means the listener has no run of 4-5 consecutive matching words to
anchor on mid-verse — they either wait for the next verse number or actively
search the sentence. This is a judgment call, not a physical constant (this is
a rough measurement, as asked for), but it's a stable one: moving it to 0.55 or
0.65 shifts the percentages below by only a few points and never changes the
ranking between BSB, KJV and NET.

## Results

| Translation | Verses compared | Mean similarity to ESV | % of verses that break following (< 0.6) |
|---|---:|---:|---:|
| **BSB** | 571 | **0.694** | **29.1%** |
| NET | 571 | 0.668 | 32.6% |
| KJV | 571 | 0.608 | 47.1% |

Distribution (bucketed by similarity band, out of 571 verses each):

| Translation | 1.0–0.9 | 0.9–0.8 | 0.8–0.6 | 0.6–0.4 | < 0.4 |
|---|---:|---:|---:|---:|---:|
| BSB | 107 | 85 | 213 | 122 | 44 |
| NET | 69 | 91 | 225 | 128 | 58 |
| KJV | 38 | 66 | 198 | 195 | 74 |

BSB has the fattest "1.0–0.9" band (near-verbatim tracking) of the three and
the thinnest "< 0.4" band (total mismatch). NET is close behind on the mean
but has more verses in the worst band than BSB does. KJV is clearly the
outlier — not marginally worse, categorically worse: it has almost twice
BSB's rate of verses a listener would lose entirely.

### Why KJV underperforms specifically

It isn't that the KJV's translation choices diverge more in meaning — it's
"thou/thee/thy/ye/shalt/hast/doth" replacing "you/your/will/have/does" on
nearly every verse with a second-person address, plus older word order
("Behold, thou desirest..." vs "Behold, you delight in..."). Every one of
those is a full word mismatch under this metric, and, more importantly, would
actually sound different read aloud in the room. This is the Ten
Commandments and the Psalms hitting KJV hardest in the sample — passages a
group is very likely to study.

### Worst cases (fragments only, no bulk ESV text)

A handful of the lowest-similarity verses per translation, trimmed to about
six words a side — illustration, not a systematic list:

**BSB**
- Exodus 20:23 — ESV: *"You shall not make gods of…"* / BSB: *"You are not to make any…"*
- Matthew 5:37 — ESV: *"Let what you say be simply…"* / BSB: *"Simply let your 'Yes' be 'Yes,'…"*

**NET**
- Psalm 51:3 — ESV: *"For I know my transgressions, and…"* / NET: *"For I am aware of my…"*
- Psalm 51:5 — ESV: *"Behold, I was brought forth in…"* / NET: *"Look, I was guilty of sin…"*

**KJV**
- Exodus 20:13 — ESV: *"You shall not murder."* / KJV: *"Thou shalt not kill."*
- Psalm 51:6 — ESV: *"Behold, you delight in truth in…"* / KJV: *"Behold, thou desirest truth in the…"*

Two patterns worth flagging for anyone reading these numbers later: **Psalms
is the hardest book in the sample for all three translations** (poetic
re-lineation and idiom substitution score badly under a word-order metric even
when the sense matches closely), and the worst single verses tend to be short,
idiom-heavy one-liners rather than long argumentative sentences — a 25-word
sentence has more matching words to anchor on even if a clause or two differs.

## NIV: could not be measured, on purpose

Lantern has no NIV source configured — no self-hosted bundle, no live proxy,
no API key. `docs/proposals/translations-esv-niv.md` already looked at this
directly: a free path exists in principle (API.Bible's Starter plan), but the
verdict on record was "NIV — do not build now." This audit does not change
that calculus, and building or acquiring an NIV source just to answer this
question would be scope creep the task explicitly ruled out. So: **NIV
divergence from ESV is not reported here, and nothing in this document should
be read as one of BSB/KJV/NET standing in as an NIV proxy.** If NIV support is
ever built for real, this same script (or its successor) can answer the same
question for it in about the time it took to run this one.

## Recommendation

**Keep BSB as the default reading translation.** It already has the best
follow-along number of the three (29.1% break rate vs. 32.6% for NET and 47.1%
for KJV), it's the translation the self-hosted fallback and the app's own
voice are built around, and NET isn't enough of an improvement anywhere in
this sample to justify moving the default. **Do not make KJV the default for
anyone expecting to follow a modern-translation reader** — its archaic forms
are a structural mismatch for read-along use, independent of how good a
translation it is on its own terms.

**Say something in onboarding, but keep it light.** Roughly a third of verses
will visibly differ in wording from what a group reads aloud in ESV or NIV — 
common enough that a first-time user with a study group will notice it in
their first session and might wonder if something's wrong. A single line
somewhere near first use — something like "Reading along with a group using
ESV or NIV? Wording won't match exactly; follow by verse number" — would
convert a moment of "is this broken" into an expected, minor thing. This
doesn't need to be a modal or a settings toggle, just a sentence in the right
place; where that place is (onboarding hint, translation switcher, first-run
tooltip) is a product call this audit doesn't attempt to make.
