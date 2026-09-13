// Measures the sources for the SETTING LINE — one short objective sentence
// under a cross-reference, saying whose passage it is and where or when —
// for docs/proposals/setting-line.md.
//
// Unlike scripts/measure-cross-refs.mjs, which sampled 200 verses because a
// per-chapter walk looked expensive, this walks the WHOLE corpus: all 1,189
// cross-reference chapters take ~35s at concurrency 8 and cache to disk, so
// every number below is exact rather than sampled. (That measurement retires
// the sampling caveat in connections-door.md §2.1 for anything cheap enough
// to re-run — the numbers there still stand, they are just no longer the only
// affordable shape.)
//
// SOURCES, and what each is asked for:
//
//   1. open-cross-ref (OpenBible.info via helloao, CC BY 4.0) — WHICH
//      connections a reader actually sees. The door opens only where a
//      verse's strongest connection scores >= THRESHOLD (30), per
//      src/utils/connections.ts; this script re-reads that constant out of
//      the TypeScript so the measurement can never quietly drift from the
//      shipped threshold.
//   2. BSB complete.json (public domain) — the editorial SECTION HEADINGS
//      and the canonical Hebrew SUPERSCRIPTIONS the chapter feed already
//      carries. helloao's `content` array interleaves
//      `{type:'heading'}` / `{type:'hebrew_subtitle'}` nodes with verses, so
//      a verse's heading is the nearest one above it in that array.
//   3. Theographic Bible Metadata (CC BY-SA 4.0) — people, places, events
//      and a year per verse, keyed `verseID` = BBCCCVVV, the same key
//      src/utils/mapData.ts already uses for the map's verse index.
//   4. Lantern's own public/map/places.json.gz — the geocoded places already
//      shipped with the app (OpenBible geocoding, CC BY 4.0), read from the
//      repo with no network at all.
//
// Usage:
//   node scripts/measure-setting-line.mjs
//   CACHE_DIR=/tmp/sl node scripts/measure-setting-line.mjs   # reuse a cache
//   SEED=7 node scripts/measure-setting-line.mjs              # different draws
//   NO_NETWORK=1 node scripts/measure-setting-line.mjs        # cache only; fails loudly if cold
//
// First run downloads ~70 MB (7.8 MB BSB + 36 MB Theographic verses + 20 MB of
// cross-reference chapters) into CACHE_DIR (default .cache/setting-line, which
// .gitignore already covers) and takes ~2 minutes. Re-runs are ~20s and offline.
// Nothing here writes into the repo.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const CACHE = process.env.CACHE_DIR ? resolve(process.env.CACHE_DIR) : resolve(REPO, '.cache', 'setting-line')
const SEED = Number(process.env.SEED) || 20260913
const NO_NETWORK = process.env.NO_NETWORK === '1'

const XR_BASE = 'https://bible.helloao.org/api/d/open-cross-ref'
const BSB_COMPLETE_URL = 'https://bible.helloao.org/api/BSB/complete.json'
const THEO_RAW = 'https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/master/json'
const THEO_API = 'https://api.github.com/repos/robertrouse/theographic-bible-metadata'
const TIPNR_URL =
  'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Proper%20Nouns/' +
  'TIPNR%20-%20Translators%20Individualised%20Proper%20Names%20with%20all%20References%20-%20STEPBible.org%20CC%20BY.txt'

/**
 * How far below its heading a verse may sit and still be described by it
 * (brief §3, R6). Past this the heading is a section label that happens to be
 * above the verse — Proverbs 21:30 under "The King's Heart" — not its setting.
 */
const HEADING_REACH = 10

/** The rules' hard word cap (brief §3, R4). One line may be at most this many words. */
const MAX_WORDS = 12

// A line whose only named person is the divine name is true of most of Scripture
// and so tells a reader nothing about WHICH passage they are about to open.
const DIVINE_NAMES = new Set(['God', 'Jesus', 'Jesus Christ', 'Holy Spirit', 'LORD', 'Lord'])

