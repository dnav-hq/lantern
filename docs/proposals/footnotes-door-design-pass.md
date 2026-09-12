# The footnote door — where it falls, and three ways to draw it

A short brief so the visual design pass on the footnote door (the dotted
underline under a translator's "Or…") is a decision session, not a discovery
session. It answers one question — *where do doors actually fall, and why* —
with numbers, then lays out three concrete ways to draw the door on a phone
for you to react to.

Status: brief, prepared 2026-09-12. Companion to
`docs/proposals/footnotes-door.md` (the original design + data brief; that one
decided *which* notes ship and *how* the span is inferred — this one is just
"where do they land, visually, and what should that look like").

---

## 1. Where are the doors

Computed straight from the shipped BSB text and footnotes — the same data and
the same filtering rule the reading surface uses at runtime (`footnoteShips`
in `src/utils/footnotes.ts`, plus the anchoring check in
`src/bible/helloao.ts`). Reproduce with:

```
node scripts/measure-footnote-density.mjs
```

(needs network access to `bible.helloao.org`; set `COMPLETE_JSON_PATH` to a
saved copy of `GET /api/BSB/complete.json` to run offline.)

**The headline numbers, across all 1,189 BSB chapters:**

- **2,099 doors total** — every alternate-rendering note that ships, out of
  4,853 BSB footnotes overall (the rest are held back; see §2).
- **23.0% of chapters have zero doors** (274 of 1,189). Almost a quarter of
  what a reader opens has nothing to find.
- **Median: 1 door per chapter.** Most chapters that have anything have
  exactly one. A handful of chapters carry many; most carry a few.

**Top 10 books by door count** (raw count, not density — long books
naturally accumulate more):

| Book | Doors | Chapters |
|---|---:|---:|
| Psalms | 151 | 150 |
| Isaiah | 124 | 66 |
| Jeremiah | 103 | 52 |
| Genesis | 88 | 50 |
| Ezekiel | 81 | 48 |
| Acts | 79 | 28 |
| Exodus | 78 | 40 |
| 2 Chronicles | 75 | 36 |
| Proverbs | 68 | 31 |
| Job | 64 | 42 |

**Bottom 10 books by door count:**

| Book | Doors | Chapters |
|---|---:|---:|
| Jude | 1 | 1 |
| 2 John | 1 | 1 |
| Philemon | 1 | 1 |
| 3 John | 2 | 1 |
| Titus | 3 | 3 |
| Haggai | 3 | 2 |
| Obadiah | 3 | 1 |
| 2 Thessalonians | 4 | 3 |
| Habakkuk | 4 | 3 |
| 1 Thessalonians | 5 | 5 |

The short epistles sit at the bottom mostly because they're short, not
because they're translated more plainly — Isaiah and Acts sit near the top for
the opposite reason. Density (doors per chapter, or per verse) would rank
them differently, but raw counts are what a reader actually bumps into while
reading straight through, which is the question this brief is answering.

## 2. Why the density is theirs, not ours

**A door exists only where the BSB's own translators left an alternate-
rendering note.** We don't decide where a door goes — the 1611-times-removed
committee of translators did, every time they wrote "Or…", "Literally…", or
"Hebrew *word*…" instead of just picking one English rendering and moving on.
The BSB carries 4,853 such notes in total; only the 2,099 in the "alternate
rendering" class ship as doors (`docs/proposals/footnotes-door.md` §3 and §6
explain the full classification and why the rest — manuscript variants,
citations, glosses, unit conversions, supplied words — are held back). So if a
chapter has no door, it isn't that Lantern skipped it; the translators simply
didn't flag a choice there.

**The underline's *length* is also inferred from the note, not chosen by us.**
A BSB footnote marker only tells us where a note *ends* — never where the
phrase it's about *begins*. `src/utils/footnoteSpan.ts` reaches back using
**strategy B**: underline approximately as many words as the note's own
alternative offers to replace (so "Or *futile*" underlines one word; a note
offering a three-word alternative underlines three). Where the note is a
gloss rather than a substitution and has nothing to align to, it falls back to
**strategy A**: just the last word. Measured across the whole ship set:
**strategy B fires 87.3% of the time, strategy A the remaining 12.7%.** Both
numbers — which notes ship, and how far each underline reaches back — come
from the translators' own text, not a stylistic choice made in this app.

