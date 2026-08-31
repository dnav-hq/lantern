import type { BibleProvider, BibleVerseLine } from './provider'
import { CodedError } from '../errors'

// The self-hosted complete-NET fallback — the NET counterpart of
// self-hosted.ts (BSB) and kjv-self-hosted.ts. The helloao network provider is
// PRIMARY; this exists so a helloao outage never takes the NET read path down
// with it. Composition is
// FallbackBibleProvider(cache(HelloaoBibleProvider('eng_net')), NetSelfHosted).
//
// LAZY BY DESIGN, same as the other two: the bundle is only fetched after the
// primary throws, and the parsed result is memoized for the session.
//
// LICENCE, and this is the load-bearing part: the NET Bible's licence grants
// the TEXT only. The ~60,000 NET translator notes are explicitly EXCLUDED and
// are NOT ours to ship — do not add them to this bundle or fetch them at
// runtime, however tempting they are for the deep dive's word door. The
// helloao `eng_net` edition is the notes-free ebible.org text, which is why it
// is safe to bundle. Attribution renders in TranslationFooter's FinePrint and
// is not optional. See docs/proposals/translations-esv-niv.md (2026-08-30
// addendum, section 6).
//
// This is the third near-identical copy of this class (BSB, KJV, NET), which
// is a deliberate repeat of the choice kjv-self-hosted.ts already made: mirror
// rather than share, so the BSB path stays byte-identical. Worth unifying if a
// fourth ever appears — noted in docs/BACKLOG.md.

type NetBundle = Record<string, Record<string, [number, string][]>>

const BUNDLE_URL = '/bible/net.json.gz'

// Decompression is decided by the BYTES received, never headers — see
// self-hosted.ts's fetchBundle comment for why (gzip magic number 1f 8b vs.
// JSON's leading '{' = 0x7b never collide).
async function fetchBundle(url: string): Promise<NetBundle> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new CodedError('BIBLE_BUNDLE_FETCH_FAILED', `NET ${res.status} ${res.statusText}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const json = isGzip
    ? await new Response(
        new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))
      ).text()
    : new TextDecoder().decode(bytes)
  return JSON.parse(json) as NetBundle
}

export class NetSelfHostedBibleProvider implements BibleProvider {
  private bundle: Promise<NetBundle> | null = null

  constructor(
    private readonly url: string = BUNDLE_URL,
    private readonly loader: (url: string) => Promise<NetBundle> = fetchBundle
  ) {}

  private load(): Promise<NetBundle> {
    if (!this.bundle) this.bundle = this.loader(this.url)
    return this.bundle
  }

  async getChapter(bookNumber: number, chapter: number): Promise<BibleVerseLine[]> {
    const bundle = await this.load()
    const verses = bundle[String(bookNumber)]?.[String(chapter)]
    if (!verses) {
      throw new CodedError(
        'BIBLE_BUNDLE_CHAPTER_MISSING',
        `NET: no book ${bookNumber} chapter ${chapter}`
      )
    }
    return verses.map(([verse, text]) => ({ verse, text }))
  }
}