// Theographic's `event` is sometimes a whole book ("Prophecies of Isaiah",
// 1,292 verses). Past this span it is a bucket, not a setting.
const BOOK_SCALE_EVENT = 200

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

// The LCG Fisher–Yates footnotes-door.md §11 and measure-cross-refs.mjs use,
// BigInt for the same reason (s*1103515245 overflows float64 precision).
function seededShuffle(arr, seed) {
  let s = BigInt(seed)
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245n + 12345n) % 2147483648n
    const j = Number(s % BigInt(i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const pct = (x, n) => (n ? ((x / n) * 100).toFixed(1) + '%' : '—')
const words = s => s.trim().split(/\s+/).filter(Boolean).length

function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  if (s.length === 0) return 0
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function cached(name, url, { json = true } = {}) {
  const path = resolve(CACHE, name)
  if (existsSync(path)) return json ? JSON.parse(readFileSync(path, 'utf8')) : readFileSync(path, 'utf8')
  if (NO_NETWORK) throw new Error(`NO_NETWORK=1 but ${name} is not cached in ${CACHE}`)
  return fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      return res.text()
    })
    .then(text => {
      mkdirSync(CACHE, { recursive: true })
      writeFileSync(path, text)
      return json ? JSON.parse(text) : text
    })
}

/** verseID / VerseKey: `BBCCCVVV`, exactly src/utils/mapData.ts's `verseKey`. */
const vkey = (book, chapter, verse) =>
  String(book).padStart(2, '0') + String(chapter).padStart(3, '0') + String(verse).padStart(3, '0')

// ---------------------------------------------------------------------------
// the shipped threshold, read out of the shipped code
// ---------------------------------------------------------------------------

function shippedThreshold() {
  const src = readFileSync(resolve(REPO, 'src', 'utils', 'connections.ts'), 'utf8')
  const m = src.match(/export const THRESHOLD = (-?\d+)/)
  if (!m) throw new Error('could not read THRESHOLD out of src/utils/connections.ts')
  return Number(m[1])
}

// ---------------------------------------------------------------------------
// source 2: the BSB chapter feed — book numbers, verse universe, headings
// ---------------------------------------------------------------------------

function flatten(content) {
  return content
    .map(item => (typeof item === 'string' ? item : typeof item?.text === 'string' ? item.text : ''))
    .join(' ')
    .replace(/\s+([,.;:!?”’])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function loadBsb() {
  const data = await cached('bsb-complete.json', BSB_COMPLETE_URL)
  const bookNumberByUsfm = {}
  const bookName = {}
  /** `{ [verseID]: { heading, subtitle, text } }` — heading = nearest node above the verse. */
  const verses = {}
  const chapters = []
  const headingsPerChapter = []
  let verseCount = 0

  for (const book of data.books) {
    bookNumberByUsfm[book.id] = book.order
    bookName[book.order] = book.commonName
    for (const ch of book.chapters) {
      const chapterNum = ch.chapter.number
      chapters.push([book.id, chapterNum])
      let heading = null
      let subtitle = null
      let headings = 0
      // How many verses down from its heading a verse sits. 0 = the first verse
      // under it. In Proverbs a chapter carries ONE heading and 30 unrelated
      // sayings, so this number is the difference between a heading that
      // describes the verse and one that merely precedes it.
      let sinceHeading = 0
      for (const node of ch.chapter.content) {
        if (node.type === 'heading') {
          heading = flatten(node.content ?? [])
          headings++
          sinceHeading = 0
        } else if (node.type === 'hebrew_subtitle') {
          subtitle = flatten(node.content ?? [])
        } else if (node.type === 'verse' && node.number !== undefined) {
          verses[vkey(book.order, chapterNum, node.number)] = {
            heading,
            subtitle,
            sinceHeading,
            text: flatten(node.content ?? [])
          }
          sinceHeading++
          verseCount++
        }
      }
      headingsPerChapter.push(headings)
    }
  }
  return { bookNumberByUsfm, bookName, verses, chapters, headingsPerChapter, verseCount }
}

// ---------------------------------------------------------------------------
// source 1: every cross-reference chapter
// ---------------------------------------------------------------------------

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
    if (errors.length) throw new Error(`cross-reference fetch failed for ${errors.length}: ${errors[0]}`)
  }
  let licence = null
  const byChapter = {}
  for (const [b, c] of chapters) {
    const data = JSON.parse(readFileSync(resolve(CACHE, 'xref', `${b}-${c}.json`), 'utf8'))
    byChapter[`${b}-${c}`] = data.chapter.content
    if (!licence && data.dataset) licence = `${data.dataset.name} — ${data.dataset.licenseUrl} (${data.dataset.website})`
  }
  return { byChapter, licence }
}

