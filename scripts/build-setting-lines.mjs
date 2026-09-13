// Builds the SETTING LINE bundle — public/bible/connections/settings.json.gz.
//
// Slice 1 of docs/proposals/setting-line.md §9: one short line under each
// connection row saying where the reader is about to land, taken from the BSB's
// own section headings and gated by how far the verse sits below its heading.
// Shaped after scripts/build-map-data.mjs — pinned sources, the derived artefact
// committed, the source data not — and it imports the rules out of
// src/utils/settingLine.ts rather than restating them, so the build and the app
// can never disagree about what may ship.
//
// NOTHING HERE CALLS A MODEL (brief §5.3, R7). Every line is a verbatim string
// from the BSB chapter feed. There is no inference in this pipeline at all, and
// the only network traffic is the two public data sources below.
//
// SOURCES
//   1. BSB complete.json (public domain — berean.bible/licensing.htm; helloao
//      adds "no copyright restrictions whatsoever"). Its `content` array
//      interleaves {type:'heading'} / {type:'hebrew_subtitle'} nodes with
//      verses, so a verse's heading is the nearest one above it.
//   2. open-cross-ref (OpenBible.info, CC BY 4.0, via helloao) — WHICH verses a
//      reader can actually reach. The file is keyed by destination verse
//      (§1.2), and only destinations inside an OPEN door are worth shipping:
//      the door opens where a verse's strongest connection scores >= THRESHOLD,
//      read out of src/utils/connections.ts so this can never drift from the
//      shipped behaviour.
//
// Usage:
//   node scripts/build-setting-lines.mjs          # or: npm run build:setting-lines
//   CACHE_DIR=/tmp/sl node scripts/build-setting-lines.mjs
//   NO_NETWORK=1 node scripts/build-setting-lines.mjs   # cache only; fails loudly if cold
//
// The cache (default .cache/setting-line, which .gitignore already covers) is
// shared with scripts/measure-setting-line.mjs, so a warm brief run makes this
// build offline and ~20s. Cold it downloads ~28 MB and takes about a minute.
// Nothing is written into the repo except the bundle itself.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  HEADING_REACH,
  MAX_WORDS,
  buildSettingLine,
  checkSettingLines,
  bannedTerm,
  settingLineKey,
  wordCount
} from '../src/utils/settingLine.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const CACHE = process.env.CACHE_DIR
  ? resolve(process.env.CACHE_DIR)
  : resolve(REPO, '.cache', 'setting-line')
const NO_NETWORK = process.env.NO_NETWORK === '1'

const XR_BASE = 'https://bible.helloao.org/api/d/open-cross-ref'
const BSB_COMPLETE_URL = 'https://bible.helloao.org/api/BSB/complete.json'

const OUT = resolve(REPO, 'public', 'bible', 'connections', 'settings.json.gz')

/** Brief §9, acceptance 1: the shipped bundle stays under this, gzipped. */
const SIZE_BUDGET_KB = 80

/** Brief §9, acceptance 1: a line for at least this share of the rows a door shows. */
const MIN_ROW_COVERAGE = 0.8

