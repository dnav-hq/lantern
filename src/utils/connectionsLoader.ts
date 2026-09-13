// STUB — to be replaced at merge by the connections door's real loader.
//
// The doorways row (src/components/VerseDoorways.tsx) codes against exactly
// this import and signature; the real implementation, built in parallel, owns
// the cross-reference bundle and its fetch. Until it lands every verse reports
// no connections door, which the row renders as nothing — never an empty door.
export interface ConnectionsPresenceResult {
  count: number
  quotes: number
  echoes: number
  top: number
}

export async function connectionsPresence(
  _book: number,
  _chapter: number,
  _verse: number
): Promise<ConnectionsPresenceResult | null> {
  return null
}