// ---------------------------------------------------------------------------
// source 3: Theographic
// ---------------------------------------------------------------------------

async function loadTheographic() {
  const [verseRecords, people, places, events] = await Promise.all([
    cached('theo-verses.json', `${THEO_RAW}/verses.json`),
    cached('theo-people.json', `${THEO_RAW}/people.json`),
    cached('theo-places.json', `${THEO_RAW}/places.json`),
    cached('theo-events.json', `${THEO_RAW}/events.json`)
  ])
  const personName = {}
  for (const r of people) if (r.fields?.name) personName[r.id] = { name: r.fields.name, proper: r.fields.isProperName === true }
  const placeName = {}
  for (const r of places) if (r.fields?.displayTitle) placeName[r.id] = r.fields.displayTitle
  const eventTitle = {}
  /** How many verses an event spans — a 900-verse "event" is a book, not a setting. */
  const eventSpan = {}
  for (const r of events) {
    if (!r.fields?.title) continue
    eventTitle[r.id] = r.fields.title
    eventSpan[r.fields.title] = (r.fields.verses ?? []).length
  }

  /** `{ [verseID]: { people:[name], places:[name], event: title|null, year: number|null } }` */
  const byVerse = {}
  const fieldCounts = { people: 0, places: 0, event: 0, year: 0 }
  for (const r of verseRecords) {
    const f = r.fields
    if (!f?.verseID) continue
    const ppl = (f.people ?? []).map(id => personName[id]).filter(p => p && p.proper).map(p => p.name)
    const plc = (f.places ?? []).map(id => placeName[id]).filter(Boolean)
    const event = (f.event ?? []).map(id => eventTitle[id]).filter(Boolean)[0] ?? null
    const year = typeof f.yearNum === 'number' ? f.yearNum : null
    if (ppl.length) fieldCounts.people++
    if (plc.length) fieldCounts.places++
    if (event) fieldCounts.event++
    if (year !== null) fieldCounts.year++
    byVerse[String(f.verseID)] = { people: ppl, places: plc, event, year }
  }
  let licence = 'unchecked (no network)'
  if (!NO_NETWORK) {
    try {
      const meta = await cached('theo-repo.json', THEO_API)
      licence = `${meta.license?.spdx_id} — ${meta.license?.name} (LICENSE file present in the repo root)`
    } catch (err) {
      licence = `unchecked (${err.message})`
    }
  }
  return { byVerse, total: verseRecords.length, fieldCounts, licence, eventSpan }
}

// ---------------------------------------------------------------------------
// source 5: STEPBible TIPNR — every proper name with every reference
// ---------------------------------------------------------------------------

/**
 * A LOWER BOUND on which verses TIPNR names a person or place in, taken by
 * regexing `Bk.C.V` tokens out of the whole file.
 *
 * Deliberately a lower bound and labelled as one: TIPNR's "All refs" column
 * abbreviates runs ("Gen.11.26-Heb", "1Ch"), so a faithful index needs a real
 * parser for its reference grammar. This measures what is unambiguously there
 * so the dataset can be compared against Theographic without pretending to a
 * precision the 20-line regex does not have (brief §2.5).
 */
