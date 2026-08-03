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

// ─── Memory (dev) path ───────────────────────────────────────────────────────
function MemoryRoot(): React.ReactElement {
  const [api] = useState<BereanApi>(() => {
    const a = createMemoryApi()
    seedMemoryApi()
    return a
  })
  return (
    <ApiProvider api={api}>
      <App displayName={null} onSignOut={null} />
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
      else setPhase(signedOutPhase())
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
        <Landing />
        {/* TEMPORARY entry into guest mode. The real, designed CTA belongs in
            the landing hero and is its own task (G3, proposal §7); this exists
            so the guest tree is reachable and reviewable now, without editing
            the landing page out from under that task. */}
        <button
          type="button"
          className="guest-entry-fab"
          onClick={() => {
            enterGuestMode()
            setPhase('guest')
          }}
        >
          Read the Bible free — no account needed
        </button>
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
