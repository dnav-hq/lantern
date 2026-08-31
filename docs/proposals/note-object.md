# The note object — highlights, categories, and the retrieval problem

Status: **proposal, not started.** Written 2026-08-30 out of a product-strategy
session whose research pass contradicted an assumption the roadmap was resting
on. This document exists because that correction has no other home: it is not a
deep-dive concern, not a groups concern, and not a licensing concern. It is
about the one object Lantern is built on.

## tl;dr

- **Capture latency is probably NOT Lantern's top defect. Retrieval is.** The
  research that said otherwise measured the wrong population. Serious users of
  mature note tools do not complain that capture was slow; they complain they
  can never find anything again, and that they are accumulating a mess.
- **Lantern has not hit this yet because it has one user with a few months of
  notes.** It is a defect in the future, arriving on its own schedule, and it
  gets worse every time the product succeeds at its current job.
- **Three changes to the note object follow, and all three are cheaper than the
  deep-dive work they would otherwise sit behind:** highlights as bodiless
  notes, user-owned categories, and treating the Journal as a retrieval
  surface rather than a history.
- The competitor closest to Lantern (Harvous) has already shipped a retrieval
  engine and made it their thesis. This is the one place a rival is
  demonstrably ahead on product rather than on distribution.

## 1. The correction

An earlier research pass concluded that **capture latency was the P0 defect**,
reasoning from Logos users describing "extra wait time and missing thoughts
while taking sermon notes" and from Kevin Purcell's rule that note creation
should be one tap from the main screen. That conclusion shaped the instinct
that Lantern's mobile select-first composer was aimed at the right target.

A second pass, drawing on Reddit rather than review sites, found something
different. In r/LogosBibleSoftware's "I'm lost with notes" thread, the top
comment (more upvotes than the post) is:

> "notes is terrible when compared to any modern notes app. hard to find, hard
> to discover, hard to retrieve, hard to organize. **It's the single worst part
> of Logos.**"

The original poster's stated fear is not a lost thought:

> "I'm scared if I just take notes without thinking through a good system that
> I'm just going to end up with a complete mess of notes."

Corroborating in the same thread: a fourteen-year Logos user who never figured
notes out, and "TBH, I didn't know Logos had a notes feature." **Nobody in the
thread said capture was slow.**

Three independent lines point the same way:

1. **The described study workflow defers resolution.** The best account of a
   real session on Reddit is explicitly two-phase: write down every question as
   you read, "**then start hunting for those answers**" in a later pass. That
   is a workflow latency cannot threaten and retrieval absolutely can.
2. **Elaborate highlight systems are retrieval systems, not capture systems.**
   One user's 17-category colour scheme (orange = God speaking, purple = God
   commanding, beige = geography, boxed = unknown word, underline = repetition)
   is an index being hand-built because the tool does not provide one.
3. **Reviewers say it directly of the market leader.** YouVersion's notes are
   "closer to a highlighter than a real notebook," with "no good way to review
   notes — a scrolling log… a headache with 100+." Obsidian Bible-study users
   hit the same wall.

### Why the first pass got it wrong, and why it matters

Latency is measurable and gets written about in reviews and listicles.
Retrieval failure only surfaces after someone has years of notes, and it shows
up in support forums rather than in "best Bible app" posts.

**Lantern's user population has months of notes, not years.** So this defect is
invisible today and arrives later, in proportion to how well the current
product works. That is exactly the kind of defect a roadmap misses.

**This does not mean capture work was wasted.** The mobile select-first
composer and draft persistence are still right; a tool that loses your thought
is unusable regardless. The correction is about *priority*, not about
reversing a decision.

## 2. Highlights as bodiless notes

### The evidence

Highlighting is where the unprompted energy is in every study-practice thread.
The systems people build range from baroque (17 colours) to deliberately
minimal:

> "I have one color. I use purple for verses or sentences I love. I underline
> what is important and I put things that stand out between []. I love the
> simplistic look of it and it has everything I need."

Journaling Bibles and wide-margin Bibles (a real retail category) are the paper
ancestor of the same behaviour: the annotation lives *beside* the verse.

### The design

**A highlight is a note with no body.** Same anchor, same categories, same
colour source, same Journal. The feature is one action in the existing
composer: *mark it, don't write*.

This is deliberately smaller than the obvious design (word-level selection
inside a verse), and the reasons are load-bearing:

- **It needs no new data model, no new anchor type, and no new mobile gesture.**
  Lantern already selects a verse range and applies a category whose colour is
  already defined. The only thing being removed is the requirement to type.
- **It adds the missing bottom rung.** The cheapest action in Lantern today is
  writing a note, which presumes you can already articulate what you saw. There
  are moments in reading where you notice something and have no words yet.
  Today that moment produces nothing. A highlight catches it, and it can grow a
  body later, or never.
