/**
 * The doorways row — the ONE entrance to the deep dive on the reading page.
 *
 * docs/proposals/deep-dive-doorways.md, item 2, and Dennis's rule for it:
 * simplicity over feature creep. Under the one verse the reader deliberately
 * chose, the row names only the doors that verse actually has — the word
 * behind it, where Scripture picks it up, where the chapter happens — each as
 * a fact in the reader's words, tokens only, no icons. A verse with nothing
 * behind it gets no row at all. It replaced the word door's single
 * "The words behind this verse" line (2026-09-13); it is that line generalised,
 * in the same place, under the same conditions.
 *
 * Cost discipline: selecting a verse asks each layer only "do you have
 * anything here?" — the book's verse shard plus the parsing table for the
 * word index (both memoized, both the door's own first two files), the place
 * bundle's chapter index for the map, and the connections loader's presence
 * call. No door's full data (a lemma shard, the map artwork, a reference list)
 * loads before its doorway is tapped. The checks run in parallel and the row
 * fills in as each resolves; a door that has appeared never leaves.
 *
 * The footnotes door is NOT here: it owns the dotted underline inside the
 * sentence, where a translator's alternative belongs. One door, one costume.
 */
import React, { useEffect, useState } from 'react'
import { chapterPlaceCount } from '../utils/mapData'
import { connectionsPresence } from '../utils/connectionsLoader'
import { buildDoorways, leadWord, type PresenceReport } from '../utils/doorways'
import { wordIndexLoader } from '../utils/wordIndexLoader'
import { Door, type VerseAddress } from './WordDoor'

interface Props extends VerseAddress {
  /** Opens the map (a plain open; chapter framing is the map door's own slice). */
  onOpenMap?: () => void
  /** Opens the connections door for this verse. */
  onOpenConnections?: (verse: number) => void
}

export default function VerseDoorways({
  onOpenMap,
  onOpenConnections,
  ...address
}: Props): React.ReactElement | null {
  const { book, chapter, verse } = address
  const [report, setReport] = useState<PresenceReport>({})
  const [wordOpen, setWordOpen] = useState(false)

  useEffect(() => {
    let live = true
    setReport({})
    // Each presence check lands on its own; a failure is simply no door.
    Promise.all([wordIndexLoader.verseWords(book, chapter, verse), wordIndexLoader.parsing()])
      .then(
        ([words, parsing]) => live && setReport(r => ({ ...r, word: leadWord(words, parsing) }))
      )
      .catch(() => live && setReport(r => ({ ...r, word: null })))
    connectionsPresence(book, chapter, verse)
      .then(connections => live && setReport(r => ({ ...r, connections })))
      .catch(() => live && setReport(r => ({ ...r, connections: null })))
    chapterPlaceCount(book, chapter)
      .then(places => live && setReport(r => ({ ...r, map: { places } })))
      .catch(() => live && setReport(r => ({ ...r, map: null })))
    return () => {
      live = false
    }
  }, [book, chapter, verse])

  const doorways = buildDoorways(report)
  if (doorways.length === 0) return null

  return (
    <div className="verse-doorways" onClick={e => e.stopPropagation()}>
      {doorways.map(d => (
        <button
          key={d.kind}
          type="button"
          className="verse-doorway"
          data-door={d.kind}
          onClick={() => {
            if (d.kind === 'word') setWordOpen(true)
            else if (d.kind === 'connections') onOpenConnections?.(verse)
            else onOpenMap?.()
          }}
        >
          {d.label}
        </button>
      ))}
      {wordOpen && (
        <Door
          address={address}
          openOn={report.word?.lead.strongs}
          onClose={() => setWordOpen(false)}
        />
      )}
    </div>
  )
}