const ATTRIBUTION =
  'Section headings and Hebrew superscriptions: Berean Standard Bible (public domain, berean.bible/licensing.htm). ' +
  'Cross-references used to choose which verses are included: OpenBible.info, CC BY 4.0.'

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`
const pct = (x, n) => (n ? ((x / n) * 100).toFixed(1) + '%' : '—')

function cached(name, url) {
  const path = resolve(CACHE, name)
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  if (NO_NETWORK) throw new Error(`NO_NETWORK=1 but ${name} is not cached in ${CACHE}`)
  return fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      return res.text()
    })
    .then(text => {
      mkdirSync(CACHE, { recursive: true })
      writeFileSync(path, text)
      return JSON.parse(text)
    })
}

/** The shipped salience line, read out of the shipped code rather than restated. */
function shippedThreshold() {
  const src = readFileSync(resolve(REPO, 'src', 'utils', 'connections.ts'), 'utf8')
  const m = src.match(/export const THRESHOLD = (-?\d+)/)
  if (!m) throw new Error('could not read THRESHOLD out of src/utils/connections.ts')
  return Number(m[1])
}

function flatten(content) {
  return content
    .map(item => (typeof item === 'string' ? item : typeof item?.text === 'string' ? item.text : ''))
    .join(' ')
    .replace(/\s+([,.;:!?”’])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Every BSB verse with the heading above it, how far below it sits, and the chapter's subtitle. */
async function loadBsb() {
  const data = await cached('bsb-complete.json', BSB_COMPLETE_URL)
  const bookNumberByUsfm = {}
  const verses = {}
  const chapters = []
  for (const book of data.books) {
    bookNumberByUsfm[book.id] = book.order
    for (const ch of book.chapters) {
      const chapterNum = ch.chapter.number
      chapters.push([book.id, chapterNum])
      let heading = null
      let subtitle = null
      // How many verses down from its heading a verse sits. 0 = the first under
      // it. In Proverbs a chapter carries ONE heading and thirty unrelated
      // sayings, so this number is the difference between a heading that
      // describes the verse and one that merely precedes it (R6).
      let sinceHeading = 0
      for (const node of ch.chapter.content) {
        if (node.type === 'heading') {
          heading = flatten(node.content ?? [])
          sinceHeading = 0
        } else if (node.type === 'hebrew_subtitle') {
          subtitle = flatten(node.content ?? [])
        } else if (node.type === 'verse' && node.number !== undefined) {
          verses[settingLineKey(book.order, chapterNum, node.number)] = {
            heading,
            subtitle,
            sinceHeading
          }
          sinceHeading++
        }
      }
    }
  }
  return { bookNumberByUsfm, verses, chapters }
}

async function loadCrossRefs(chapters) {
  mkdirSync(resolve(CACHE, 'xref'), { recursive: true })
  const missing = chapters.filter(([b, c]) => !existsSync(resolve(CACHE, 'xref', `${b}-${c}.json`)))
  if (missing.length && NO_NETWORK) {
    throw new Error(`NO_NETWORK=1 but ${missing.length} cross-reference chapters are not cached`)
  }
  if (missing.length) {
    process.stderr.write(`fetching ${missing.length} cross-reference chapters…\n`)
    const queue = missing.slice()
    const errors = []
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (queue.length) {
          const [b, c] = queue.shift()
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const res = await fetch(`${XR_BASE}/${b}/${c}.json`)
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              const text = await res.text()
              JSON.parse(text)
              writeFileSync(resolve(CACHE, 'xref', `${b}-${c}.json`), text)
              break
            } catch (err) {
              if (attempt === 2) errors.push(`${b} ${c}: ${err.message}`)
            }
          }
        }
      })
    )
    if (errors.length) {
      throw new Error(`cross-reference fetch failed for ${errors.length}: ${errors[0]}`)
    }
  }
  const byChapter = {}
  for (const [b, c] of chapters) {
    byChapter[`${b}-${c}`] = JSON.parse(
      readFileSync(resolve(CACHE, 'xref', `${b}-${c}.json`), 'utf8')
    ).chapter.content
  }
  return byChapter
}

async function main() {
  const threshold = shippedThreshold()
  const bsb = await loadBsb()
  const byChapter = await loadCrossRefs(bsb.chapters)

  // ---- the population: every destination inside an open door ---------------
  let rows = 0
  const destinations = new Map() // verseKey -> rows pointing at it
  for (const [usfm, ch] of bsb.chapters) {
    for (const entry of byChapter[`${usfm}-${ch}`] ?? []) {
      const refs = (entry.references ?? []).filter(r => r.score > 0).sort((a, b) => b.score - a.score)
      if (refs.length === 0 || refs[0].score < threshold) continue
      for (const r of refs) {
        const target = bsb.bookNumberByUsfm[r.book]
        if (target === undefined) continue
        rows++
        // A ranged target is described by its FIRST verse — the setting of a
        // passage is the setting of where it starts.
        const key = settingLineKey(target, r.chapter, r.verse)
        destinations.set(key, (destinations.get(key) ?? 0) + 1)
      }
    }
  }

  // ---- the lines -----------------------------------------------------------
  const lines = {}
  const checkable = []
  const droppedBanned = []
  const droppedOverCap = []
  let coveredRows = 0
  const bySource = { h: 0, s: 0 }
  for (const [key, rowCount] of destinations) {
    const verse = bsb.verses[key]
    if (!verse) continue
    // Every heading this build CONSIDERED and rejected is reported, not only
    // the ones that shipped — "report any that do" (§4). A rejected heading
    // falls through the chain exactly as R4 prescribes for the word cap: the
    // line is dropped and the next source tried, so the reader sees a row with
    // no line rather than a line that breaks a rule.
    if (verse.heading && verse.sinceHeading <= HEADING_REACH) {
      const banned = bannedTerm(verse.heading)
      if (banned) droppedBanned.push(`${key}: “${verse.heading}” (${banned})`)
      else if (wordCount(verse.heading) > MAX_WORDS) {
        droppedOverCap.push(`${key}: “${verse.heading}” (${wordCount(verse.heading)} words)`)
      }
    }
    const line = buildSettingLine(verse)
    if (!line) continue
    lines[key] = [line.text, line.source]
    checkable.push({
      key,
      text: line.text,
      source: line.source,
      reach: line.source === 'h' ? verse.sinceHeading : 0
    })
    bySource[line.source]++
    coveredRows += rowCount
  }

  const payload = { v: 1, attribution: ATTRIBUTION, lines }
  const json = JSON.stringify(payload)
  const gz = gzipSync(Buffer.from(json), { level: 9 })
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, gz)

  // ---- the rule check, over the file that was actually written -------------
  const written = JSON.parse(gunzipSync(readFileSync(OUT)))
  const readBack = Object.entries(written.lines).map(([key, [text, source]]) => ({
    key,
    text,
    source,
    reach: source === 'h' ? (bsb.verses[key]?.sinceHeading ?? 0) : 0
  }))
  const violations = checkSettingLines(readBack)

  // ---- the report ----------------------------------------------------------
  console.log(`\n=== setting lines — ${OUT.replace(REPO + '/', '')} ===`)
  console.log(`Salience threshold, read from src/utils/connections.ts : >= ${threshold}`)
  console.log(`Reach gate (R6)                                       : <= ${HEADING_REACH} verses`)
  console.log(`Generated by                                          : templates only, no model`)
  console.log(`\n--- coverage ---`)
  console.log(`  destination verses inside an open door : ${destinations.size}`)
  console.log(`  destination verses with a line         : ${checkable.length} (${pct(checkable.length, destinations.size)})`)
  console.log(`    from a BSB section heading           : ${bySource.h}`)
  console.log(`    from a Hebrew superscription         : ${bySource.s}`)
  console.log(`  CONNECTION ROWS with a line            : ${coveredRows}/${rows} (${pct(coveredRows, rows)})`)
  console.log(`\n--- size ---`)
  console.log(`  raw JSON                               : ${kb(Buffer.byteLength(json))}`)
  console.log(`  gzip -9 (shipped)                      : ${kb(gz.length)}  (budget ${SIZE_BUDGET_KB} KB)`)
  console.log(`\n--- rule check (R3 banned verbs, R4 word cap, R6 reach) ---`)
  console.log(`  lines checked in the written file      : ${readBack.length}`)
  console.log(`  headings in reach DROPPED for a banned verb (R3) : ${droppedBanned.length}`)
  for (const h of droppedBanned) console.log(`      ${h}`)
  console.log(`  headings in reach DROPPED by the word cap (R4)   : ${droppedOverCap.length}`)
  for (const h of droppedOverCap) console.log(`      ${h}`)
  console.log(`  violations in the shipped file            : ${violations.length}`)
  for (const v of violations.slice(0, 20)) console.log(`      ${v.rule} ${v.key} ${v.detail}`)

  // ---- the gates -----------------------------------------------------------
  const failures = []
  // The build fails on a rule breaking through into the SHIPPED FILE. A source
  // heading that breaks one is not a build failure — it is the case R4 is
  // written for, and it is dropped and reported above.
  if (violations.length) failures.push(`${violations.length} rule violations in the shipped file`)
  if (gz.length / 1024 > SIZE_BUDGET_KB) {
    failures.push(`bundle is ${kb(gz.length)}, over the ${SIZE_BUDGET_KB} KB budget`)
  }
  if (coveredRows / rows < MIN_ROW_COVERAGE) {
    failures.push(`row coverage ${pct(coveredRows, rows)} is under the ${MIN_ROW_COVERAGE * 100}% floor`)
  }
  if (failures.length) {
    console.error(`\nFAILED:\n  - ${failures.join('\n  - ')}`)
    process.exit(1)
  }
  console.log(`\nOK — rules pass, ${kb(gz.length)} gzipped, ${pct(coveredRows, rows)} of rows carry a line.`)
}

await main()
