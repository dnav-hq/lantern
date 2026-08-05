# In-app PWA install prompt — research + recommendation

Some people who read Lantern on their phone never install it as a home-screen
app because they miss the browser's built-in install / "Add to Home Screen"
option — it's easy to overlook. This proposal researches current best
practice for an in-app nudge toward that option and gives an honest
build-or-don't-build call for Lantern's scale.

## What's already in place

Lantern already ships a fully installable PWA — `vite.config.ts`'s
`VitePWA` block sets a real `manifest` (`display: 'standalone'`, icons,
theme colors) and precaches the app shell via Workbox. There is currently
**no install-prompt UI at all**: no captured `beforeinstallprompt`, no
custom button, no iOS hint, and no telemetry signal for whether a visit is
running standalone or in a browser tab. `src/telemetry/install.ts`'s
"install id" is an unrelated per-browser-profile anonymization id (see its
own header comment) — it says nothing about home-screen installation. So
today there is genuinely zero data on what fraction of Lantern's readers
are already using it as an installed app versus a bookmark/tab, which
matters for the recommendation below.

## The verified platform split

The two platforms behave nothing alike, and any design has to treat them as
two separate features, not one:

### Android / Chromium (Chrome, Edge, Samsung Internet, desktop Chrome/Edge)

Fires a real `beforeinstallprompt` event once the browser's own
installability heuristics are met (valid manifest, HTTPS, a registered
service worker, and some engagement signal — Lantern already satisfies the
static requirements via `vite-plugin-pwa`). The standard pattern
([MDN: Trigger installation from your PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt),
[web.dev: How to provide your own in-app install experience](https://web.dev/articles/customize-install)):

1. Listen for `beforeinstallprompt` on `window`, call `event.preventDefault()`
   to suppress the browser's own mini-infobar, and stash the event.
2. Show your own UI (a button/banner) only once that event has actually
   fired — if it never fires, there is nothing to prompt.
3. On tap, call the stashed event's `prompt()`, then await `userChoice` to
   learn `accepted` / `dismissed`.
4. `prompt()` can only be called once per event instance. After a dismissal,
   there is nothing to re-show until the browser fires `beforeinstallprompt`
   again on a later visit (own timing, not ours).
5. `beforeinstallprompt` is Chromium-only and non-standard — it does not
   fire in Firefox (desktop or Android) or in Safari on any platform. Any
   implementation needs a plain feature check (`'onbeforeinstallprompt' in
   window` or just "did the event ever fire") rather than a UA sniff, and
   must render nothing when it hasn't fired.

### iOS Safari (and every other iOS browser — WebKit is mandatory on iOS)

No `beforeinstallprompt`, no `event.prompt()`, no programmatic install path
of any kind — this is a deliberate Apple platform restriction, not a gap
that will close. The only route to the home screen is manual: **Share
button → "Add to Home Screen."** The only thing an app can do is show a
subtle, dismissible hint that explains those two taps; it cannot trigger
the action itself. Detecting "should I show this hint" needs two checks
together: an iOS UA/platform check (`/iPad|iPhone|iPod/.test(navigator
.userAgent)`, guarding against `MSStream` false-positives from old IE
UA-spoofing) *and* confirmation the app isn't already installed (below) —
otherwise the hint would show forever with no way to detect it was acted on.

### Detecting "already installed" (both platforms — the one rule that's non-negotiable)

Before showing anything, on either platform, check whether the app is
already running standalone and skip the prompt entirely if so:

- `window.matchMedia('(display-mode: standalone)').matches` — the
  standards-track check, works on Android/Chromium.
- `window.navigator.standalone === true` — the Safari-specific flag, `true`
  only when launched from the home-screen icon.

Check both (either being true means "already installed"). Getting this
wrong is the single most-cited complaint in the sources below: a returning
user who already installed, sees the same nag every visit because the app
only checked one signal or none.

## Current (2026) best-practice consensus

- **[web.dev: Patterns for promoting PWA installation](https://web.dev/articles/promote-install)**
  — the canonical guidance. Key points that carry directly into this
  recommendation: keep the promotion *outside* the user's task flow rather
  than blocking it; give it a real dismiss action and **persist that choice**
  so it doesn't reappear on every visit; only reconsider re-prompting after
  a meaningful change in the user's relationship to the app (e.g. they just
  signed in, or hit a real usage milestone) — not on a timer that fires
  regardless of behavior; and explicitly warns that stacking multiple
  promotion techniques on the same visit overwhelms and annoys users.
- **[web.dev: How to provide your own in-app install experience](https://web.dev/articles/customize-install)**
  and **[MDN: Trigger installation from your PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt)**
  — the technical howto for `beforeinstallprompt`, consistent with the
  platform split above: capture early, defer showing your UI to a moment of
  your choosing, one shot per captured event.
- **Timing**: the consistent recommendation across sources is to trigger
  after a genuine engaged moment — completing a meaningful action, a second
  or later session, signing in — never on first paint or before the visitor
  has gotten any value. One real-world reference point cited in the
  research (the Open Library project's own install-prompt design
  discussion) lands on a concrete rule of thumb: only prompt after 2+
  sessions **and** at least 30 days since any prior dismissal, both gates
  stored client-side.
- **Frequency**: show once, let it be dismissed with one tap, and persist
  that as a durable "don't ask again" flag (a `localStorage` boolean is
  the standard approach and matches what Lantern already does for onboarding
  —`berean.onboarded`— and note hints —`berean.noteHintSeen` in
  `NoteEditor.tsx`). Nothing in current guidance supports showing it more
  than once per browser profile absent a real behavior change.
- **The one universal rule**: never show an install prompt — custom or
  native — to a user who is already running standalone. Every source
  treats this as table stakes, not a nice-to-have.

## Recommendation: do not build it yet

Lantern has no data on the actual size of this problem. Nobody has measured
what fraction of readers are on browser tabs versus already installed, and
nothing in the app currently could measure it — there's no `display-mode`
telemetry signal at all (`src/telemetry/install.ts`'s "install id" is
unrelated, see above). Building a two-platform, timing-gated, persistently-
dismissible prompt UI is real surface area — new state, new localStorage
keys, new CSS, iOS-specific detection code, two independent
review/maintenance burdens — to solve a problem that is currently a guess,
at an app whose entire installed base is small enough that "some people
miss it" is anecdote, not a measured drop-off. Every best-practice source
above converges on "prompt sparingly, only after real engagement, and never
to already-installed users" — but calibrating "sparingly" and "real
engagement" for Lantern specifically needs a baseline that doesn't exist
yet.

This matches the pattern of the other proposals in this directory that
looked at a plausible-sounding feature and found the honest answer was "not
yet, for a concrete measurable reason" (`study-id.md`,
`offline-write-outbox.md`) rather than building speculative infrastructure
to solve an unmeasured problem.

**What would actually move this forward, cheaply, without building the
prompt itself:** add the one missing telemetry signal —
whether a session is running in `display-mode: standalone` (or
`navigator.standalone` on iOS) — to whatever event Lantern already emits on
app load. That's a single boolean on an existing payload, not new
infrastructure, and it turns "some people never install it" from a guess
into a number Dennis can actually look at.

### Trigger to revisit

Revisit this proposal once either holds:
- The standalone-vs-browser split (once measured, per the paragraph above)
  shows a meaningfully large fraction of *repeat* readers (people who've
  clearly gotten value — multiple sessions, notes written) are still on a
  bare browser tab, not just first-time visitors who haven't decided yet.
- Dennis hears the same "I didn't realize I could install this" feedback
  from more than one real user unprompted — the anecdote that motivated
  this brief recurring, rather than a single instance.

### If it does get built later: the shape to use

Sketched here so the follow-up task doesn't have to re-derive the design —
not being built now, but recorded so the next pass starts from a real plan:

- **Android**: capture `beforeinstallprompt` globally (e.g. a small
  singleton/hook in `src/platform/` alongside the existing native-capability
  seam, per this repo's convention of keeping platform-specific glue out of
  components — see `CLAUDE.md`'s "Pure web only" rule). Surface a single
  tasteful button/banner — reuse the existing dismissible-hint visual
  pattern (`note-hint-popover` in `NoteEditor.tsx`) rather than inventing a
  new component. Gate on: event has fired, not already standalone
  (`display-mode: standalone`), 2+ sessions, 30+ days since last dismissal,
  a new `localStorage` key (e.g. `berean.installHintSeen` /
  `berean.installHintDismissedAt`) mirroring `berean.noteHintSeen`'s
  existing seen/dismissed convention.
- **iOS Safari**: a separate, simpler component — the same dismiss/persist
  gating, no `beforeinstallprompt` involved at all — showing a static
  "Share, then Add to Home Screen" hint with the two icons named, gated on
  `navigator.standalone !== true` plus the iOS UA check above.
- **Smallest shippable slice**: the Android path first (it's the one with a
  real event to react to and a native `prompt()` to fall back on if the
  custom UI is skipped), landed with the standalone telemetry signal from
  the "what would move this forward" section above so its impact is
  measurable. iOS's static hint is a small independent follow-up, not a
  blocker for shipping Android.
- Neither piece touches `BereanApi` or Supabase — this is client-only UI
  state, same category as the existing onboarding/note-hint flags.

## Working tree

No `src/` changes were made for this brief — proposal + backlog pointer
only:

```
$ git status --short
 M docs/BACKLOG.md
?? docs/proposals/pwa-install-prompt.md
```
