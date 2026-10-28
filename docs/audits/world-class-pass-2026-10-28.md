# World-class pass — 2026-10-28

Dennis has started sending Lantern to friends and asked for a fresh, honest
read of the whole thing: UX, bugs, flow breaks, whether the study features
earn their place for a non-technical reader, the landing page, what a guest
gets versus a member, and the translations question after one friend said he
would only ever read ESV. Method: walked the live site as a guest on a
390×812 phone viewport, at 1024×768 (iPad landscape / zoomed laptop) and at
1366×800 desktop, read the code where the browser could not answer, and ran a
research pass on what people praise and abandon in Bible apps in 2025-26.

Nothing was changed. This is the ranked list; the fixes are their own work.

**One structural read before the list.** The product is in good shape where
it matters most: the reading page is calm, the dive-in sheet is genuinely
good once opened, Study on a wide desktop is coherent, and nothing errored
anywhere walked. The gaps are almost all at the *edges* a friend hits first:
arriving, choosing a translation, trusting that notes are kept, finding a
verse, and sharing one back. That is where this pass concentrates.

---

## A. The five things a friend hits first

### 1. "Sign in to keep your notes" does not keep them
A guest writes notes (the composer, Save, Journal all work and say nothing
about persistence). Profile then offers **Sign in to keep your notes**. That
button calls `guestSignIn`, which exits guest mode and shows the landing page;
the guest's in-memory API is dropped and the Supabase API starts empty
(`Root.tsx`, `App.tsx`). The notes are gone and the button promised the
opposite. For a friend who tried it out properly before committing, this is
the worst possible first experience, and it is the one the copy invites.
- Fix: serialise the guest store before `exitGuestMode()`, keep it in
  localStorage under a `berean.` key, and replay it through `BereanApi`
  after the first successful session. Until then, change the copy to "Sign
  in" and show a plain line at the first guest Save: "Notes you write while
  trying Lantern are not kept. Sign in to keep them."
- Second half of the same problem: the only place that says guest notes are
  ephemeral is the Profile tab. The composer, the saved-note row and the
  Journal all look identical to the real thing.

### 2. The ESV reader never finds ESV
A guest's translation list is BSB / KJV / NET. ESV is filtered out of
`GUEST_TRANSLATIONS` for a good reason (shared Crossway quota), but the UI
does not say so: the friend who only reads ESV opens Settings, sees no ESV,
and concludes Lantern does not have it. He never learns that signing in
gives it to him. The same applies to the Tamil language switcher.
- Fix: list ESV in the guest picker, disabled, with "Sign in to read in
  ESV" as its sub-line and a tap that goes to sign-in. Honesty costs
  nothing here and it is the single cheapest retention fix in this document.
- Related: nothing on the landing page names a translation at all. See §D.

