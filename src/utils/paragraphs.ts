// Where paragraphs begin — the reading page's one question per verse.
//
// The reading page adds a little space before every verse that starts a
// paragraph, in EVERY translation, so the structure has to come from one
// shared source: the Berean Standard Bible's own paragraphing, built once by
// scripts/build-paragraphs.mjs into public/bible/paragraphs.json.gz (~10 KB
// gzipped, the whole Bible). The reader is never told whose paragraphing it
// is; a break is simply a break.
//
// The bundle is fetched lazily on the first chapter asked for and memoized
// for the session; a failed fetch resolves to an empty set (no breaks, the
// text still reads) and is NOT remembered, so the next chapter tries again.
//
// Nothing here may import a Node API — this file lives under src/ and obeys
// the pure-web rule in CLAUDE.md.
import { CodedError } from '../errors'

/** `{ "<bookNumber>": { "<chapter>": [verse, ...] } }` — paragraph-start verses only. */
export type ParagraphBundle = Readonly<Record<string, Readonly<Record<string, readonly number[]>>>>

const BUNDLE_URL = '/bible/paragraphs.json.gz'

const EMPTY: ReadonlySet<number> = new Set()

let bundle: Promise<ParagraphBundle> | null = null

async function fetchBundle(url: string): Promise<ParagraphBundle> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new CodedError('BIBLE_BUNDLE_FETCH_FAILED', `${res.status} ${res.statusText}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  // The gzip magic number decides, not the headers — see self-hosted.ts.
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const json = isGzip
    ? await new Response(
        new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))
      ).text()
    : new TextDecoder().decode(bytes)
  return JSON.parse(json) as ParagraphBundle
}

function load(): Promise<ParagraphBundle> {
  if (!bundle) {
    bundle = fetchBundle(BUNDLE_URL).catch(err => {
      bundle = null
      throw err
    })
  }
  return bundle
}

/** The paragraph-start verses of one chapter, read out of a bundle. Pure. */
export function paragraphStartsFrom(
  data: ParagraphBundle,
  book: number,
  chapter: number
): ReadonlySet<number> {
  const list = data[String(book)]?.[String(chapter)]
  return list && list.length ? new Set(list) : EMPTY
}

/**
 * The verses of a chapter that begin a paragraph (verse 1 always among them
 * when the chapter is known). Never throws: an empty set on any failure.
 */
export async function loadParagraphStarts(
  book: number,
  chapter: number
): Promise<ReadonlySet<number>> {
  try {
    return paragraphStartsFrom(await load(), book, chapter)
  } catch {
    return EMPTY
  }
}

/** Test seam. */
export function resetParagraphs(): void {
  bundle = null
}
