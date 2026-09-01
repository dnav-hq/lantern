import type { BibleProvider, BibleVerseLine } from './provider'
import { CodedError } from '../errors'

// The self-hosted complete-BSB fallback. helloao.ts is the PRIMARY scripture
// source; this provider exists so that helloao being down never takes the read
// path down with it — it can serve any of the 1,189 chapters from a bundle we
// ship ourselves (public/bible/bsb.json.gz, built by scripts/build-bsb-bundle.mjs).
//
// LAZY BY DESIGN. The bundle is ~1.2 MB gzip. We never fetch it on a normal,
// successful read — the FallbackBibleProvider only calls this provider after the
// primary throws. The first such call downloads and decompresses the bundle
// once; the parsed result is memoized for the rest of the session, so a helloao
// outage costs a single download no matter how many chapters are then read.
//
// WHY THIS SITS OUTSIDE THE CACHE (deliberate, and different from fixture.ts):
// fixture.ts must live outside the cache-forever layer because a fixture answer
// written into that store would masquerade as real scripture forever. That
// hazard does NOT apply here — this bundle is the complete, real BSB text, the
// same translation helloao serves, so caching a self-hosted answer would be
// perfectly safe. We still keep it outside the cache anyway, for a simpler
// reason: it keeps one clean invariant — the IndexedDB cache mirrors *helloao*
// and nothing else — and this provider already memoizes the whole Bible in
// memory on first use, so routing its answers through the cache would buy no
// speed. Composition is therefore FallbackBibleProvider(cache(helloao), selfHosted).

type BsbBundle = Record<string, Record<string, [number, string][]>>

const BUNDLE_URL = '/bible/bsb.json.gz'

// Fetch + parse the bundle. Split out (and injectable via the constructor) so
// the parsing/lookup logic can be unit-tested without a real network fetch or a
// DecompressionStream.
//
// Decompression is decided by the BYTES we actually receive, never by headers or
// the host's conventions — because hosts disagree about a `.gz` file. Vite's dev
// server tags it `Content-Encoding: gzip`, so the browser transparently
// decompresses and hands us plain JSON; other hosts (and Cloudflare Pages, when
// serving a `.gz` opaquely) hand back the raw gzip stream untouched. Sniffing
// the gzip magic number (1f 8b) — which JSON, always starting with `{` = 0x7b,
// can never collide with — makes this correct in both cases instead of green
// here and broken in production.
async function fetchBundle(url: string): Promise<BsbBundle> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new CodedError('BIBLE_BUNDLE_FETCH_FAILED', `${res.status} ${res.statusText}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const json = isGzip
    ? await new Response(
        new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))
      ).text()
    : new TextDecoder().decode(bytes)
  return JSON.parse(json) as BsbBundle
}

export class SelfHostedBibleProvider implements BibleProvider {
  private bundle: Promise<BsbBundle> | null = null

  constructor(
    private readonly url: string = BUNDLE_URL,
    private readonly loader: (url: string) => Promise<BsbBundle> = fetchBundle
  ) {}

  private load(): Promise<BsbBundle> {
    // Memoize the promise (not just the value) so concurrent first reads share
    // one download instead of racing several.
    if (!this.bundle) this.bundle = this.loader(this.url)
    return this.bundle
  }

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    const bundle = await this.load()
    const verses = bundle[String(bookNumber)]?.[String(chapter)]
    if (!verses) {
      // Book + chapter is a passage reference — detail only. See src/errors.ts.
      throw new CodedError(
        'BIBLE_BUNDLE_CHAPTER_MISSING',
        `no book ${bookNumber} chapter ${chapter}`
      )
    }
    // NO FOOTNOTES, DELIBERATELY. The bundle stores [verse, text] pairs, so a
    // chapter served during a helloao outage simply has no `notes` — no doors,
    // no empty state, no error. That is the right degradation and it needs no
    // code: rebuilding the bundles to carry notes is explicitly not rung one
    // (docs/proposals/footnotes-door.md §5.5).
    return verses.map(([verse, text]) => ({ verse, text }))
  }
}