### 3. There is no way to share a verse
In-app navigation never changes the URL (`/read/<book>/<chapter>` exists in
`deepLink.ts` but is parse-only). The selection bar has no Share or Copy
link, and there is no native share sheet on mobile. For an app being passed
between friends this is the missing growth loop: the natural moment ("look at
this verse") has no action. Sharing a verse is table stakes in every app the
research surfaced.
- Fix: push `/read/<book>/<chapter>?v=16` as the reader moves (history
  replace, no routing library needed), add **Share** to the selection bar
  (Web Share API on mobile, copy-link on desktop), and have the deep link
  spotlight the verse the way search already does. The guest deep-link wall
  is already removed, so a shared link lands straight on the verse.

### 4. Searching a word returns the wrong verses
"faith" returns Genesis 24:27, 24:49, 32:10 … in canonical order, capped at
40. Because the scan is a case-folded substring over the whole BSB in book
order, "faith" matches "faithfulness" and "unfaithfully" first and the cap is
reached before Romans or Hebrews exist. Hebrews 11:1 and Ephesians 2:8, the
verses the person is looking for, are unreachable. "love is patient" works
because it is rare.
- Fix, in `utils/scriptureSearch.ts`: whole-word match ranked above
  substring; rank by match density and by a small prior for the NT and for
  well-known verses (cross-reference vote weight is already in the bundle);
  show the top 40 by rank, not the first 40 by position; keep "N more" so
  the cap is visible.

### 5. Reference search is stricter than people type
"rom 8:28" works. "rom 8 28", "jn 3 16" and "john 3v16" all return "Nothing
matches". On a phone keyboard the colon is two taps away, so space is the
common form. Pressing Enter on a found reference does nothing; the reader
must tap "Open chapter".
- Fix: accept space, "v" and "." as chapter/verse separators in the parser;
  Enter opens the first result.

---

## B. The reading page

### 6. The dive-in entrance is unlabelled and arrives late
Select John 1:1 and, after one to two seconds, a line appears beneath it:
**Genesis 1:1  In the beginning God created the … +35**. A first-time reader
sees a verse they did not select appear with a number after it. Nothing says
"this verse is quoted or echoed 36 times; tap to see". The delay (the
connections bundle loads lazily on first selection) makes the first
selection feel like nothing happened, then something did. The sheet behind
it ("Where Scripture picks this up", headings, "Read it in Genesis 1") is
excellent and needs no change.
- Fix: prefetch the connections bundle on chapter open (it is small and
  cached); give the entrance a one-word signifier that stays constant across
  verses so it reads as a control, e.g. a small "Connections ›" or "Dive in"
  caption above the sample row, and render the row with a skeleton while
  loading so the layout does not jump.
- The gutter mark (accent dot under the verse number) is good but no reader
  will decode it unaided; the "Tap a verse" hint is the natural place to say
  "Verses with a dot have more beneath them."

### 7. Selection dims the whole chapter
Choosing a verse drops every other verse to roughly half opacity. On a phone
the page goes grey and the reader loses the context they were just reading;
YouVersion, Logos and Olive Tree all keep the chapter readable and mark the
selection. The dim also makes the dive-in line and the inline note row the
only bright things, which fights the "scripture first" principle.
- Fix: lighten the dim substantially (or drop it) and let the selected tint
  plus the accent verse number carry the selection.
- The selection model itself is sound: tap selects, tap another extends the
  range, tapping inside the range clears it, the bar names the range
  (John 1:2–4). Two details: tapping inside a range clears *everything*
  rather than trimming to the tapped verse, and on desktop Shift-click to
  extend is undiscoverable (no hint names it).

### 8. The "Got it" hint reflows the page under your finger
Dismissing "Tap a verse to select it" removes the card and the verses shift
up, so a tap aimed at verse 1 lands on verse 2 (happened in this walk).
- Fix: fade the hint out without changing layout, or reserve its height.

### 9. "Highlight as Observation" is a category, not a colour
The highlight picker reads HIGHLIGHT AS… Observation / Historical /
Application / Personal. Everyone arriving from another Bible app thinks of
highlights as colours. The product's idea (a highlight is a bodiless note in
a lens) is right, but the first screen should bridge it.
- Fix: "Mark as…" with the swatch large and the one-line meaning of each
  lens under it on first use; keep "Highlight these words" where it is.

### 10. Inline note row and the note syntax leak
On mobile the saved note shows cleanly under the verse. On desktop Study,
clicking a verse inserts the literal token `v4` into the note text, and
choosing a lens inserts `@historical`; the saved row then shows `v4` as a
chip. These are the Electron-era parser tokens surfacing in the body. A
non-technical reader will type over them or wonder what they are.
- Fix: keep anchor and category as controls outside the text (the mobile
  composer already does this), and strip the tokens from display.

### 11. The desktop Study toggle exists twice and the 1024px band is broken
At 1366px there is a **+ Study** nav tab and a **Read | Study** segmented
toggle in the chapter header; they do the same thing and both light up.
Below the 1160px floor, Study disappears from both, but the selection bar
still offers **Study these verses**; tapping it at 1024×768 opens the Notes
panel over a scripture column that is pushed off the left edge (text clipped
mid-word). That width is iPad landscape and any laptop at 125% zoom.
- Fix: one entrance (the header toggle, since it sits beside what it
  changes); below the floor, "Study these verses" should open the quick
  composer instead, or the panel should take the full width.

### 12. Smaller reading-page items
- Library says "Click any book to begin reading" on a phone.
- The **Personal ▾** control in the header opens a menu whose only other
  item is "Shared group spaces — coming later". A dead switcher in the most
  prominent slot of the top bar; hide it until there is a second option.
- The 66 library buttons have no accessible name (screen readers announce
  "button").
- After a search jump (Romans 8:28) the chapter paints with a vertical dim
  gradient for a moment before the verse spotlights; fine, but on first
  encounter it reads as a rendering glitch. Shorten or skip it.
- "5 translator notes" under the chapter heading is a button that nudges the
  first footnote door; a reader cannot tell it is a control or what a
  translator note is. Either make it a plain count or open the first note.
