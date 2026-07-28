// Builds the self-hosted KJV fallback bundle: public/bible/kjv.json.gz
//
// This is the offline safety net for the KJV read path — the KJV counterpart
// of build-bsb-bundle.mjs. See src/bible/kjv-self-hosted.ts for the runtime
// side.
//
// Source: https://bible.helloao.org/api/eng_kjv/complete.json — helloao's own
// single-request export of the complete translation (confirmed live,
// 2026-07-22: 66 books, no Apocrypha, plain verse text with no study notes).
// One request, not 1,189 (the same "don't hammer a free service" reasoning
// build-bsb-bundle.mjs uses for bsb.txt) — and unlike guessing at a bare
// plain-text mirror, this is the exact same public-domain KJV text (the 2006
// eBible.org revision) that kjv.ts already serves live, so there is no
// separate licensing question to re-check.
//
// Licensing: the King James Version is public domain in the US (and
// everywhere but the UK, which has no bearing on a US-hosted app with no
// UK-specific distribution) — see docs/proposals/translations-esv-niv.md
// section 1 ("KJV — zero friction"). Only the bare verse text is bundled, no
// headings/notes, matching that brief's apparatus caveat.
//
// Output shape, identical to bsb.json.gz's:
//   { "<bookNumber>": { "<chapter>": [[verse, text], ...] } }
// bookNumber is the USFM 1–66 index (Genesis = 1), taken from each book's
// `order` field in complete.json, which already matches this repo's
// convention (verified against src/bible/helloao.ts's USFM_BY_BOOK_NUMBER).
//
// Regenerate: node scripts/build-kjv-bundle.mjs
// Offline (reuse an already-downloaded copy): KJV_JSON_PATH=/tmp/kjv.json node scripts/build-kjv-bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://bible.helloao.org/api/eng_kjv/complete.json'
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(__dirname, '..', 'public', 'bible', 'kjv.json.gz')

async function loadSource() {
  const localPath = process.env.KJV_JSON_PATH
  if (localPath) {
    console.error(`Reading KJV JSON from ${localPath}`)
    return JSON.parse(readFileSync(localPath, 'utf8'))
  }
  console.error(`Downloading KJV JSON from ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`)
  return await res.json()
}

// Mirrors src/bible/kjv.ts's flattenVerseContent exactly (this script has no
// access to the browser fetch/DecompressionStream context that module lives
// in, so the logic is duplicated in plain JS rather than imported — the same
// tradeoff build-bsb-bundle.mjs already makes by not importing self-hosted.ts).
function flattenVerseContent(content) {
  const parts = []
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item)
    } else if (item && typeof item === 'object' && 'text' in item) {
      parts.push(item.text)
    }
  }
  return parts
    .join(' ')
    .replace(/^¶\s*/, '')
    .replace(/\s+([,.;:!?”’])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const data = await loadSource()

const bundle = {}
let verseCount = 0
let skippedEmpty = 0
const seenBooks = new Set()

for (const book of data.books) {
  const bookNumber = book.order
  for (const ch of book.chapters) {
    const chapterNumber = ch.chapter.number
    const verses = []
    for (const node of ch.chapter.content) {
      if (node.type !== 'verse' || node.number === undefined || !node.content) continue
      const text = flattenVerseContent(node.content)
      if (!text) {
        skippedEmpty++
        continue
      }
      verses.push([node.number, text])
    }
    if (verses.length === 0) continue
    seenBooks.add(bookNumber)
    const bundleBook = (bundle[bookNumber] ??= {})
    bundleBook[chapterNumber] = verses
    verseCount += verses.length
  }
}

if (seenBooks.size !== 66) {
  throw new Error(`Expected 66 books, parsed ${seenBooks.size}`)
}

const chapterCount = Object.values(bundle).reduce(
  (sum, book) => sum + Object.keys(book).length,
  0
)

const json = JSON.stringify(bundle)
const gz = gzipSync(json, { level: 9 })

mkdirSync(dirname(OUT_PATH), { recursive: true })
writeFileSync(OUT_PATH, gz)

console.error(
  `Wrote ${OUT_PATH}\n` +
    `  books:    ${seenBooks.size}\n` +
    `  chapters: ${chapterCount}\n` +
    `  verses:   ${verseCount} (skipped ${skippedEmpty} empty verses)\n` +
    `  json:     ${json.length} bytes\n` +
    `  gzip:     ${gz.length} bytes (${(gz.length / 1024).toFixed(0)} KB)`
)
