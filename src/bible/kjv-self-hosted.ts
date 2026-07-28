import type { BibleProvider, BibleVerseLine } from './provider'
import { CodedError } from '../errors'

// The self-hosted complete-KJV fallback — the KJV counterpart of
// self-hosted.ts. kjv.ts (helloao) is the PRIMARY source; this exists so a
// helloao outage never takes the KJV read path down with it, exactly the same
// reasoning as BSB's self-hosted fallback. Composition is
// FallbackBibleProvider(cache(KjvBibleProvider), KjvSelfHostedBibleProvider).
//
// LAZY BY DESIGN, same as self-hosted.ts: the bundle is only fetched after the
// primary throws, and the parsed result is memoized for the session.
//
// Kept as its own file (mirroring, not sharing code with, self-hosted.ts) so
// BSB's fallback stays completely untouched by this change — see CLAUDE.md's
// "byte-identical to today" requirement for the BSB path.

type KjvBundle = Record<string, Record<string, [number, string][]>>

const BUNDLE_URL = '/bible/kjv.json.gz'

// Decompression is decided by the BYTES received, never headers — see
// self-hosted.ts's fetchBundle comment for why (gzip magic number 1f 8b vs.
// JSON's leading '{' = 0x7b never collide).
async function fetchBundle(url: string): Promise<KjvBundle> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new CodedError('BIBLE_BUNDLE_FETCH_FAILED', `KJV ${res.status} ${res.statusText}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const json = isGzip
    ? await new Response(
        new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))
      ).text()
    : new TextDecoder().decode(bytes)
  return JSON.parse(json) as KjvBundle
}

export class KjvSelfHostedBibleProvider implements BibleProvider {
  private bundle: Promise<KjvBundle> | null = null

  constructor(
    private readonly url: string = BUNDLE_URL,
    private readonly loader: (url: string) => Promise<KjvBundle> = fetchBundle
  ) {}

  private load(): Promise<KjvBundle> {
    if (!this.bundle) this.bundle = this.loader(this.url)
    return this.bundle
  }

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    const bundle = await this.load()
    const verses = bundle[String(bookNumber)]?.[String(chapter)]
    if (!verses) {
      throw new CodedError(
        'BIBLE_BUNDLE_CHAPTER_MISSING',
        `KJV: no book ${bookNumber} chapter ${chapter}`
      )
    }
    return verses.map(([verse, text]) => ({ verse, text }))
  }
}
