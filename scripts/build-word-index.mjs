// Builds the word index for the word door: public/bible/words/**
//
// Slice 1 of docs/proposals/word-door-guardrails.md. This ships NO UI. It
// produces the data a later door reads: for a word in a verse, which lemma it
// is; and for a lemma, how the BSB puts it into English and where else it
// stands. See section 5 of the brief for the reasoning, and section 5.4 for the
// as-built format (which differs from section 5.2 — recorded there, not here).
//
// Sources
//   BSB Translation Tables  https://bereanbible.com/bsb_tables.tsv  (85.5 MB)
//     Public domain — berean.bible/licensing.htm, the same basis on which
//     scripts/build-bsb-bundle.mjs already bundles bsb.txt.
//   STEPBible TBESH / TBESG (CC BY 4.0)
//     github.com/STEPBible/STEPBible-Data, Lexicons/.
//
// LICENCE SPLIT, and it is load-bearing (brief section 4.2). We ship:
//   Greek  — TBESG Gloss AND Meaning (Abbott-Smith / Middle Liddell, both PD).
//   Hebrew — TBESH Gloss ONLY. TBESH's Meaning column is Abridged BDB
//            (c) Larry Pierce of OnlineBible.net; its own file header says
//            "Permission should be gained from Online Bible before these are
//            applied in any project", and this project does not hold it. The
//            column is read and DROPPED here — never written to disk.
// OpenScriptures is not in this build at all: the repo has no licence file
// (brief section 4.3).
//
// The tables are NOT committed (85 MB); the derived index is.
//
// Gotcha, from the brief's section 11 and confirmed here: the TSV contains raw
// double-quote characters inside footnote text, so it must be split on tabs
// with quoting disabled. A CSV reader corrupts it.
//
// Regenerate:  npm run build:word-index
// Offline:     BSB_TABLES_PATH=/tmp/bsb_tables.tsv TBESH_PATH=... TBESG_PATH=... npm run build:word-index
//
// Run through tsx (see package.json) so the head-word grouping can be imported
// from src/utils/wordIndex.ts rather than reimplemented. That grouping is an
// editorial transformation whose output SHIPS, so there must be exactly one of
// it, under test.
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { gzipSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  countRenderings,
  groupRenderings,
  LEMMA_SHARD_SIZE,
  lemmaShard,
  packRef,
  strongsKey
} from '../src/utils/wordIndex.ts'

const TABLES_URL = 'https://bereanbible.com/bsb_tables.tsv'
const LEXICON_BASE = 'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/'
const TBESH_FILE =
  'TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt'
const TBESG_FILE =
  'TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt'

const TAB = String.fromCharCode(9)
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', 'public', 'bible', 'words')

// Column indices in bsb_tables.tsv. Named because the header row spells two of
// them identically ("Parsing" twice — terse then expanded).
const COL = {
  word: 5,
  translit: 7,
  parsingTerse: 8,
  parsingExpanded: 9,
  strongsHebrew: 10,
  strongsGreek: 11,
  verseId: 12,
  english: 18
}

// The exact book names bereanbible.com prints in the VerseId column. Identical
// to BOOK_NAMES in scripts/build-bsb-bundle.mjs — verified against all 754,647
// rows, zero unmapped labels — but duplicated rather than shared because these
// build scripts have no common module and inventing one is out of this slice.
const BOOK_NAMES = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra',
  'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs',
  'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations',
  'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos',
  'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk',
  'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew',
  'Mark', 'Luke', 'John', 'Acts', 'Romans',
  '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians',
  'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy',
  'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter',
  '2 Peter', '1 John', '2 John', '3 John', 'Jude',
  'Revelation'
]
const NUMBER_BY_NAME = new Map(BOOK_NAMES.map((name, i) => [name, i + 1]))
const VERSE_ID = /^(.+) (\d+):(\d+)$/