async function loadTipnr(bookNumberByUsfm) {
  let text
  try {
    text = await cached('tipnr.txt', TIPNR_URL, { json: false })
  } catch (err) {
    return { available: false, reason: err.message }
  }
  const verses = new Set()
  let tokens = 0
  const unknownBooks = new Set()
  const re = /\b([1-3]?[A-Z][a-z]{2})\.(\d+)\.(\d+)/g
  let m
  while ((m = re.exec(text))) {
    tokens++
    const book = bookNumberByUsfm[m[1].toUpperCase()]
    if (book === undefined) {
      unknownBooks.add(m[1])
      continue
    }
    verses.add(vkey(book, Number(m[2]), Number(m[3])))
  }
  // The grant is in the file's own header, not a LICENSE file — GitHub's API
  // reports `license: null` for STEPBible-Data, exactly the shape of claim
  // deep-dive-study.md §"correction" insists on checking by opening the file.
  const header = text.slice(0, 4000)
  const grant = header.includes('CC BY 4.0') ? 'header states CC BY 4.0 (Tyndale House Cambridge)' : 'NO GRANT FOUND IN HEADER'
  const noRedistribute = /do not redistribute it yourself/i.test(header)
  const esvBased = /Proper Nouns in the ESV/i.test(header)
  return { available: true, verses, tokens, unknownBooks: [...unknownBooks], grant, noRedistribute, esvBased }
}

// ---------------------------------------------------------------------------
// source 4: Lantern's own shipped place data
// ---------------------------------------------------------------------------

function loadLanternPlaces() {
  const raw = JSON.parse(gunzipSync(readFileSync(resolve(REPO, 'public', 'map', 'places.json.gz'))))
  const byVerse = {}
  for (const [key, idx] of Object.entries(raw.vs)) byVerse[key] = idx.map(i => raw.p[i]?.n).filter(Boolean)
  return { byVerse, attribution: raw.attribution, placeCount: raw.p.length, verseCount: Object.keys(raw.vs).length }
}

// ---------------------------------------------------------------------------
// THE LINE GENERATORS — brief §4. Pure, and deliberately dull.
// ---------------------------------------------------------------------------

/** R4's cap, applied as a hard reject rather than a truncation. */
const withinCap = line => line !== null && words(line) <= MAX_WORDS

/** A section heading, verbatim: it is already a noun phrase naming the passage. */
function headingLine(bsbVerse) {
  const h = bsbVerse?.heading
  if (!h) return null
  return h.replace(/\s+/g, ' ').trim()
}

/**
 * A canonical Hebrew superscription, minus the musical directions, which are
 * performance instructions rather than setting ("For the choirmaster. With
 * stringed instruments. A Psalm of David." → "A Psalm of David.").
 */
function superscriptionLine(bsbVerse) {
  const s = bsbVerse?.subtitle
  if (!s) return null
  const kept = s
    .split(/(?<=\.)\s+/)
    .filter(part => !/^(For the choirmaster|According to|With stringed|To the tune|A song for)/i.test(part.trim()))
    .join(' ')
    .trim()
  return kept.length ? kept : null
}

/**
 * The Theographic template. Every form is framed as what the text NAMES or is
 * PART OF, never as what happens or what it means: Theographic's `people` and
 * `places` are entities MENTIONED in the verse, not a speaker and a location,
 * and a template that says "Moses at Sinai" would be asserting something the
 * data does not carry. `year` is deliberately unused — see brief §3, R2.
 */
function templateLine(meta) {
  if (!meta) return null
  const place = meta.places.slice(0, 1).join('')
  // A name can be both a person and a place in Theographic (Moab, Israel, Judah);
  // naming it twice in one sentence is the kind of tell that makes a generated
  // line read as machine output, so the place wins and the person is dropped.
  const people = meta.people.filter(n => n !== place).slice(0, 2).join(' and ')
  const event = meta.event
  if (event && place) return `Part of ${event}; the text names ${place}.`
  if (event && people) return `Part of ${event}; the text names ${people}.`
  if (event) return `Part of ${event}.`
  if (place && people) return `The text names ${people}, and ${place}.`
  if (place) return `The text names ${place}.`
  if (people) return `The text names ${people}.`
  return null
}

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------

