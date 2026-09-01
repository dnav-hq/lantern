# Roadmap

Written 2026-08-31, after a two-day research and strategy pass. This is the
arc-level map: what we are building, in what order, and why that order. Item
detail lives in `docs/BACKLOG.md`; the reasoning behind each arc lives in the
proposals named under it.

**The organising principle:** build what depends on nothing external first.
Two days of licensing research established that the one genuinely blocked
thing is translations, and that everything Lantern is actually differentiated
by needs no publisher's permission. So translations go dormant and the rest
proceeds.

**The product in one line:** Lantern helps you *see* a passage and keeps what
you saw. Competitors are better at capture and organisation; nobody is doing
the seeing.

---

## Arc 1 — The note object (foundation)

**Why first:** this is the only arc everything else hangs off, and it fixes a
defect the research says is real and we have not hit yet only because Lantern
is young. Serious users of mature note tools do not complain that capture is
slow, they complain they cannot find anything again. See
`docs/proposals/note-object.md` and `docs/proposals/journal-retrieval.md`.

1. **`getAllNotes()` unbounded fix** — queued. A live bug: the Journal
   silently truncates past the row cap. Losing sight of your own notes is the
   worst possible failure for a notes app.
2. **Retrieval, in the order the brief recommends** — filters, then finish the
   existing search (it already exists and just drops you at a passage rather
   than the verse), then the passage-centric view, then export, then saved
   filters. Mostly a *surfacing* job rather than a new system, which makes
   this arc much cheaper than it looks.
3. **Highlights as bodiless notes** — same anchor, same categories, one action
   in the existing composer. Adds the missing bottom rung for the moment you
   notice something and have no words for it yet. Deliberately verse-level,
   not sub-verse, to preserve translation independence.
4. **User-owned categories** — rename and recolour free, add and remove with a
   cap around eight, four defaults kept. A schema change, not a toggle.

**Not doing:** resurfacing, streaks, scores, activity metrics. Saved filters
instead. The devotional literature is unanimous that guilt-based reading
produces less reading.

---

## Arc 2 — The deep dive

**Why second:** it is the differentiator, and it is uncontested. The nearest
competitor's only comprehension tool is Easton's Dictionary from 1897. See
`docs/proposals/deep-dive-study.md`, `word-door-guardrails.md`,
`bible-map-v1.md`.

Order, and each rung is independently shippable:

1. **Alternate-rendering footnotes** — BSB's own "Or…", "Literally…",
   "Hebrew…" notes. Cheapest, already in the fetch path, and 2,185 of them are
   word-anchored, which makes them the salience signal for the word door.
   *Ship textual-variant footnotes separately and later*: "some manuscripts
   omit" lands on an unequipped reader as anxiety, not insight.
2. **The word door** — highest value, highest risk. Needs a guardrail design
   pass with Dennis before a build ticket, because root fallacy and totality
   transfer are the documented failure mode of exactly this feature. Greek
   ships glosses and sense text; Hebrew ships the Gloss column only until
   permission is obtained for the Meaning column.
3. **The map** — signature feature, stays free core. Build-time ETL over
   OpenBible into hand-authored SVG, no map library, ~170 KB gzipped, works
   offline. Confidence is a required feature, not a nicety: 58% of biblical
   places have more than one proposed location. Design ideation in
   `design/bible-map-v1.html`. **The timeline slider is out**, on evidence:
   the only openly-licensed era-boundary dataset is GPL-3.0 against this MIT
   repo, and its 700 BC Levant geometry is byte-identical to its 1000 BC file.
4. **Book intros** — ~66 short, factual, humble pieces we author. Bounded
   editorial work, not engineering.

**The philosophy line, as revised:** mediated by *method*, not by
*conclusions*. Raw lexicon data is not neutral, so "show primary data and step
back" is not sufficient. Lantern may teach a way of looking. It may not tell
the reader what a passage means.

**Ordering rule:** doorways open only after a full read, never on arrival.
Every study method teaches observe-before-consult, so the deep dive stays
behind the Read/Study toggle and out of the Read path.

---

## Arc 3 — Sharing, small and personal

**Why third, and deliberately small:** the research found no evidence people
share study notes today, and sharp recoil against any visibility of activity
("The Bible cannot be school"). See the 2026-08-30 addendum in
`docs/proposals/groups-shared-workspaces.md`.

- **Sharing is a property of the note, not a place you write.** One row, a
  visibility flag, appearing in both the personal Journal and the shared view
  because it is the same note. This is the one-on-one study case, it is cheap
  once Arc 1 is done, and Dennis wants it for his own study.
- **Hard constraint: no activity visibility, ever.** No "who has read", no
  last-seen, no participation counts, no leader dashboard. Members see what
  someone deliberately shared and nothing else.
- **The 10+ group is a separate product** whose primary object is the
  leader's passage plus questions, not a personal note. Deferred, and Arc 3
  does not commit us to it.