// Drift guards. A silently-changed upstream file should fail the build rather
// than ship a half-empty bundle (brief section 5.1, step 5).
const EXPECT = {
  wordRows: 754647,
  books: 66,
  distinctStrongs: 13876,
  minCoverage: 0.95,
  // The worked example the brief and the design session both measured, and the
  // one number that proves the rendering pipeline end to end.
  hebel: { key: 'H1892', count: 73, rawForms: 35, groupedForms: 24, topForm: 24 }
}

async function source(envVar, url, label) {
  const local = process.env[envVar]
  if (local) {
    console.error(`Reading ${label} from ${local}`)
    return local
  }
  const cache = resolve(__dirname, '..', 'node_modules', '.cache', 'word-index', label)
  if (existsSync(cache)) {
    console.error(`Reading ${label} from ${cache}`)
    return cache
  }
  console.error(`Downloading ${label} from ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed for ${label}: ${res.status} ${res.statusText}`)
  mkdirSync(dirname(cache), { recursive: true })
  writeFileSync(cache, Buffer.from(await res.arrayBuffer()))
  return cache
}

// --- the lexicons ------------------------------------------------------------

// STEPBible sense text carries the source's own light markup. Flatten it to
// plain lines rather than shipping HTML into a renderer: <BR /> separates
// senses, <ref='...'> wraps a scripture reference whose visible text we keep,
// and the "__1." numbering markers are the source's list bullets.
function flattenSense(raw) {
  return raw
    .replace(/<BR\s*\/?>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((line) => line.replace(/^\s*__/, '').replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * Parse one STEPBible brief lexicon into Map<eStrong, {lemma, translit, morph,
 * glosses, senses}>. `keepMeaning` is the section 4.2 licence switch: false for
 * TBESH means the Meaning column is never even collected.
 */
function readLexicon(path, keepMeaning) {
  const rows = readFileSync(path, 'utf8').split(/\r?\n/)
  const headerIndex = rows.findIndex(
    (row) => row.startsWith('eStrong') && row.includes(`${TAB}Transliteration${TAB}`)
  )
  if (headerIndex === -1) throw new Error(`no data header row found in ${path}`)

  const entries = new Map()
  let dataRows = 0
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row.trim()) continue
    const c = row.split(TAB)
    const key = (c[0] || '').trim()
    if (!/^[HG]\d{4}/.test(key)) continue
    dataRows++
    // Keyed on the eStrong# EXACTLY as printed, suffix and all.
    //
    // BDB splits some Strong's numbers into sub-lemmas and STEPBible follows it:
    // there is no bare "H0122", only "H0122a" (red) and "H0122b" (red stuff).
    // The BSB tables carry the bare number, so those lemmas simply do not join —
    // and that is where nearly all of the 542-lemma gap in section 4.3 lives.
    // Folding "H0122a" + "H0122b" onto "H0122" would close the gap on paper
    // while merging two senses BDB deliberately separated, which is the exact
    // conflation section 2.3 indicts Strong's for. A gloss-less door is the
    // honest answer; see section 5.4.
    //
    // Rows sharing one eStrong# (the dStrong disambiguations, H0001G/H/I) DO
    // fold — same number, same word, several named senses.
    let entry = entries.get(key)
    if (!entry) {
      entry = { lemma: (c[3] || '').trim(), translit: (c[4] || '').trim(), morphClass: (c[5] || '').trim(), glosses: [], senses: [] }
      entries.set(key, entry)
    }
    const gloss = (c[6] || '').trim()
    if (gloss && !entry.glosses.includes(gloss)) entry.glosses.push(gloss)
    if (keepMeaning) {
      for (const sense of flattenSense(c[7] || '')) {
        if (!entry.senses.includes(sense)) entry.senses.push(sense)
      }
    }
  }
  return { entries, dataRows }
}

// --- the tables --------------------------------------------------------------

const tablesPath = await source('BSB_TABLES_PATH', TABLES_URL, 'bsb_tables.tsv')
const tbeshPath = await source('TBESH_PATH', LEXICON_BASE + encodeURIComponent(TBESH_FILE), 'TBESH.txt')
const tbesgPath = await source('TBESG_PATH', LEXICON_BASE + encodeURIComponent(TBESG_FILE), 'TBESG.txt')

const hebrew = readLexicon(tbeshPath, false) // Meaning column DROPPED — section 4.2
const greek = readLexicon(tbesgPath, true)
console.error(
  `Lexicons: TBESH ${hebrew.dataRows} rows / ${hebrew.entries.size} lemmas (gloss only),` +
    ` TBESG ${greek.dataRows} rows / ${greek.entries.size} lemmas (gloss + sense)`
)

/** parsing table: "terse expanded" -> id, plus the id -> [expanded, terse] list. */
const parsingIds = new Map()
const parsingTable = []
function parsingId(terse, expanded) {
  if (!terse && !expanded) return -1
  const key = `${terse} ${expanded}`
  let id = parsingIds.get(key)
  if (id === undefined) {
    id = parsingTable.length
    parsingIds.set(key, id)
    parsingTable.push([expanded, terse])
  }
  return id
}

const verses = new Map() // book -> chapter -> verse -> [[english, key, translit, parsingId], ...]
const lemmas = new Map() // strongsKey -> { count, forms: [], occurrences: [] }
let wordRows = 0
let taggedRows = 0
let currentRef = null

const reader = createInterface({ input: createReadStream(tablesPath, 'utf8'), crlfDelay: Infinity })
let lineNumber = 0
for await (const line of reader) {
  lineNumber++
  if (lineNumber === 1) continue // header
  if (!line.trim()) continue
  wordRows++
  const c = line.split(TAB)

  // VerseId is sparse — set on the first word of a verse only — so forward-fill.
  const rawRef = (c[COL.verseId] || '').trim()
  if (rawRef) {
    const m = VERSE_ID.exec(rawRef)
    if (!m) throw new Error(`unparseable VerseId "${rawRef}" at line ${lineNumber}`)
    const book = NUMBER_BY_NAME.get(m[1])
    if (book === undefined) throw new Error(`unrecognized book name "${m[1]}" at line ${lineNumber}`)
    currentRef = { book, chapter: Number(m[2]), verse: Number(m[3]) }
  }

  const hebrewStrongs = (c[COL.strongsHebrew] || '').trim()
  const greekStrongs = (c[COL.strongsGreek] || '').trim()
  if (!hebrewStrongs && !greekStrongs) continue // translator-supplied English, punctuation rows
  if (!currentRef) throw new Error(`tagged word before any VerseId at line ${lineNumber}`)
  taggedRows++

  const key = hebrewStrongs
    ? strongsKey('H', hebrewStrongs)
    : strongsKey('G', greekStrongs)
  const english = (c[COL.english] || '').trim()
  const translit = (c[COL.translit] || '').trim()
  const parsing = parsingId((c[COL.parsingTerse] || '').trim(), (c[COL.parsingExpanded] || '').trim())

  const chapters = verses.get(currentRef.book) ?? verses.set(currentRef.book, new Map()).get(currentRef.book)
  const verseWords = chapters.get(currentRef.chapter) ?? chapters.set(currentRef.chapter, new Map()).get(currentRef.chapter)
  const words = verseWords.get(currentRef.verse) ?? verseWords.set(currentRef.verse, []).get(currentRef.verse)
  words.push([english, key, translit, parsing])

  let lemma = lemmas.get(key)
  if (!lemma) {
    // The tables' own inflected form and transliteration, kept as the fallback
    // for the 542 lemmas no lexicon covers (brief section 4.3). Not a lemma —
    // it is the first attested form — which is why the lexicon wins when present.
    lemma = { count: 0, forms: [], words: [], formIndex: new Map(), occurrences: [], word: (c[COL.word] || '').trim(), translit }
    lemmas.set(key, lemma)
  }
  lemma.count++
  lemma.forms.push(english)
  // Occurrences store an INDEX into the lemma's own table of distinct English
  // renderings rather than repeating the string. Renderings repeat heavily
  // (H1892: 73 occurrences, 35 distinct forms, one of them used 20 times), so
  // this is pure redundancy removal — decodeOccurrence in src/utils/wordIndex.ts
  // puts the string back.
  let formIndex = lemma.formIndex.get(english)
  if (formIndex === undefined) {
    formIndex = lemma.words.length
    lemma.formIndex.set(english, formIndex)
    lemma.words.push(english)
  }
  lemma.occurrences.push([packRef(currentRef.book, currentRef.chapter, currentRef.verse), formIndex, parsing])
}

if (wordRows !== EXPECT.wordRows) {
  throw new Error(`expected ${EXPECT.wordRows} word rows, read ${wordRows} — upstream table changed`)
}
if (verses.size !== EXPECT.books) throw new Error(`expected ${EXPECT.books} books, got ${verses.size}`)
if (lemmas.size !== EXPECT.distinctStrongs) {
  throw new Error(`expected ${EXPECT.distinctStrongs} distinct Strong's numbers, got ${lemmas.size}`)
}

// --- join, and the honest-door rule -----------------------------------------

let covered = 0
const entries = new Map()
for (const [key, lemma] of lemmas) {
  const lex = (key[0] === 'H' ? hebrew : greek).entries.get(key)
  if (lex) covered++
  const renderings = countRenderings(lemma.forms)
  entries.set(key, {
    // A lemma no lexicon covers still gets a full entry: form, transliteration,
    // morphology and occurrences, with no gloss. That is an honest door, not an
    // error, and it must never be filtered out (brief section 4.3).
    l: lex?.lemma || lemma.word,
    t: lex?.translit || lemma.translit,
    m: lex?.morphClass ?? '',
    g: lex?.glosses ?? [],
    s: lex?.senses ?? [],
    n: lemma.count,
    r: renderings,
    rg: groupRenderings(renderings),
    w: lemma.words,
    o: lemma.occurrences
  })
}

const coverage = covered / lemmas.size
if (coverage < EXPECT.minCoverage) {
  throw new Error(`lexicon coverage ${(coverage * 100).toFixed(1)}% below the ${EXPECT.minCoverage * 100}% floor`)
}

// The worked example. If this drifts, the rendering pipeline is wrong and the
// door would be built on a number nobody re-measured.
const hebel = entries.get(EXPECT.hebel.key)
const actual = {
  count: hebel.n,
  rawForms: hebel.r.length,
  groupedForms: hebel.rg.length,
  topForm: hebel.rg[0][1]
}
for (const field of ['count', 'rawForms', 'groupedForms', 'topForm']) {
  if (actual[field] !== EXPECT.hebel[field]) {
    throw new Error(
      `${EXPECT.hebel.key} ${field}: expected ${EXPECT.hebel[field]}, measured ${actual[field]}` +
        ` (all four: ${JSON.stringify(actual)})`
    )
  }
}

// --- write -------------------------------------------------------------------

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(resolve(OUT_DIR, 'verses'), { recursive: true })
mkdirSync(resolve(OUT_DIR, 'lemmas'), { recursive: true })

const written = []
function emit(relativePath, value) {
  const gz = gzipSync(JSON.stringify(value), { level: 9 })
  writeFileSync(resolve(OUT_DIR, relativePath), gz)
  written.push({ path: relativePath, bytes: gz.length })
  return gz.length
}

const verseShards = []
for (const [book, chapters] of [...verses].sort((a, b) => a[0] - b[0])) {
  const out = {}
  for (const [chapter, verseWords] of [...chapters].sort((a, b) => a[0] - b[0])) {
    const chapterOut = {}
    for (const [verse, words] of [...verseWords].sort((a, b) => a[0] - b[0])) chapterOut[verse] = words
    out[chapter] = chapterOut
  }
  verseShards.push({ book, bytes: emit(`verses/${book}.json.gz`, out) })
}

const byShard = new Map()
for (const [key, entry] of entries) {
  const shard = lemmaShard(key)
  const bucket = byShard.get(shard) ?? byShard.set(shard, {}).get(shard)
  bucket[key] = entry
}
const lemmaShards = []
for (const shard of [...byShard.keys()].sort()) {
  lemmaShards.push({
    shard,
    lemmas: Object.keys(byShard.get(shard)).length,
    bytes: emit(`lemmas/${shard}.json.gz`, byShard.get(shard))
  })
}

emit('parsing.json.gz', parsingTable)
emit('manifest.json.gz', {
  built: new Date().toISOString().slice(0, 10),
  wordRows,
  taggedRows,
  books: verses.size,
  lemmas: lemmas.size,
  lexiconCovered: covered,
  parsingEntries: parsingTable.length,
  lemmaShardSize: LEMMA_SHARD_SIZE,
  lemmaShards: [...byShard.keys()].sort(),
  sources: {
    words: 'BSB Translation Tables (bereanbible.com) — public domain',
    hebrew: 'STEPBible TBESH gloss (CC BY 4.0, Tyndale House) — Meaning column deliberately omitted',
    greek: 'STEPBible TBESG gloss + sense (CC BY 4.0; sense is Abbott-Smith / Middle Liddell, public domain)'
  }
})

// --- report ------------------------------------------------------------------

const total = written.reduce((sum, f) => sum + f.bytes, 0)
const versesTotal = verseShards.reduce((sum, s) => sum + s.bytes, 0)
const lemmasTotal = lemmaShards.reduce((sum, s) => sum + s.bytes, 0)
const sortedVerses = [...verseShards].sort((a, b) => a.bytes - b.bytes)
const kb = (n) => `${(n / 1024).toFixed(1)} KB`

console.error(
  `\nWrote ${written.length} files to ${OUT_DIR}\n` +
    `  word rows read:      ${wordRows} (${taggedRows} carry a Strong's number)\n` +
    `  lemmas indexed:      ${lemmas.size}\n` +
    `  lexicon coverage:    ${covered}/${lemmas.size} (${(coverage * 100).toFixed(1)}%) — ${lemmas.size - covered} honest doors with no gloss\n` +
    `  parsing table:       ${parsingTable.length} distinct terse/expanded pairs\n` +
    `  ${EXPECT.hebel.key}:               ${JSON.stringify(actual)}\n` +
    `\n  gzipped TOTAL:       ${total} B (${(total / 1024 / 1024).toFixed(2)} MB)\n` +
    `    verses/ (66):      ${versesTotal} B — largest ${kb(sortedVerses.at(-1).bytes)} (book ${sortedVerses.at(-1).book}), median ${kb(sortedVerses[33].bytes)}, smallest ${kb(sortedVerses[0].bytes)}\n` +
    `    lemmas/ (${lemmaShards.length}):      ${lemmasTotal} B — largest ${kb(Math.max(...lemmaShards.map((s) => s.bytes)))}, median ${kb(lemmaShards.map((s) => s.bytes).sort((a, b) => a - b)[Math.floor(lemmaShards.length / 2)])}\n` +
    `    parsing + manifest: ${total - versesTotal - lemmasTotal} B`
)
console.error('\nPer-shard (verses, book: bytes):')
console.error(verseShards.map((s) => `${BOOK_NAMES[s.book - 1]}=${s.bytes}`).join(' '))
console.error('\nPer-shard (lemmas, shard: bytes):')
console.error(lemmaShards.map((s) => `${s.shard}=${s.bytes}(${s.lemmas})`).join(' '))
