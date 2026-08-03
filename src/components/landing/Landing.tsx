import React, { useState } from 'react'
import Wordmark from '../Wordmark'
import SignIn from '../SignIn'
import HeroFlythrough from './HeroFlythrough'
import FeatureClips from './FeatureClips'
import '../../assets/landing.css'

// The public landing page — what an unauthenticated visitor sees. Root's
// signedOut phase used to render a bare SignIn screen with no explanation of
// what the app is; this is that explanation, with sign-in behind a CTA.
//
// Ported from the approved specs in design/ (see design/README.md):
//   - design/lantern-mockup.html   — layout, copy, login direction
//   - design/lantern-hero.html     — the hero animation
//   - design/lantern-features.html — the three feature clips
//
// Deliberate deviations from lantern-mockup.html, which predates two later
// decisions (both noted in BACKLOG):
//   - It draws the retired book+beacon pictorial mark in the nav, footer, and
//     login card. The identity is wordmark-only, so those are <Wordmark />.
//   - Its hero is a static annotated card with its own small CSS animation,
//     superseded by lantern-hero.html's approved flythrough.
//   - Its static "Four lenses" and "Read. Note. Return." sections are replaced
//     by the three feature clips, one of which is Four lenses (owner's call —
//     newest spec wins, no duplicated section).
//
// Two intents, one primary each. Someone ready to commit takes the single
// "Start your study" primary, which opens the sign-in dialog — the place the
// *method* choice (Google or email) actually belongs, deferred until after the
// intent, so the hero is one button rather than a row of method choices.
// Someone who only wants to look takes the quiet "Read without signing in" link
// into the guest reader. Sign-in stays the visually dominant path; reading is
// free beside it, and the account is a benefit (keeping your study), never a
// wall. First sign-in still doubles as sign-up inside the dialog.

interface LandingProps {
  /** Enter the signed-out guest reader (Root flips to its `guest` phase). */
  onReadAsGuest: () => void
}

export default function Landing({ onReadAsGuest }: LandingProps): React.JSX.Element {
  const [login, setLogin] = useState<null | { emailFirst: boolean }>(null)
  const openLogin = (): void => setLogin({ emailFirst: false })

  return (
    <div className="landing">
      <nav className="ll-nav">
        <div className="ll-wrap ll-nav-inner">
          <Wordmark size={22} />
          {/* No section links: "Four lenses" / "Find and return" only mean
              something once you have already read the page they jump to. The page
              is short enough to scroll. */}
          {/* Secondary next to the hero's filled primary: this is the returning
              visitor's door, not the page's main call to action. */}
          <button className="ll-btn ll-btn-ghost" type="button" onClick={openLogin}>
            Sign in
          </button>
        </div>
      </nav>

      <section className="ll-hero-sec">
        <div className="ll-wrap">
          <div className="ll-hero-grid">
            <div className="ll-hero-copy">
              <span className="eyebrow">Personal Bible study notes</span>
              <h1 className="ll-h1 serif">
                Keep what you see
                <br />
                in the <span className="ll-lamp">light</span> of the Word.
              </h1>
              <p className="ll-lead">
                Lantern is a calm reading Bible with a place to write. Notice something, look up the
                history, apply it, sit with it. Your study stays beside the verse, ready the next
                time you open the passage.
              </p>
              <div className="ll-hero-actions">
                <button
                  className="ll-btn ll-btn-primary ll-btn-lg"
                  type="button"
                  onClick={openLogin}
                >
                  Get started
                </button>
                {/* The quieter second intent, inline to the right of the primary
                    (the conventional place for a subordinate action). Kept short
                    and lighter than the primary on purpose: a longer, more
                    articulate label here would out-weigh "Get started" and read
                    as the main action. Exploration register ("take a look"), not
                    the mechanic ("without signing in"), and no arrow — both would
                    hand it weight it should not have. */}
                <button className="ll-guest-link" type="button" onClick={onReadAsGuest}>
                  Take a look first
                </button>
              </div>
              <p className="ll-hero-fine">Nothing to buy. Your notes stay private to you.</p>
              <div className="ll-hero-verse">
                <span className="ll-v serif">
                  "Your word is a lamp to my feet and a light to my path."
                </span>
                <span className="ll-cite">Psalm 119:105</span>
              </div>
            </div>

            <HeroFlythrough />
          </div>
        </div>
      </section>

      <div className="ll-wrap ll-features">
        <FeatureClips />
      </div>

      {/* Why it exists, in a plain voice. This is the section that separates a
          tool from a product: no feature is being sold here. */}
      <section className="ll-name" id="name">
        <div className="ll-wrap ll-name-grid">
          <div className="ll-name-head">
            <span className="eyebrow">The name</span>
            <h2 className="serif">A lamp to my feet, not a floodlight.</h2>
          </div>
          <div className="ll-name-body">
            <p>
              Psalm 119:105 is where the name comes from. A lantern is something you carry. It
              lights the step in front of you, which is usually all you need to keep walking.
            </p>
            <p>
              I built Lantern because my own study kept getting lost. Notes in one app, verses in
              another, and nothing where I left it when I came back to a passage a year later. This
              is the tool I wanted: quiet, private, and always beside the text.
            </p>
          </div>
        </div>
      </section>

      <section className="ll-cta">
        <div className="ll-wrap">
          <div className="ll-cta-inner">
            <div>
              <h2 className="serif">Ready when you are.</h2>
              <p>One passage and a few notes. It will be here when you come back.</p>
            </div>
            <button className="ll-btn ll-btn-primary ll-btn-lg" type="button" onClick={openLogin}>
              Start your first study
            </button>
          </div>
        </div>
      </section>

      <footer className="ll-footer">
        <div className="ll-wrap ll-foot">
          <Wordmark size={18} />
          {/* Standalone static pages served by Cloudflare Pages (public/*.html),
              so plain anchors that navigate away from the SPA. */}
          {/* /about is also the URL configured as the OAuth "Application home
              page", and Search Console reported it with "Referring page: None
              detected" — an orphan page Google never discovered. Linking it from
              the landing gives it a referring page. */}
          {/* Absolute URLs on purpose: Google's app-homepage requirement says the
              privacy link on the homepage must MATCH the link configured on the
              OAuth consent screen, which is absolute. A relative "/privacy" does
              not match a checker comparing hrefs against that exact value. */}
          <nav className="ll-foot-links" aria-label="Footer">
            <a href="https://lanternword.com/about">About</a>
            <a href="https://lanternword.com/terms">Terms</a>
            <a href="https://lanternword.com/privacy">Privacy</a>
          </nav>
          <div>Personal Bible study notes. © 2026</div>
        </div>
      </footer>

      {login && <SignIn onClose={() => setLogin(null)} emailFirst={login.emailFirst} />}
    </div>
  )
}
