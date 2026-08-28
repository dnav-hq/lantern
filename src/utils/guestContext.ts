import { createContext, useContext } from 'react'

// Whether the App is running as a signed-OUT guest (the ephemeral in-memory
// backend, see Root.tsx's `guest` phase). A guest gets the whole product, but a
// few affordances are deliberately narrowed — most notably the translation
// picker, which must not offer ESV (a key-proxied, shared-quota path a guest has
// no account key for; see useTranslation.ts's GUEST_TRANSLATIONS). Provided once
// at the App root from the presence of the guestSignIn callback, so any reading
// surface can ask without threading a prop through every layer.
export const GuestContext = createContext(false)

export function useIsGuest(): boolean {
  return useContext(GuestContext)
}
