// Builds the PARAGRAPH BREAK bundle — public/bible/paragraphs.json.gz.
//
// The reading page adds a little space before every verse that begins a
// paragraph, in EVERY translation. The structure comes from one source, the
// Berean Standard Bible's own paragraphing, so the breaks fall in the same
// places whatever text is on screen; the reader is never told whose
// paragraphing it is. Shaped after scripts/build-setting-lines.mjs: a pinned
// public-domain source, the derived artefact committed, the source data not.
//
// NOTHING HERE CALLS A MODEL. There is no inference in this pipeline at all:
// a verse starts a paragraph exactly when the BSB feed says so.
//
// SOURCE
//   BSB complete.json (public domain — berean.bible/licensing.htm; helloao adds
//   "no copyright restrictions whatsoever"). Each chapter's `content` array
//   interleaves {type:'verse', number} nodes with {type:'line_break'},
//   {type:'heading'} and {type:'hebrew_subtitle'} nodes. A verse STARTS a
//   paragraph when it is the first verse of the chapter, or when any of those
//   three non-verse nodes sits between it and the previous verse. (The
//   `lineBreak` markers INSIDE a verse's content are poem lines, not
//   paragraphs, and are ignored.)
//
// OUTPUT
//   { "<bookNumber>": { "<chapter>": [verse, verse, ...] } } — only the verses
//   that start a paragraph, verse 1 always included, sorted ascending. Read by
//   src/utils/paragraphs.ts.
//
// Usage:
//   node scripts/build-paragraphs.mjs          # or: npm run build:paragraphs
//   CACHE_DIR=/tmp/sl node scripts/build-paragraphs.mjs
//   NO_NETWORK=1 node scripts/build-paragraphs.mjs   # cache only; fails loudly if cold
//
// The cache (default .cache/setting-line, which .gitignore already covers) is
// the SAME directory and file name scripts/build-setting-lines.mjs uses for
// complete.json, so whichever build runs first warms the other. Cold it
// downloads ~28 MB once; warm it is offline and takes a few seconds.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const CACHE = process.env.CACHE_DIR
  ? resolve(process.env.CACHE_DIR)
  : resolve(REPO, '.cache', 'setting-line')
const NO_NETWORK = process.env.NO_NETWORK === '1'

const BSB_COMPLETE_URL = 'https://bible.helloao.org/api/BSB/complete.json'
const OUT = resolve(REPO, 'public', 'bible', 'paragraphs.json.gz')

/** The shipped bundle stays under this, gzipped. */
const SIZE_BUDGET_KB = 60

/** Node types that, between two verses, make the second one start a paragraph. */
const BREAKERS = new Set(['line_break', 'heading', 'hebrew_subtitle'])

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`

async function cached(name, url) {
  const path = resolve(CACHE, name)
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  if (NO_NETWORK) throw new Error(`NO_NETWORK=1 but ${name} is not cached in ${CACHE}`)
  process.stderr.write(`fetching ${url} (~28 MB, once)…\n`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const text = await res.text()
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(path, text)
  return JSON.parse(text)
}

/** The paragraph-start verses of one chapter's content array. Pure. */
export function paragraphStarts(content) {
  const starts = []
  let pending = true // verse 1 of the chapter always starts a paragraph
  let last = -1
  for (const node of content) {
    if (BREAKERS.has(node.type)) {
      pending = true
    } else if (node.type === 'verse' && typeof node.number === 'number') {
      if (node.number <= last) continue // a repeated verse node never starts anew
      if (pending) starts.push(node.number)
      pending = false
      last = node.number
    }
  }
  return starts
}

async function main() {
  const data = await cached('bsb-complete.json', BSB_COMPLETE_URL)

  const bundle = {}
  let chapters = 0
  let verses = 0
  let starts = 0
  for (const book of data.books) {
    const byChapter = {}
    for (const ch of book.chapters) {
      const content = ch.chapter.content
      const list = paragraphStarts(content)
      byChapter[ch.chapter.number] = list
      chapters++
      verses += content.filter(n => n.type === 'verse').length
      starts += list.length
    }
    bundle[book.order] = byChapter
  }

  const json = JSON.stringify(bundle)
  const gz = gzipSync(Buffer.from(json), { level: 9 })
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, gz)

  // Read the written file back for the sanity check, so the report describes
  // what shipped and not what was in memory.
  const written = JSON.parse(gunzipSync(readFileSync(OUT)))
  const show = (book, chapter, label) =>
    console.log(`  ${label.padEnd(12)}: ${(written[book]?.[chapter] ?? []).join(' ')}`)

  console.log(`\n=== paragraph breaks — public/bible/paragraphs.json.gz ===`)
  console.log(`  books / chapters / verses : ${data.books.length} / ${chapters} / ${verses}`)
  console.log(
    `  paragraph starts          : ${starts} (${((starts / verses) * 100).toFixed(1)}% of verses)`
  )
  console.log(`  raw JSON                  : ${kb(Buffer.byteLength(json))}`)
  console.log(`  gzip -9 (shipped)         : ${kb(gz.length)}  (budget ${SIZE_BUDGET_KB} KB)`)
  console.log(`\n--- sanity ---`)
  show(1, 1, 'Genesis 1')
  show(19, 23, 'Psalm 23')
  show(43, 3, 'John 3')

  const failures = []
  if (chapters !== 1189) failures.push(`expected 1189 chapters, built ${chapters}`)
  for (const book of Object.keys(written)) {
    for (const [chapter, list] of Object.entries(written[book])) {
      if (list[0] !== 1) failures.push(`${book}/${chapter} does not start at verse 1`)
    }
  }
  if (gz.length / 1024 > SIZE_BUDGET_KB) {
    failures.push(`bundle is ${kb(gz.length)}, over the ${SIZE_BUDGET_KB} KB budget`)
  }
  if (failures.length) {
    console.error(`\nFAILED:\n  - ${failures.slice(0, 10).join('\n  - ')}`)
    process.exit(1)
  }
  console.log(`\nOK — ${kb(gz.length)} gzipped.`)
}

await main()