- **Verse granularity preserves translation independence.** Word offsets differ
  between translations, so a sub-verse highlight anchored in ESV cannot survive
  being viewed in BSB. Verse anchoring is precisely what YouVersion users
  complain about lacking ("notes don't transfer between versions"). Sub-verse
  highlighting quietly forfeits a property Lantern currently wins on.

**Sub-verse highlighting is not forbidden forever**, but it must be a
deliberate trade made with the translation-independence cost understood, not an
incremental polish.

## 3. Categories become user-owned

### Why the closed set has to open

The four categories (`observation | historical | application | personal`) are
good discipline and were the right starting default. But **the category set is
the retrieval index.** A reader who studies mostly typology, or prophecy, or
prayer, has no category for it; every note lands in `observation`, and the
Journal stops discriminating exactly when it starts mattering.

Auto-tagging (the Harvous approach) is the alternative and it is worse for this
product: it produces tag sprawl, which is the mess users are already afraid of.

### The design

- **Rename and recolour: free.** No structural cost, immediate benefit.
- **Add and remove: allowed, with a cap.** Somewhere around eight total. The
  17-colour user is the failure mode — they built a private language their
  future self cannot read. Constraint is the feature.
- **Keep the four as defaults** for every new account.

### The cost, stated honestly

This is a **schema change**, not a settings toggle. Categories move from a
closed union in `src/types/` to rows the user owns, and notes point at them. It
touches the `BereanApi` seam, needs a migration, and needs a sensible answer for
what happens to notes whose category is deleted. Not hard, but not free, and it
should not be described as a quick win.

## 4. The Journal must become a retrieval surface

`docs/ARCHITECTURE.md` frames the Journal as a *derived, reflective history*
built from `getAllNotes()`. That framing is right and it is not sufficient. A
history is chronological; a retrieval surface answers "where is the thing I
wrote about this."

The competitor comparison is uncomfortable and worth writing down. Harvous
ships **Recall**, an active resurfacing engine ("a fading note, a highlight, a
passage — Recall resurfaces what's worth revisiting"), with spaced review
announced. Their blog post "Remembering is the point" is their product thesis.
Lantern's Journal is a weaker claim on the same problem: it shows what you
wrote, in order.

**No design is proposed here yet** — this needs its own pass, and it should
start from the observed behaviours (questions captured now and hunted later;
colour schemes as hand-built indexes) rather than from a competitor's feature.
What this document asserts is only that **the Journal is now a first-class
roadmap arc, not a view that already exists.**

Open questions for that pass:

- Filter and search by category, book, date, and highlight-vs-note.
- "Everything I have ever written about this chapter," reachable from the
  reading page (the passage-centric view Lantern gets for free from verse
  anchoring, and which Harvous is bolting back on via margin indicators).
- Whether resurfacing belongs here at all, given the anti-gamification stance
  (see §6).
- Export. Note portability is the answer to the loudest grievance in this
  market (the Logos subscription backlash is about *ownership*, not price) and
  `src/platform/` already has the seam.

## 5. Why this ordering is cheaper

Highlights, categories, retrieval, and note sharing are all properties of the
**note object**. The deep-dive layers (footnotes, word study, map, book intros)
hang off *scripture*, not off notes, and are largely independent of them.

Doing the note-object work first means:

- The deep dive lands on a richer object (a word-study door can produce a
  highlight; a map place can be a note anchor).
- Group sharing becomes a visibility flag on an existing row rather than a new
  container (see `groups-shared-workspaces.md`).
- None of it depends on a translation licence, which is the one part of the
  roadmap with an external blocker.

## 6. Constraints inherited from the research

Two hard lines this work must not cross.

- **No streaks, scores, or activity metrics.** The devotional literature is
  unanimous that guilt-based reading produces *less* reading, and that legalism
  arrives precisely when quantity becomes the metric. Accept the cost honestly:
  this is a segment choice. The fairest framing found in the research is that
  the people who call streaks manipulative are the people who already read
  daily. Lantern is choosing that group.
- **Resurfacing is not notification.** If the Journal ever surfaces old notes,
  it must be pull, not push, and it must never imply the reader is behind.

## 7. Sources

Reddit threads (accessed via the Chrome connector; `old.reddit.com` and its
`.json` endpoints are blocked to other agents): r/LogosBibleSoftware "I'm lost
with notes", r/Bible "How do you study the Bible?", r/Bible "How do you take
notes/highlight your Bible?", r/Bible "Looking for an electronic bible in which
I can take notes", r/Christian "Does anyone else use YouVersion?".
Reviews: warmpeach.com, christianbytes.com on YouVersion notes; Logos community
forums on subscriptions and notes. Competitor: harvous.com features and pricing
pages. Caveat: ~15 threads, most under 45 comments — texture, not frequency
data.