async function main() {
  const threshold = shippedThreshold()
  const bsb = await loadBsb()
  const { byChapter, licence: xrLicence } = await loadCrossRefs(bsb.chapters)
  const theo = await loadTheographic()
  const tipnr = await loadTipnr(bsb.bookNumberByUsfm)
  const lantern = loadLanternPlaces()

  // ---- the population: destinations a reader can actually reach ----------
  let doorVerses = 0
  let rows = 0 // every connection row an opened door shows (score > 0)
  let topRows = 0 // just the three rows the door shows prominently (§6.2)
  const destinations = new Map() // verseID -> { rows, top }
  for (const [usfm, ch] of bsb.chapters) {
    for (const entry of byChapter[`${usfm}-${ch}`] ?? []) {
      const refs = (entry.references ?? []).filter(r => r.score > 0).sort((a, b) => b.score - a.score)
      if (refs.length === 0 || refs[0].score < threshold) continue
      doorVerses++
      refs.forEach((r, i) => {
        const target = bsb.bookNumberByUsfm[r.book]
        if (target === undefined) return
        rows++
        if (i < 3) topRows++
        // A ranged target is described by its FIRST verse — the setting of a
        // passage is the setting of where it starts.
        const key = vkey(target, r.chapter, r.verse)
        const rec = destinations.get(key) ?? { rows: 0, top: 0 }
        rec.rows++
        if (i < 3) rec.top++
        destinations.set(key, rec)
      })
    }
  }

  // ---- what each source can say about those destinations -----------------
  const tally = {
    heading: { rows: 0, top: 0, verses: 0 },
    headingGated: { rows: 0, top: 0, verses: 0 },
    headingOverCap: 0,
    superscription: { rows: 0, top: 0, verses: 0 },
    template: { rows: 0, top: 0, verses: 0 },
    templateOverCap: 0,
    // Two ways a template line is technically true and tells a reader nothing.
    templateOnlyDivineName: 0,
    templateBookScaleEvent: 0,
    theoAny: { rows: 0, top: 0, verses: 0 },
    lanternPlace: { rows: 0, top: 0, verses: 0 },
    tipnr: { rows: 0, top: 0, verses: 0 },
    any: { rows: 0, top: 0, verses: 0 },
    none: { rows: 0, top: 0, verses: 0 }
  }
  const add = (bucket, rec) => {
    bucket.rows += rec.rows
    bucket.top += rec.top
    bucket.verses++
  }

  const headingDistances = []
  const headingExamples = []
  const templateExamples = []
  const auditPool = []

  for (const [key, rec] of destinations) {
    const bsbVerse = bsb.verses[key]
    const meta = theo.byVerse[key]
    const h = headingLine(bsbVerse)
    const sup = superscriptionLine(bsbVerse)
    const t = templateLine(meta)
    if (h) {
      add(tally.heading, rec)
      if (!withinCap(h)) tally.headingOverCap++
      headingDistances.push(bsbVerse.sinceHeading)
      if (bsbVerse.sinceHeading <= HEADING_REACH) add(tally.headingGated, rec)
    }
    if (sup) add(tally.superscription, rec)
    if (t) {
      add(tally.template, rec)
      if (!withinCap(t)) tally.templateOverCap++
      const named = meta.people.filter(n => !DIVINE_NAMES.has(n))
      if (!meta.event && !meta.places.length && named.length === 0) tally.templateOnlyDivineName++
      if (meta.event && (theo.eventSpan[meta.event] ?? 0) > BOOK_SCALE_EVENT) tally.templateBookScaleEvent++
    }
    if (meta && (meta.people.length || meta.places.length || meta.event)) add(tally.theoAny, rec)
    if (lantern.byVerse[key]?.length) add(tally.lanternPlace, rec)
    if (tipnr.available && tipnr.verses.has(key)) add(tally.tipnr, rec)
    const gated = (bsbVerse?.sinceHeading ?? Infinity) <= HEADING_REACH ? h : null
    const best = (withinCap(gated) && gated) || (withinCap(sup) && sup) || (withinCap(t) && t) || null
    add(best ? tally.any : tally.none, rec)

    const ref = `${bsb.bookName[Number(key.slice(0, 2))]} ${Number(key.slice(2, 5))}:${Number(key.slice(5))}`
    if (h) headingExamples.push({ key, ref, line: h, rows: rec.rows })
    if (t) templateExamples.push({ key, ref, line: t, rows: rec.rows })
    auditPool.push({
      key,
      ref,
      heading: h,
      superscription: sup,
      template: t,
      best,
      rows: rec.rows,
      top: rec.top,
      reach: bsbVerse?.sinceHeading ?? Infinity
    })
  }

  // ---- the shipped artefact, actually built and gzipped ------------------
  // Destination-keyed, because a setting line describes the destination alone
  // (brief §5): `{ [verseID]: [line, sourceCode] }`.
  const file = {}
  const slice1 = {}
  for (const { key, heading, superscription, template, reach } of auditPool) {
    const gated = reach <= HEADING_REACH ? heading : null
    const line =
      (withinCap(gated) && [gated, 'h']) ||
      (withinCap(superscription) && [superscription, 's']) ||
      (withinCap(template) && [template, 't']) ||
      null
    if (line) file[key] = line
    if (withinCap(gated)) slice1[key] = gated
  }
  const payload = { v: 1, attribution: 'Section headings: Berean Standard Bible (public domain). Setting notes from Theographic Bible Metadata, CC BY-SA 4.0.', lines: file }
  const rawBytes = Buffer.byteLength(JSON.stringify(payload))
  const gzBytes = gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }).length
  // The pair-keyed alternative the brief rejects, measured rather than asserted.
  let pairKeys = 0
  for (const rec of destinations.values()) pairKeys += rec.rows

  // ---- print -------------------------------------------------------------
  const nRows = rows
  const nVerses = destinations.size
  console.log(`\n=== The setting line — sources, coverage and shape ===`)
  console.log(`Run ${new Date().toISOString().slice(0, 10)}, seed ${SEED}, cache ${CACHE}`)
  console.log(`Shipped salience threshold, read from src/utils/connections.ts: top score >= ${threshold}`)

  console.log(`\n--- Licences (checked this run) ---`)
  console.log(`  cross-references : ${xrLicence}`)
  console.log(`  BSB headings     : public domain (Berean Standard Bible), carried in the same chapter feed`)
  console.log(`  Theographic      : ${theo.licence}`)
  console.log(`  Lantern places   : ${lantern.attribution}`)

  console.log(`\n--- The population a setting line has to cover ---`)
  console.log(`  BSB verses                             : ${bsb.verseCount}`)
  console.log(`  verses whose door opens (top >= ${threshold})    : ${doorVerses} (${pct(doorVerses, bsb.verseCount)})`)
  console.log(`  connection rows in those doors         : ${nRows}`)
  console.log(`  of which shown prominently (top 3)     : ${topRows}`)
  console.log(`  distinct destination verses            : ${nVerses}`)
  console.log(`  rows per destination verse (median)    : ${median([...destinations.values()].map(d => d.rows))}`)

  console.log(`\n--- 1. BSB section headings ---`)
  const chaptersWithHeading = bsb.headingsPerChapter.filter(n => n > 0).length
  console.log(`  chapters with >=1 heading              : ${chaptersWithHeading}/${bsb.chapters.length} (${pct(chaptersWithHeading, bsb.chapters.length)})`)
  console.log(`  headings per chapter (median)          : ${median(bsb.headingsPerChapter)}`)
  const allVerses = Object.values(bsb.verses)
  const underHeading = allVerses.filter(v => v.heading).length
  console.log(`  all BSB verses under a heading         : ${underHeading}/${allVerses.length} (${pct(underHeading, allVerses.length)})`)
  console.log(`  DESTINATION verses under a heading     : ${tally.heading.verses}/${nVerses} (${pct(tally.heading.verses, nVerses)})`)
  console.log(`  CONNECTION ROWS under a heading        : ${tally.heading.rows}/${nRows} (${pct(tally.heading.rows, nRows)})`)
  console.log(`  top-3 rows under a heading             : ${tally.heading.top}/${topRows} (${pct(tally.heading.top, topRows)})`)
  const headingWords = [...new Set(allVerses.map(v => v.heading).filter(Boolean))].map(words)
  console.log(`  heading length in words (median / max)  : ${median(headingWords)} / ${Math.max(...headingWords)}`)
  console.log(`  headings over the ${MAX_WORDS}-word cap         : ${tally.headingOverCap} of ${tally.heading.verses}`)
  const distAsc = [...headingDistances].sort((a, b) => a - b)
  const far = headingDistances.filter(d => d > 10).length
  console.log(`  verses below their heading (median/p90) : ${median(headingDistances)} / ${distAsc[Math.floor(distAsc.length * 0.9)]}`)
  console.log(`  destinations >${HEADING_REACH} verses below it        : ${far} (${pct(far, tally.heading.verses)})`)
  console.log(`  ROWS still covered with the reach gate  : ${tally.headingGated.rows}/${nRows} (${pct(tally.headingGated.rows, nRows)})`)
  console.log(`  top-3 rows covered with the gate        : ${tally.headingGated.top}/${topRows} (${pct(tally.headingGated.top, topRows)})`)
  const byBook = {}
  for (const [key, v] of Object.entries(bsb.verses)) {
    const b = Number(key.slice(0, 2))
    byBook[b] = byBook[b] ?? []
    byBook[b].push(v.sinceHeading)
  }
  const worst = Object.entries(byBook)
    .map(([b, ds]) => [bsb.bookName[Number(b)], median(ds)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  console.log(`  books where the heading is furthest away: ${worst.map(([n, m]) => `${n} (median ${m})`).join(', ')}`)

  console.log(`\n--- 2. Canonical Hebrew superscriptions (Psalms etc.) ---`)
  console.log(`  destination verses with one            : ${tally.superscription.verses} (${pct(tally.superscription.verses, nVerses)})`)
  console.log(`  rows                                  : ${tally.superscription.rows} (${pct(tally.superscription.rows, nRows)})`)

  console.log(`\n--- 3. Theographic Bible Metadata ---`)
  console.log(`  verse records                          : ${theo.total}`)
  console.log(`  of those, carry people/places/event/year: ${theo.fieldCounts.people} / ${theo.fieldCounts.places} / ${theo.fieldCounts.event} / ${theo.fieldCounts.year}`)
  console.log(`  DESTINATION verses with any of the three: ${tally.theoAny.verses}/${nVerses} (${pct(tally.theoAny.verses, nVerses)})`)
  console.log(`  destination verses a template can fill : ${tally.template.verses}/${nVerses} (${pct(tally.template.verses, nVerses)})`)
  console.log(`  CONNECTION ROWS a template can fill    : ${tally.template.rows}/${nRows} (${pct(tally.template.rows, nRows)})`)
  console.log(`  templates over the ${MAX_WORDS}-word cap        : ${tally.templateOverCap} of ${tally.template.verses}`)
  console.log(`  ...that say only "names God/Jesus"      : ${tally.templateOnlyDivineName} (${pct(tally.templateOnlyDivineName, tally.template.verses)} of template lines)`)
  console.log(`  ...whose event spans >${BOOK_SCALE_EVENT} verses       : ${tally.templateBookScaleEvent} (${pct(tally.templateBookScaleEvent, tally.template.verses)} of template lines)`)

  console.log(`\n--- 4. Lantern's own shipped place data (public/map/places.json.gz) ---`)
  console.log(`  places / verses indexed                : ${lantern.placeCount} / ${lantern.verseCount}`)
  console.log(`  destination verses with a place        : ${tally.lanternPlace.verses}/${nVerses} (${pct(tally.lanternPlace.verses, nVerses)})`)
  console.log(`  rows                                  : ${tally.lanternPlace.rows}/${nRows} (${pct(tally.lanternPlace.rows, nRows)})`)

  console.log(`\n--- 5. STEPBible TIPNR proper names (lower bound — see the loader's note) ---`)
  if (!tipnr.available) {
    console.log(`  not measured this run: ${tipnr.reason}`)
  } else {
    console.log(`  grant, read from the file header       : ${tipnr.grant}`)
    console.log(`  header asks not to be redistributed    : ${tipnr.noRedistribute}`)
    console.log(`  name forms are ESV-based               : ${tipnr.esvBased}`)
    console.log(`  unambiguous verse refs in the file     : ${tipnr.verses.size} (from ${tipnr.tokens} tokens; dropped codes: ${tipnr.unknownBooks.join(', ') || 'none'})`)
    console.log(`  destination verses it names someone in : ${tally.tipnr.verses}/${nVerses} (${pct(tally.tipnr.verses, nVerses)}, lower bound)`)
    console.log(`  rows                                  : ${tally.tipnr.rows}/${nRows} (${pct(tally.tipnr.rows, nRows)}, lower bound)`)
  }

  console.log(`\n--- Combined: can a row carry a line at all? ---`)
  console.log(`  destination verses with a line         : ${tally.any.verses}/${nVerses} (${pct(tally.any.verses, nVerses)})`)
  console.log(`  CONNECTION ROWS with a line            : ${tally.any.rows}/${nRows} (${pct(tally.any.rows, nRows)})`)
  console.log(`  top-3 rows with a line                 : ${tally.any.top}/${topRows} (${pct(tally.any.top, topRows)})`)
  console.log(`  rows with NOTHING to say               : ${tally.none.rows} (${pct(tally.none.rows, nRows)})`)

  console.log(`\n--- Shape: the file, actually built and gzipped ---`)
  console.log(`  destination-keyed lines                : ${Object.keys(file).length}`)
  console.log(`  raw JSON                               : ${(rawBytes / 1024).toFixed(1)} KB`)
  console.log(`  gzip -9                                : ${(gzBytes / 1024).toFixed(1)} KB`)
  const s1raw = Buffer.byteLength(JSON.stringify(slice1))
  const s1gz = gzipSync(Buffer.from(JSON.stringify(slice1)), { level: 9 }).length
  console.log(`  a (source,destination)-keyed file would need ${pairKeys} entries (${(pairKeys / Object.keys(file).length).toFixed(1)}x) for identical content`)
  console.log(`  SLICE 1 (gated headings only)          : ${Object.keys(slice1).length} lines, ${(s1raw / 1024).toFixed(1)} KB raw, ${(s1gz / 1024).toFixed(1)} KB gzipped`)

  const draw = (arr, n) => seededShuffle(arr, SEED).slice(0, n)

  console.log(`\n--- 20 real heading lines (seeded draw) ---`)
  draw(headingExamples, 20).forEach((e, i) =>
    console.log(`  ${String(i + 1).padStart(2)}. ${e.ref} — "${e.line}" (${words(e.line)}w, ${e.rows} rows)`)
  )

  console.log(`\n--- 20 real template lines (seeded draw) ---`)
  draw(templateExamples, 20).forEach((e, i) =>
    console.log(`  ${String(i + 1).padStart(2)}. ${e.ref} — "${e.line}" (${words(e.line)}w, ${e.rows} rows)`)
  )

  // The audit pool is destinations that reach a TOP-3 slot at least once: the
  // lines a reader actually reads, rather than the long tail behind "and N more".
  // 35 lines exactly as the pipeline would ship them, plus 15 template lines
  // from the same pool: the heading wins everywhere it exists (100% coverage),
  // so a straight draw would never audit the fallback generator at all.
  console.log(`\n--- 50 lines for the hand audit (seeded draw from top-3 destinations) ---`)
  const top3 = auditPool.filter(a => a.best && a.top > 0)
  let n = 0
  for (const a of draw(top3, 35)) {
    const source = a.best === a.heading ? 'heading' : a.best === a.superscription ? 'superscription' : 'template'
    console.log(`  ${String(++n).padStart(2)}. ${a.ref} [${source}] "${a.best}" (${words(a.best)}w)`)
  }
  for (const a of draw(top3.filter(x => x.template && !draw(top3, 35).includes(x)), 15)) {
    console.log(`  ${String(++n).padStart(2)}. ${a.ref} [template] "${a.template}" (${words(a.template)}w)`)
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
