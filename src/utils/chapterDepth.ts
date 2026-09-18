// Which verses of a chapter have depth — the gutter mark's one question.
//
// The mark beside a verse number says PRESENCE and nothing else: tapping this
// verse would open something. It is computed from the same facts the entrance
// opens on (docs/proposals/dive-in-2.md): a connection over the salience line,
// a geocoded place the verse names, or a journey leg cited from it. The one
// thing it cannot see without fetching text is the parallel-account gate, so a
// verse that opens ONLY that way carries no mark; the entrance still appears
// under it when chosen. Precision over recall, as everywhere in the dive-in.
//
// Cost: one cross-reference chapter (about 20 KB, cached forever, translation-
// free) and the chapter map the entrance already loads. Memoized per chapter;
// a failed load is an empty set and is not remembered.
//
// Nothing here may import a Node API — this file lives under src/ and obeys
// the pure-web rule in CLAUDE.md.
import { getChapterConnections } from '../bible/service'
import { connectionsForVerse, doorOpens } from './connections'
import { citationSpan, loadChapterMap } from './diveMapLoader'

const chapters = new Map<string, Promise<ReadonlySet<number>>>()

async function build(book: number, chapter: number): Promise<ReadonlySet<number>> {
  const out = new Set<number>()
  const [connections, map] = await Promise.all([
    getChapterConnections(book, chapter).catch(() => null),
    loadChapterMap(book, chapter)
  ])
  if (connections) {
    for (const key of Object.keys(connections)) {
      const verse = Number(key)
      if (doorOpens(connectionsForVerse(connections, verse))) out.add(verse)
    }
  }
  if (map) {
    for (const key of Object.keys(map.versePlaces)) {
      if ((map.versePlaces[Number(key)]?.length ?? 0) > 0) out.add(Number(key))
    }
    for (const leg of map.route?.legs ?? []) {
      const span = leg.ref ? citationSpan(leg.ref) : null
      if (!span || span.chapter !== chapter) continue
      for (let v = span.from; v <= span.to; v++) out.add(v)
    }
  }
  return out
}

/** The verses of a chapter that would open a dive-in. Never throws. */
export function loadChapterDepth(book: number, chapter: number): Promise<ReadonlySet<number>> {
  const key = `${book}/${chapter}`
  let p = chapters.get(key)
  if (!p) {
    p = build(book, chapter).catch(() => {
      chapters.delete(key)
      return new Set<number>()
    })
    chapters.set(key, p)
  }
  return p
}

/** Test seam. */
export function resetChapterDepth(): void {
  chapters.clear()
}
