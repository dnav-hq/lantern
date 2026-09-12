// Measures where the footnote door actually falls across the shipped BSB text
// — per-book and per-chapter door counts, for docs/proposals/footnotes-door-
// design-pass.md.
//
// Fetches GET /api/BSB/complete.json ONCE — the same helloao endpoint and the
// same per-chapter `{ content, footnotes }` shape src/bible/helloao.ts reads
// at runtime — then applies the EXACT ship-set filter (`footnoteShips`) and
// anchoring rule (`flattenVerseContent` plus the "does the prefix reproduce a
// genuine prefix of the verse" guard) that `HelloaoBibleProvider.getChapter`
// uses. The anchoring loop itself is duplicated rather than imported, because
// `verseNotesFor` in helloao.ts is not exported; the two are kept in lockstep
// by construction (both call the same exported `flattenVerseContent` and
// `footnoteShips`) and by the total-door count matching the classifier
// module's own comment (2,099).
//
// Run: node scripts/measure-footnote-density.mjs   (or: npx tsx scripts/measure-footnote-density.mjs)
// Offline (reuse an already-downloaded copy): COMPLETE_JSON_PATH=/tmp/complete.json node scripts/measure-footnote-density.mjs
import { readFileSync } from 'node:fs'
import { footnoteShips } from '../src/utils/footnotes.ts'
import { flattenVerseContent } from '../src/bible/helloao.ts'

const SOURCE_URL = 'https://bible.helloao.org/api/BSB/complete.json'

async function loadComplete() {
  const localPath = process.env.COMPLETE_JSON_PATH
  if (localPath) {
    console.error(`Reading complete.json from ${localPath}`)
    return JSON.parse(readFileSync(localPath, 'utf8'))
  }
  console.error(`Downloading ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`)
  return res.json()
}

// Same rule as helloao.ts's verseNotesFor: count a door only where the note
// ships (§6 of the brief) AND the phrase before its marker anchors cleanly
// against the verse's own flattened text. Everything that would not draw an
// underline on the reading surface does not count as a door here either.
function doorsInChapter(chapterNode) {
  const footnotes = new Map((chapterNode.footnotes ?? []).map(f => [f.noteId, f]))
  let doors = 0
  for (const node of chapterNode.content) {
    if (node.type !== 'verse' || !node.content) continue
    const text = flattenVerseContent(node.content)
    for (let i = 0; i < node.content.length; i++) {
      const item = node.content[i]
      if (typeof item !== 'object' || !('noteId' in item)) continue
      const footnote = footnotes.get(item.noteId)
      if (!footnote) continue
      if (footnote.reference?.verse === 0) continue // psalm superscription, §2.3
      if (!footnoteShips(footnote.text)) continue
      const anchored = flattenVerseContent(node.content.slice(0, i))
      if (anchored.length === 0 || !text.startsWith(anchored)) continue
      doors++
    }
  }
  return doors
}

function median(sortedNumbers) {
  const n = sortedNumbers.length
  const mid = Math.floor(n / 2)
  return n % 2 === 1 ? sortedNumbers[mid] : (sortedNumbers[mid - 1] + sortedNumbers[mid]) / 2
}

const data = await loadComplete()

const perBook = []
const perChapter = []

for (const book of data.books) {
  let bookDoors = 0
  for (const chapterEntry of book.chapters) {
    const chapterNode = chapterEntry.chapter
    const doors = doorsInChapter(chapterNode)
    bookDoors += doors
    perChapter.push({ book: book.name, chapter: chapterNode.number, doors })
  }
  perBook.push({ book: book.name, order: book.order, chapters: book.chapters.length, doors: bookDoors })
}

const totalDoors = perBook.reduce((sum, b) => sum + b.doors, 0)
const totalChapters = perChapter.length
const zeroChapters = perChapter.filter(c => c.doors === 0).length
const doorsPerChapterSorted = perChapter.map(c => c.doors).sort((a, b) => a - b)

const byDoorsDesc = [...perBook].sort((a, b) => b.doors - a.doors)
const top10 = byDoorsDesc.slice(0, 10)
const bottom10 = byDoorsDesc.slice(-10).reverse()

console.log(`Total ship-set doors: ${totalDoors}`)
console.log(
  `Chapters: ${totalChapters}, zero-door chapters: ${zeroChapters} ` +
    `(${((zeroChapters / totalChapters) * 100).toFixed(1)}%)`
)
console.log(`Median doors per chapter: ${median(doorsPerChapterSorted)}`)

console.log('\nTop 10 books by door count:')
for (const b of top10) {
  console.log(`  ${String(b.doors).padStart(4)}  ${b.book} (${b.chapters} chapters)`)
}

console.log('\nBottom 10 books by door count:')
for (const b of bottom10) {
  console.log(`  ${String(b.doors).padStart(4)}  ${b.book} (${b.chapters} chapters)`)
}