- There is no section or paragraph structure in the text (one verse per
  block throughout). For narrative books this is heavy; BSB ships paragraph
  markers in the helloao data, so a "paragraphs" reading option is cheap.

---

## C. Arriving and orientation

### 13. The library is the home screen, and it is a wall of 66 names
A new reader lands on Genesis to Revelation with no "continue where you
left off", no suggested starting point, and no sense of what the app is
for. Every app in the research has a daily touchpoint (plan, verse,
"continue reading"). Lantern's principles rule out streaks and metrics, but
"Continue · John 3" and two or three gentle starting points ("New here? Try
John 1 or Psalm 23") are not metrics.
- Fix: a small "Continue reading" card at the top of the library (last
  chapter, from the existing reading position), plus a one-line starting
  suggestion for a reader with no history.

### 14. Signed-in onboarding is a name field
Onboarding asks "What should we call you?" and nothing else. The two
decisions that shape the whole experience (which translation, which look)
are left at defaults, so the ESV reader starts in BSB and has to find
Settings. Ask the translation question here, in the user's words: "Which
Bible do you read?" with BSB / ESV / KJV / NET and the one-line truth under
ESV (online only, read over Crossway's API). This is where translation
preference should be set, not discovered.

### 15. Guest mode is honest only on the Profile tab
See §1. The guest badge ("Trying Lantern · Nothing here is saved yet") should
also appear once in the composer on first Save.

---

## D. The landing page

The page is well made and still accurate about the core (read, four lenses,
notes beside the verse, journal). It is now out of date about what the app
does and silent about the thing people decide on:

- **No translation is named anywhere.** The research is unambiguous that
  translation availability is the first filter for most readers. State it:
  "Read the Berean Standard Bible, KJV and NET offline; ESV with an
  account." (That sentence is also the honest ESV terms disclosure.)
- **The hero scripture is NIV text, not BSB.** `HeroFlythrough.tsx` renders
  John 1 with "the light of all mankind" and "made his dwelling among us",
  which is NIV wording; the app shows BSB ("the light of men"). A reader who
  signs up expecting the text they saw gets a different one, and the page
  quotes NIV without the attribution Biblica requires. Swap the hero and
  clip text to BSB.
- **None of the new work is on the page:** the dive-in (cross-references
  with headings, the map of a journey), translators' notes, scripture word
  search, highlights, Tamil, offline reading, the install-as-app path. The
  page sells a notes app; the app is now a quiet study Bible. One section
  ("See where a verse leads") with the Galatians 1:17 map card would carry
  it.
- **"Take a look first" is the right CTA** and should stay primary for a
  friend-shared link; consider making it the first button, since the
  research says people try before they sign up and the guest path is good.

---

## E. The features, judged as a non-technical reader

| Feature | Does a fresh reader find it? | Does it pay off? | Verdict |
|---|---|---|---|
| Reading page, chapter strip, display settings | Yes | Yes | Keep. The calm is the product. |
| Verse select → Note | Yes (hint) | Yes | Keep; fix §7, §8. |
| Highlight (as lens) | Yes | Yes, once understood | Reword (§9). |
| Dive-in: cross-references | Only after the delay, unlabelled | Strongly yes once opened | Label it, prefetch (§6). |
| Dive-in: journey map | Only on journey verses, unlabelled | Yes, and distinctive | Same; put it on the landing. |
| Translators' notes (footnote doors) | Dotted underline only, vanishes while a verse is selected | Modest; "Or: …" notes are useful, variant notes less so | Keep; make the chapter count a real control (§12). |
| Word door | Not found in the guest walk (flagged) | Unassessed | Leave flagged until the guardrail pass. |
| Scripture word search | Yes | No, today (§4) | Fix ranking before anything else in search. |
| Journal | Yes | Yes, with notes; empty state is fine | Keep. |
| Study (desktop) | Only ≥1160px; two entrances | Yes | Consolidate (§11). |
| Export | Yes | Yes | Keep. |
| Personal ▾ workspace switcher | Yes, prominently | No (one option) | Hide until groups exist (§12). |

Nothing here is confusing because it is *too much*; it is confusing because
the entrances are quiet to the point of invisibility while a decorative
control (Personal ▾) is loud. Flip that and the feature set reads as one
idea: choose a verse, see what is beneath it.

---

## F. Translations and the economics

**The signal.** One friend said he would only use ESV. That is exactly the
demand signal the 2026-09-01 capture said to watch for ("whether the absence
of their usual translation turns them off"), and it arrived from the first
friend outside the BSB test. It will keep arriving: ESV is the evangelical
default in the US, UK and Australia, and the research found every free
competitor leads with ESV presence.

**The constraint has not moved.** The api.esv.org terms, re-read today: free
use is for individuals and non-commercial organisations; a site that charges
for anything, carries ads or sponsorship, or asks for donations is
commercial; Crossway licenses to organisations, not solo developers; 500
verses per query and in local storage; 5,000 queries a day per application.
The peer-enquiry route (Harvous) is spent. So "ESV, free, online-only, no
donate button" remains the only compliant shape, and the first paid feature
or donate link of any kind ends it.

**The pragmatic position, which the roadmap already half-holds, made
explicit:**

1. **Lantern is free, with no ads and no donations, for as long as ESV is
   in it.** Say this on the landing page and in Settings. It is a feature:
   the loudest complaints in the research are nagging, paywalled scripture
   and forced subscriptions. A free, quiet, honest study Bible is a position
   nobody large occupies.
2. **Make ESV first-class inside that constraint.** Today it is a hidden
   option behind sign-in with an "online only" tag. Instead: offered at
   onboarding, visible-but-locked for guests, neighbour prefetch (built, in
   review), and the 500-verse local cache kept exactly as is. The reader's
   experience of ESV should be "fast and normal", with offline the one
   honest gap.
3. **Every feature should work on every translation, and almost all already
   do.** Notes, highlights, journal, search by reference, cross-references
   and the map are verse-anchored and translation-independent. The two
   BSB-bound features are translators' notes and the word door, because only
   BSB ships open per-word data. Do not try to fake them on ESV; show the
   one-line note the HQ goal already specifies ("the deeper layer works on
   BSB — tap to read this verse there") and otherwise keep ESV at parity.
   Scripture *word* search is BSB-only today too; say so in the results
   header (it does) and consider searching the reader's own translation
   where a self-hosted bundle exists (KJV, NET).
4. **If money is ever needed, charge for compute, never scripture, and make
   it a deliberate choice that removes ESV.** AI retrieval and group hosting
   are the only metered things on the roadmap. That decision point is still
   far away; nothing today costs per-user money except ESV's shared quota
   (roughly 1,000–1,500 daily ESV readers before it binds, which is two
   orders of magnitude beyond today).
5. **Watch the one number that matters:** ESV share among signed-in readers
   once onboarding asks the question. If it is the majority, the licence
   conversation with Crossway is worth reopening from a position of real
   traction (an organisation with users, not a solo developer with none).

What this means for the friend: tell him the truth, which is good news.
Lantern has ESV; sign in and choose it; it reads online, and everything
except the translators' notes works on it.

---

## G. What the research says, applied

Full brief and sources in the session log. Applied to Lantern:

- **Praised everywhere:** the church's translation, reading plans / a daily
  touchpoint, highlights and notes that sync, offline, audio, original-
  language tools, a calm reading surface. Lantern has five of seven; it has
  no daily touchpoint (by principle; §13 is the non-metric version) and no
  audio (a platform capability, `src/platform/`, worth a proposal later).
- **Abandoned for:** clutter and feature creep (the most frequent theme),
  redesigns that break habits, donation nagging, sync loss, forced
  subscriptions, AI-flavoured devotional copy. Lantern is on the right side
  of every one of these, provided §1 is fixed before anyone loses notes.
- **AI:** the only praised use is retrieval with citations; authored meaning
  is resented and YouVersion's CEO put the misquote rate at 15–60%. The
  philosophy line holds. Nothing to add.
- **New entrants** differentiate on sharing and spaced review (Harvous) or
  on AI chat; none on seeing the passage. The dive-in is still uncontested.

---

## H. Suggested order of work

1. §1 guest notes survive sign-in (or the copy stops promising it).
2. §2 ESV visible-but-locked for guests; §14 translation asked at onboarding.
3. §3 share a verse (URL follows the reader; Share in the selection bar).
4. §4 search ranking; §5 reference parser; Enter opens.
5. §6 dive-in label and prefetch; §7 lighter dim; §8 hint reflow.
6. §11 one Study entrance and the 1024px fix.
7. §D landing refresh: BSB text in the hero, name the translations, one
   section on the dive-in and map, the free-forever line.
8. §13 continue-reading card; §12 small items.

Each is a day or less except the share link and the landing section.
