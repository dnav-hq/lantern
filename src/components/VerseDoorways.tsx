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
import { connectionsPresence } from '../utils/connectionsLoader'
import { buildDoorways, type PresenceReport } from '../utils/doorways'
import type { VerseAddress } from './WordDoor'
import { ConnectionsDoorFor } from './ConnectionsDoor'
import { useReadingTranslation } from '../utils/useTranslation'
import type { TranslationId } from '../bible/provider'

interface Props extends VerseAddress {
  /** Opens the map (a plain open; chapter framing is the map door's own slice). */
  onOpenMap?: () => void
  /**
   * The translation whose text is on screen: the connections door lights
   * quoted words against it. Falls back to the reading preference.
   */
  translation?: TranslationId
}

export default function VerseDoorways({
  // Kept on the props so callers need not change; the map is no longer
  // entered from here (it is reached from the connections thread).
  onOpenMap: _onOpenMap,
  translation,
  ...address
}: Props): React.ReactElement | null {
  const { book, chapter, verse } = address
  const [preferred] = useReadingTranslation()
  const shownTranslation = translation ?? preferred
  const [report, setReport] = useState<PresenceReport>({})
  const [connectionsOpen, setConnectionsOpen] = useState(false)

  useEffect(() => {
    let live = true
    setReport({})
    // ONE presence check: the connections are the deep dive (Dennis,
    // 2026-09-13). The word door lives inside the footnote popup and the map
    // is reached from the connections thread, so neither is asked here — a
    // row of doors under every verse was a menu, and a menu is exactly the
    // cognitive load this feature exists to remove.
    connectionsPresence(book, chapter, verse)
      .then(connections => live && setReport(r => ({ ...r, connections })))
      .catch(() => live && setReport(r => ({ ...r, connections: null })))
    return () => {
      live = false
    }
  }, [book, chapter, verse])

  const doorways = buildDoorways(report).filter(d => d.kind === 'connections')
  if (doorways.length === 0) return null
  const count = report.connections?.count ?? 0

  return (
    <div className="verse-doorways" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className="verse-doorway"
        data-door="connections"
        onClick={() => setConnectionsOpen(true)}
      >
        Where Scripture picks this up · {count}
      </button>
      {connectionsOpen && (
        <ConnectionsDoorFor
          {...address}
          translation={shownTranslation}
          onClose={() => setConnectionsOpen(false)}
        />
      )}
    </div>
  )
}
