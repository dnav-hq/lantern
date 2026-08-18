// Client-generated UUID v4 for every id (see docs/ARCHITECTURE.md — Tier-1
// offline-sync readiness: ids are minted on the client, not by the server).
//
// `crypto.randomUUID()` is the ideal source, but it exists ONLY in a secure
// context (HTTPS or localhost). Over a plain-http LAN IP — e.g. a phone hitting
// the dev server at http://192.168.x.x:5173 — it is `undefined`, so calling it
// threw at boot (the memory stub seeds sample data with a uuid on first paint)
// and the whole app fell into the error boundary. Production is always HTTPS, so
// that path never runs there; this fallback just stops the app hard-crashing in
// an insecure context.
//
// The fallback stays cryptographically strong: `crypto.getRandomValues()` is
// available in insecure contexts too (only `randomUUID`/`subtle` are gated), so
// only a truly ancient environment reaches the Math.random path.
export function uuid(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()

  const bytes = new Uint8Array(16)
  if (c?.getRandomValues) {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  // RFC 4122 §4.4: pin the version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'))
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  )
}
