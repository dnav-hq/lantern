#!/usr/bin/env node
// Measures how often a word-span selected from the BSB text of a verse
// survives, VERBATIM, into the KJV and NET text of the same verse — the
// evidence behind docs/proposals/word-level-highlights.md.
//
// Reads the same self-hosted bundles the app ships for its offline fallback
// (public/bible/{bsb,kjv,net}.json.gz), so this needs no network access and
// no dependency the app doesn't already carry. Sampling and phrase selection
// are driven by a seeded PRNG (mulberry32) so a fixed SEED always reproduces
// the same sample and the same phrases — that's the whole point of running
// this as a script instead of quoting numbers in prose.
//
// Run: node scripts/measure-word-span-survival.mjs

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BIBLE_DIR = path.join(__dirname, '..', 'public', 'bible')

const SEED = 42
const SAMPLE_SIZE = 200
const MAX_PHRASE_WORDS = 3

function mulberry32(seed) {
  let a = seed
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function loadBundle(name) {
  const gz = readFileSync(path.join(BIBLE_DIR, `${name}.json.gz`))
  return JSON.parse(gunzipSync(gz).toString('utf8'))
}

// Flat, order-stable list of every non-empty verse in the bundle: book number
// ascending, then chapter ascending, then verse ascending — sampling order
// depends on this being deterministic across runs.
function allVerses(bundle) {
  const out = []
  const bookNums = Object.keys(bundle)
    .map(Number)
    .sort((a, b) => a - b)
  for (const bookNum of bookNums) {
    const chapters = bundle[String(bookNum)]
    const chapNums = Object.keys(chapters)
      .map(Number)
      .sort((a, b) => a - b)
    for (const chapNum of chapNums) {
      for (const [verseNum, text] of chapters[String(chapNum)]) {
        if (text && text.trim().length > 0) {
          out.push({ bookNum, chapNum, verseNum, text })
        }
      }
    }
  }
  return out
}

function shuffledIndices(length, rng) {
  const indices = Array.from({ length }, (_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices
}

// A 1-3 word phrase, exactly as it appears in the source text (whatever
// punctuation is attached to the boundary words) — this is what a reader
// would actually select by tapping words, not a punctuation-stripped token.
function pickPhrase(text, rng) {
  const words = text.trim().split(/\s+/)
  const maxLen = Math.min(MAX_PHRASE_WORDS, words.length)
  const len = 1 + Math.floor(rng() * maxLen)
  const start = Math.floor(rng() * (words.length - len + 1))
  return words.slice(start, start + len).join(' ')
}

function verseTextIn(bundle, bookNum, chapNum, verseNum) {
  const rows = bundle[String(bookNum)]?.[String(chapNum)]
  if (!rows) return null
  const row = rows.find(([n]) => n === verseNum)
  return row ? row[1] : null
}

function main() {
  const bsb = loadBundle('bsb')
  const kjv = loadBundle('kjv')
  const net = loadBundle('net')

  const verses = allVerses(bsb)
  const rng = mulberry32(SEED)
  const order = shuffledIndices(verses.length, rng)
  const sample = order.slice(0, SAMPLE_SIZE).map((i) => verses[i])

  let kjvHits = 0
  let netHits = 0
  const misses = { kjv: [], net: [] }

  for (const v of sample) {
    // Phrase selection consumes further draws from the SAME rng stream, in
    // sample order, so the sequence of phrases is a pure function of SEED.
    const phrase = pickPhrase(v.text, rng)
    const kjvText = verseTextIn(kjv, v.bookNum, v.chapNum, v.verseNum)
    const netText = verseTextIn(net, v.bookNum, v.chapNum, v.verseNum)
    const kjvHit = kjvText != null && kjvText.includes(phrase)
    const netHit = netText != null && netText.includes(phrase)
    if (kjvHit) kjvHits++
    else misses.kjv.push({ ref: `${v.bookNum}:${v.chapNum}:${v.verseNum}`, phrase })
    if (netHit) netHits++
    else misses.net.push({ ref: `${v.bookNum}:${v.chapNum}:${v.verseNum}`, phrase })
  }

  const pct = (hits) => ((hits / sample.length) * 100).toFixed(1)

  console.log(`seed: ${SEED}`)
  console.log(`sample size: ${sample.length}`)
  console.log(`max phrase length: ${MAX_PHRASE_WORDS} words`)
  console.log('')
  console.log(`KJV exact-match survival: ${kjvHits}/${sample.length} (${pct(kjvHits)}%)`)
  console.log(`NET exact-match survival: ${netHits}/${sample.length} (${pct(netHits)}%)`)
  console.log('')
  console.log('Sample misses (first 5 each), book:chapter:verse and phrase:')
  console.log('KJV:', JSON.stringify(misses.kjv.slice(0, 5)))
  console.log('NET:', JSON.stringify(misses.net.slice(0, 5)))
}

main()