- **Conflict-safe `updateNote` is non-optional** the moment two people can
  write near each other.

---

## Arc 4 — Translations (dormant, externally blocked)

**Status: parked, not abandoned.** See `docs/proposals/translations-esv-niv.md`
and `translations-path-to-esv-niv.md`.

Settled position: **BSB + KJV + NET offline and permanent; ESV online-only
while Lantern stays free; NIV unlikely.** api.esv.org explicitly permits use
in mobile apps without formal permission, so the current integration is lawful
and not in a grey area.

- **Live tripwire:** any paid feature or donate button ends ESV eligibility.
  Crossway's test is site-wide and counts donations as commercial. This is the
  one action that can close a door by accident.
- **No entity.** Crossway's licensing form auto-declines individuals and
  requires an organisation with a signatory, so ESV parity has a price of
  admission Dennis has judged not worth paying for a free app with one user.
- **Shipped 2026-08-31:** NET added; the ESV cache now persists across reloads
  within the cap (faster AND a lighter draw on the shared quota); and a failed
  translation falls back to BSB with a visible notice rather than a dead end.
  What remains is true offline, which needs a licence.
- **The one ceiling on this arc.** Crossway's quota is per APPLICATION, shared
  across all users, so ESV is the single part of Lantern that does not scale
  for free — roughly 1,000-1,500 daily-active ESV readers. Everything else
  (notes, retrieval, deep dive, map) costs nothing per read at any scale. So
  the honest framing is "one translation stops scaling", not "the app cannot
  stay free". Watch it before any growth push; see docs/BACKLOG.md.
- **Harvous replied (2026-09-01), and the answer closes the question rather than
  opening it.** Derek Castelli confirmed he has **not** been through a real
  agreement with Crossway or Biblica, called his own setup "more informal than
  I'd like", and could not say whether having a company helps. So the eleven
  translations are not a licensing path we failed to find, and **the entity-form
  hypothesis — register a Pty Ltd and Crossway's bar becomes clearable — has no
  evidence behind it any more.** Do not incorporate for this reason. See the
  2026-09-01 section at the top of `translations-path-to-esv-niv.md`. His two
  suggestions, API.Bible and YouVersion, were already checked and closed here.
  Staying on the free tier inside its terms is a better position than eleven
  translations held informally.
- **Revisit when:** a real paid feature exists and is worth trading ESV for, or
  a publisher's terms change. The peer-enquiry route is now spent.

---

## Arc 5 — Distribution

**Why it is on the roadmap at all:** the nearest competitor is not beating
Lantern on product, it is beating it on being findable. Harvous ships 40+
comparison pages, seven use-case pages and ten feature pages, and owns search
for "best Bible notes app". Lantern has nothing comparable.

Not 40 pages. The ten that matter, honestly written, including an honest
Lantern-versus-Harvous page. Needs no licence, no schema change, and no
permission. Cheapest meaningful win available.

---

## Arc 6 — Later, and gated

- **AI.** Only ever retrieval and navigation, never authored meaning. "Which
  commentators say something interesting here" is on-philosophy; "here is what
  this passage means" is not. Gated behind the deep dive existing, and behind
  a real cost model, since inference is the first thing in Lantern that costs
  real money per use.
- **Commentaries as "another opinion."** Attributed human voices shown in
  plurality, never synthesised, opened deliberately and last. The public-domain
  options are all 19th century and genuinely hard to read, so this needs its
  own design pass rather than dumping what is free and available.
- **Native wrap.** Note that Apple requires donations connected to digital
  content to go through in-app purchase at 15-30% unless you are an approved
  nonprofit. Staying web-first sidesteps that entirely, which is a real
  argument for delay rather than just an absence of urgency.

---

## Monetisation — a decision point, not a feature

Unchanged in principle and now sharper in fact: **monetise compute, never
scripture.** The text, the notes, the study layers and the map stay free
forever because their marginal cost is zero. Anything with a per-user meter
(AI inference, group hosting) may be paid, because pretending otherwise means
it never gets built.

The community line is not free-versus-paid, it is "do not sell the Scripture
itself." Every paywall complaint found in research attached to something users
felt should have been given.

**The constraint:** the first paid feature of any kind ends ESV. So this
decision is deferred until there is a real feature worth the trade, and it is
made deliberately rather than discovered.

---

## What is explicitly not being built

Recorded so these do not get re-proposed:

- Streaks, scores, reading metrics, or any activity visibility.
- The timeline slider, until verifiable era-boundary data exists.
- A full offline write outbox (`offline-write-outbox.md` said wait; draft
  persistence shipped instead and that call still holds).
- Sub-verse word-level highlighting, unless the translation-independence cost
  is accepted with eyes open.
- Nuanced viewer permissions in groups, until someone actually asks.
- AI-authored interpretation of scripture, ever.
