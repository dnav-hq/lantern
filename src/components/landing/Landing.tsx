import React, { useState } from 'react'
import Wordmark from '../Wordmark'
import SignIn from '../SignIn'
import HeroFlythrough from './HeroFlythrough'
import FeatureClips from './FeatureClips'
import GoogleMark from './GoogleMark'
import { signInWithGoogle } from '../../api/auth'
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
// On the buttons: there is exactly ONE action here. First sign-in doubles as
// sign-up (`shouldCreateUser: true`), so the usual "Get started" vs "Sign in"
// pair would be one door wearing two labels — a SaaS funnel convention borrowed
// into a product with no funnel. The only real choice is *how* to sign in, so
// that is the only choice offered: Google (one click) or email.
//
// The guest CTA below the sign-in choices is a second, separate intent, not a
// third sign-in option (docs/proposals/guest-preview-mode.md §2a/§7): reading
// stays a legitimate destination on its own, so it gets its own "or" and its
// own quieter button rather than joining the Google/email row. Sign-in keeps
// the accent-filled primary button; the guest CTA is deliberately ghost-styled
// so the hierarchy reads at a glance without the guest path being buried.

export interface LandingProps {
  onGuestEnter: () => void
}

export default function Landing({ onGuestEnter }: LandingProps): React.JSX.Element {
  const [login, setLogin] = useState<null | { emailFirst: boolean }>(null)
  const openLogin = (): void => setLogin({ emailFirst: false })
  const openEmailLogin = (): void => setLogin({ emailFirst: true })

  const handleGoogle = async (): Promise<void> => {
    try {
      // The browser leaves for Supabase/Google here and does not come back to
      // this line. Only a client-side failure (misconfigured Supabase) lands in
      // the catch — a rejected *provider* shows as JSON on Supabase's own page,
      // which nothing here can intercept. See api/auth.ts.
      await signInWithGoogle()
    } catch {
      // Fall back to the dialog, which offers email.
      setLogin({ emailFirst: false })
    }
  }

  return (
    <div className="landing">
      <nav className="ll-nav">
        <div className="ll-wrap ll-nav-inner">
          <Wordmark size={22} />
          {/* No section links: "Four lenses" / "Find and return" only mean
              something once you have already read the page they jump to. The page
              is short enough to scroll. */}
          <button className="ll-btn ll-btn-primary" type="button" onClick={openLogin}>
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
                <button className="ll-btn ll-btn-primary" type="button" onClick={handleGoogle}>
                  {/* The white chip is the spec's own fix: Google's mark keeps its
                      own colours, which do not sit on an indigo fill. */}
                  <span className="ll-g-chip">
                    <GoogleMark />
                  </span>
                  Continue with Google
                </button>
                <button className="ll-btn ll-btn-ghost" type="button" onClick={openEmailLogin}>
                  Continue with email
                </button>
              </div>
              <p className="ll-hero-fine">Nothing to buy. Your notes stay private to you.</p>

              <div className="ll-hero-guest">
                <span className="ll-hero-guest-divider" aria-hidden="true">
                  or
                </span>
                <button className="ll-btn ll-btn-ghost" type="button" onClick={onGuestEnter}>
                  Read the Bible free — no account needed
                </button>
              </div>

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
