// Builds the self-hosted NET fallback bundle: public/bible/net.json.gz
//
// This is the offline safety net for the NET read path — the NET counterpart
// of build-kjv-bundle.mjs. See src/bible/net-self-hosted.ts for the runtime
// side.
//
// Source: https://bible.helloao.org/api/eng_net/complete.json — helloao's own
// single-request export of the complete translation (confirmed live,
// 2026-08-31: 66 books, 1,189 chapters, 31,102 verses). One request, not
// 1,189, for the same "don't hammer a free service" reason build-kjv-bundle
// gives. Same API and same response shape the live NET read path already uses,
// so there is no separate text to re-verify.
//
// LICENCE — read this before changing anything here. The NET Bible's licence
// permits quotation in electronic media without written permission, and for a
// free app the requirement is that "(NET)" appear with the quotation, linked
// to netbible.com. It grants the TEXT ONLY. The ~60,000 NET translator notes
// are explicitly EXCLUDED and are NOT ours: do not add them to this bundle,
// however useful they would be for the deep dive's word door. helloao's
// `eng_net` is the notes-free ebible.org edition, which is exactly why it is
// safe to bundle. See docs/proposals/translations-esv-niv.md (2026-08-30
// addendum, section 6). Only bare verse text is bundled, no headings or notes.
//
// Output shape, identical to bsb.json.gz's and kjv.json.gz's:
//   { "<bookNumber>": { "<chapter>": [[verse, text], ...] } }
// bookNumber is the USFM 1–66 index (Genesis = 1), taken from each book's
// `order` field in complete.json, which already matches this repo's
// convention (verified against src/bible/helloao.ts's USFM_BY_BOOK_NUMBER).
//
// Regenerate: node scripts/build-net-bundle.mjs
// Offline (reuse an already-downloaded copy): NET_JSON_PATH=/tmp/net.json node scripts/build-net-bundle.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://bible.helloao.org/api/eng_net/complete.json'
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = resolve(__dirname, '..', 'public', 'bible', 'net.json.gz')

async function loadSource() {
  const localPath = process.env.NET_JSON_PATH
  if (localPath) {
    console.error(`Reading NET JSON from ${localPath}`)
    return JSON.parse(readFileSync(localPath, 'utf8'))
  }
  console.error(`Downloading NET JSON from ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`)
  return await res.json()
}

// Mirrors src/bible/helloao.ts's flattenVerseContent, which is what serves NET
// live (HelloaoBibleProvider takes a translation code, so NET needs no network
// provider of its own). Duplicated in plain JS rather than imported, the same
// tradeoff build-bsb-bundle.mjs and build-kjv-bundle.mjs already make.
//
// The pilcrow strip is carried over from the KJV script deliberately: it is a
// no-op for NET (checked — eng_net carries none), and keeping the three
// flatteners identical is worth more than shaving a regex.
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
