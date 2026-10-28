import { createContext, useContext } from 'react'

// Whether the App is running as a signed-OUT guest (the in-memory backend, see
// Root.tsx's `guest` phase). A guest gets the whole product, but a few
// affordances are deliberately narrowed — most notably the translation picker,
// which must not SELECT ESV (a key-proxied, shared-quota path a guest has no
// account key for; see useTranslation.ts's GUEST_TRANSLATIONS). Provided once
// at the App root from the presence of the guestSignIn callback, so any reading
// surface can ask without threading a prop through every layer.
export const GuestContext = createContext(false)

export function useIsGuest(): boolean {
  return useContext(GuestContext)
}

// The guest's way in: the same sign-in handoff NavBar and ProfilePage get as a
// prop, made reachable from deep reading surfaces (the locked ESV row in the
// translation pickers) without threading it through App. A SEPARATE context
// from GuestContext so the boolean's existing callers are untouched; Root
// provides it around App in the guest phase. Null when not a guest.
export const GuestSignInContext = createContext<(() => void) | null>(null)

export function useGuestSignIn(): (() => void) | null {
  return useContext(GuestSignInContext)
}
