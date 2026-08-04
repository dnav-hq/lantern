import React, { Suspense, lazy, useEffect, useState } from 'react'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import Onboarding from './components/Onboarding'
import { ApiProvider } from './api/context'
import { createMemoryApi, seedMemoryApi } from './api/memory'
import { supabase, isSupabaseConfigured } from './api/supabase'
import { SupabaseBereanApi } from './api/berean-api'
import { getProfile, getSession, onAuthStateChange, signOut, type Profile } from './api/auth'
import { enterGuestMode, exitGuestMode, isGuestMode } from './components/guestMode'
import type { BereanApi, UserSettings } from './api/types'
import { parseDeepLink, type DeepLinkTarget } from './utils/deepLink'

// Root decides which backend the app runs against:
//   - Supabase configured -> auth-gated app (sign-in -> onboarding -> App).
//   - otherwise            -> in-memory stub (dev fallback), with a console warning.

// `guest` is a signed-OUT phase, not a lesser signed-in one: it renders
// OUTSIDE ApiProvider, which is the whole guest boundary
// (docs/proposals/guest-preview-mode.md §4). Anything touching an account or
// stored data lives in `ready` and is therefore unreachable from `guest` by
// construction rather than by a check — a new feature is gated by default and
// only becomes guest-visible by being deliberately placed in this tree.
type Phase = 'loading' | 'signedOut' | 'guest' | 'onboarding' | 'ready'

// The landing page is the signed-out surface: marketing copy, four looping
// animation clips, and its own stylesheet. Lazy so a signed-in user — who never
// sees it — does not download any of that to reach their notes.
const Landing = lazy(() => import('./components/landing/Landing'))

// Same reasoning in reverse: a signed-in user never renders the guest reader,
// so it stays out of their bundle until something actually enters guest mode.
const GuestReader = lazy(() => import('./components/GuestReader'))

// Where a session-less visitor lands: the guest reader if this browser chose it
// (a reload or a PWA relaunch returns to scripture, not the wall), otherwise the
// landing page. A real session always wins — signing in is never downgraded to
// guest, because `enter()` runs on any session regardless of the flag.
function signedOutPhase(): Phase {
  return isGuestMode() ? 'guest' : 'signedOut'
}

// G4a (docs/BACKLOG.md, docs/proposals/guest-preview-mode.md §7): read once at
// startup, module-level rather than in a hook, because v1 is on-load parsing
// ONLY — there is no pushState-as-you-navigate to keep this in sync with, so
// re-deriving it on a later render would be pointless. A miss (unknown book,
// out-of-range chapter, anything malformed) is just `null`, and every reader
// below already has a no-deep-link path — that's the whole degrade story.
const deepLinkTarget: DeepLinkTarget | null = parseDeepLink(window.location.pathname)

// ─── Memory (dev) path ───────────────────────────────────────────────────────
function MemoryRoot(): React.ReactElement {
  const [api] = useState<BereanApi>(() => {
    const a = createMemoryApi()
    seedMemoryApi()
    return a
  })
  return (
    <ApiProvider api={api}>
      <App displayName={null} onSignOut={null} initialDeepLink={deepLinkTarget} />
    </ApiProvider>
  )
}

// ─── Supabase (auth-gated) path ──────────────────────────────────────────────
function SupabaseRoot(): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('loading')
  const [api, setApi] = useState<BereanApi | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  // Account-synced preferences (docs/proposals/guest-preview-mode.md §2b):
  // fetched once here, at the same profile-load point as `profile` itself, and
  // handed to App as a prop so it can seed-or-hydrate on first render rather
  // than flashing local values before an async fetch resolves.
  const [accountSettings, setAccountSettings] = useState<UserSettings | null>(null)

  // Resolve api + profile for a signed-in user and pick the phase.
  const enter = React.useCallback(async (): Promise<void> => {
    try {
      const nextApi = await SupabaseBereanApi.create(supabase!)
      const [prof, settings] = await Promise.all([
        getProfile(),
        nextApi.getSettings().catch(() => ({}) as UserSettings)
      ])
      setApi(nextApi)
      setProfile(prof)
      setAccountSettings(settings)
      const done = prof?.onboarding_done || localStorage.getItem('berean.onboarded') === '1'
      setPhase(done ? 'ready' : 'onboarding')
    } catch {
      setPhase('signedOut')
    }
  }, [])

  useEffect(() => {
    let active = true
    getSession().then(session => {
      if (!active) return
      if (session) void enter()
      else {
        // A deep link always opens guest reading with no wall (G4a,
        // guest-preview-mode.md §7) — including for a first-ever visitor who
        // never tapped "Read as guest" and so has no persisted flag yet.
        if (deepLinkTarget) enterGuestMode()
        setPhase(signedOutPhase())
      }
    })
    const unsub = onAuthStateChange(user => {
      if (!active) return
      if (user) void enter()
      else {
        setApi(null)
        setProfile(null)
        setPhase(signedOutPhase())
      }
    })
    return () => {
      active = false
      unsub()
    }
  }, [enter])

  const handleSignOut = async (): Promise<void> => {
    await signOut()
  }

  if (phase === 'loading') {
    return <div className="app-boot" />
  }

  if (phase === 'signedOut') {
    return (
      <Suspense fallback={<div className="app-boot" />}>
        <Landing
          onReadAsGuest={() => {
            enterGuestMode()
            setPhase('guest')
          }}
        />
      </Suspense>
    )
  }

  if (phase === 'guest') {
    // Rendered OUTSIDE ApiProvider on purpose — see the Phase comment above.
    return (
      <Suspense fallback={<div className="app-boot" />}>
        <GuestReader
          onSignIn={() => {
            // Starting the sign-in flow leaves guest mode for good: the landing
            // page is where the real sign-in CTAs live, and a later reload must
            // not bounce a half-signed-in visitor back into the guest reader.
            exitGuestMode()
            setPhase('signedOut')
          }}
          initialLocation={deepLinkTarget}
        />
      </Suspense>
    )
  }

  if (phase === 'onboarding') {
    return (
      <Onboarding
        onDone={() => {
          void getProfile().then(setProfile)
          setPhase('ready')
        }}
      />
    )
  }

  // ready
  return (
    <ApiProvider api={api!}>
      <App
        displayName={profile?.display_name || null}
        onSignOut={handleSignOut}
        accountSettings={accountSettings}
        initialDeepLink={deepLinkTarget}
      />
    </ApiProvider>
  )
}

export default function Root(): React.ReactElement {
  if (isSupabaseConfigured) {
    return (
      <ErrorBoundary variant="app">
        <SupabaseRoot />
      </ErrorBoundary>
    )
  }
  console.warn(
    '[berean] Supabase env vars absent — running on the in-memory stub. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use the real backend.'
  )
  return (
    <ErrorBoundary variant="app">
      <MemoryRoot />
    </ErrorBoundary>
  )
}