## 3. Three ways to draw the door

All three are phone-first (that's where the tap-arbitration question in the
original brief's §5.4/§10.3 already lives) and all three are compatible with
holding the current underline as the base case — the question is what, if
anything, sits *around* it.

### Option 1 — Keep the dotted underline as-is

No change. A 1px dotted underline sits under the flagged phrase; tapping it
opens the note.

**For:** Zero cost, already shipped and tested. It's quiet — it doesn't
compete with the highlight/selection affordances already on the page, and a
reader who has never noticed it loses nothing (the app reads identically
either way). It matches the "don't see for them" philosophy: the door doesn't
announce itself, it waits.
**Against:** This is the exact complaint that prompted this brief — it's easy
to read for months and never notice it, especially since 23% of chapters have
none at all to build the habit on. A reader who *would* value the deep dive
may simply never discover the door exists.

### Option 2 — A faint end-of-verse marker count

Add a small, muted mark (e.g. a superscript dot or a light "²") at the end of
any verse that carries one or more doors, showing the count for that verse,
independent of the underline itself (which stays exactly as it is).

**For:** Gives a reader a reason to look *within* a verse without pointing at
a specific word ahead of time — closer to how a print study Bible's own
footnote markers work, which is a familiar convention. Doesn't require adding
any UI outside the verse itself.
**Against:** Adds a visible mark to every verse that has one, which is a
bigger footprint on the page than today's underline (skimming a chapter, the
eye now has extra marks per line rather than per phrase). Also a new thing to
build and test, where option 1 is free.

### Option 3 — A per-chapter "n notes here" affordance in the chapter strip

Surface the door count for the *whole chapter* once, in the chapter
navigation strip (where a reader already sees "Chapter 3 of 50" or similar),
e.g. "4 translator notes in this chapter." Tapping it could jump to the
first door, or just be informational. The underline stays as the actual
open-the-note affordance.

**For:** Answers the exact question that prompted this brief — "how many
are there and where" — before the reader even starts reading, at the one
moment (chapter navigation) that's already chrome rather than scripture. It
also naturally explains the 23%-zero-door chapters: a reader sees "0 notes"
and isn't left wondering why they never spot the underline.
**Against:** It's a second thing to build (a count computed and rendered per
chapter, on top of the note itself), and it's one more piece of chrome on a
page whose chrome is already being trimmed for reading (see recent mobile
chrome-scroll work). It also doesn't help *within* a long chapter — Psalms
151 or Isaiah 124 still means a reader has to keep scrolling to actually
land on one.

### Recommendation

**Option 3.** It directly answers the question that started this brief — "I
notice it in few places, how is that decided" — by putting the number in
front of the reader before they even start reading, and it costs nothing
extra on the underline itself, which is doing its job of not over-claiming
once a reader gets there. Option 2 is worth keeping in reserve if option 3's
count turns out to be too easy to ignore in practice; option 1 (do nothing)
leaves the original complaint unaddressed.

## 4. Two open questions for you to decide

1. **Does the per-chapter count (option 3) replace or sit alongside the
   dotted underline?** This brief assumes alongside — the count says "there's
   something here," the underline still says "here specifically" — but if you
   want the count to *be* the whole affordance (tap it to reveal doors that
   are otherwise invisible until then), that's a materially different, bigger
   build.
2. **Is raw door count per book/chapter the right way to communicate this, or
   would you rather see it framed as density (doors per verse or per 100
   words)?** §1 uses raw counts because that's what a reader bumps into while
   reading straight through, but density would change which books look
   "note-heavy" — e.g. it would rank short, dense books like Titus or 2
   Thessalonians differently than the raw-count table above does.
