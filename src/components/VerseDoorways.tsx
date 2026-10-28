/**
 * The entrance to the dive-in — the ONE line under the verse the reader chose.
 *
 * docs/proposals/dive-in-2.md, "The entrance": one line, and it is real
 * content. A journey chapter leads with the route; otherwise the strongest
 * passage that picks the verse up, with the words the two verses share
 * already marked, and how many more there are; otherwise the places the
 * chapter names. A verse with nothing beneath shows nothing at all.
 *
 * Two things changed on 2026-10-28 (world-class pass, finding 6). The line
 * now carries one constant word, "Dive in", so a first-time reader can tell
 * it is a control and not a stray verse; and while the connections load it
 * holds its place with a quiet skeleton — but only under a verse the gutter
 * dot already promised something for (`expected`), so a verse with nothing
 * beneath never flashes a placeholder. The line used to appear a second or
 * two after the tap, under a verse that had looked empty until then.
 *
 * Translation: the connections are verse-anchored and the same for every
 * translation, and the rows are read in the translation on screen, ESV
 * included (one chapter fetch per connected chapter, through the same cache
 * the reader's own chapters use). No translation is singled out anywhere in
 * the reader (Dennis, 2026-10-28).
 *
 * Cost discipline is the loaders': selecting a verse asks the connections
 * loader (one cross-reference chapter, cached forever, plus the chapter's
 * texts only once a door is real) and the chapter-map loader (the journeys
 * table and the place bundle, once per app lifetime). Nothing heavier — no
 * artwork, no relief — until the line is tapped.
 */
import React, { useEffect, useState } from 'react'
import type { TranslationId } from '../bible/provider'
import { windowAround } from '../utils/connections'
import { connectionsLoader, type VerseConnections } from '../utils/connectionsLoader'
import {
  loadChapterMap,
  placesForVerse,
  verseHasMap,
  type ChapterMap
} from '../utils/diveMapLoader'
import { useReadingTranslation } from '../utils/useTranslation'
import DiveIn, { DiveBody } from './DiveIn'
import type { ConnectionRow } from '../utils/connectionsLoader'
import Marked from './Marked'

interface Props {
  book: number
  chapter: number
  verse: number
  /** "Genesis 15:6" — the label this verse already carries on the page. */
  reference: string
  verseText: string
  /** Opens the whole map framed on this chapter; the card offers it as one quiet line. */
  onOpenMap?: () => void
  /** The translation whose text is on screen. Falls back to the reading preference. */
  translation?: TranslationId
  /**
   * The gutter dot's verdict for this verse: true means the chapter's depth
   * pass already found something beneath it, so the entrance may hold its
   * place with a skeleton while the rows load. Unknown or false means the
   * line appears only once there is something to show.
   */
  expected?: boolean
  /**
   * Study (desktop): the whole dive-in body, open, beside the note — not the
   * one-line entrance. Same content, same rules; only the costume differs,
   * because the workbench already has the room (Dennis, 2026-09-18).
   */
  inline?: boolean
}

/** The route glyph: a small rise-and-fall between two stops. */
const GLYPH = (
  <svg className="dive-entry-glyph" viewBox="0 0 18 10" aria-hidden="true">
    <path d="M2 8 C6 8 6 2 9 2 S12 8 16 8" />
    <circle cx="2" cy="8" r="1.6" />
    <circle cx="16" cy="8" r="1.6" />
  </svg>
)

const CHEVRON = (
  <svg className="dive-entry-chevron" viewBox="0 0 24 24" aria-hidden="true">
    <polyline points="9 6 15 12 9 18" />
  </svg>
)

export default function VerseDoorways({
  onOpenMap,
  translation,
  expected = false,
  inline = false,
  ...address
}: Props): React.ReactElement | null {
  const { book, chapter, verse, reference, verseText } = address
  const [preferred] = useReadingTranslation()
  const shownTranslation = translation ?? preferred
  const [found, setFound] = useState<VerseConnections | null | undefined>(undefined)
  const [map, setMap] = useState<ChapterMap | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [readRow, setReadRow] = useState<ConnectionRow | null>(null)

  useEffect(() => {
    let live = true
    setFound(undefined)
    setMap(undefined)
    setOpen(false)
    setReadRow(null)
    connectionsLoader
      .verse(book, chapter, verse, shownTranslation)
      .then(result => live && setFound(result))
      .catch(() => live && setFound(null))
    loadChapterMap(book, chapter).then(result => live && setMap(result))
    return () => {
      live = false
    }
  }, [book, chapter, verse, shownTranslation])

  const rows = found?.rows ?? []
  // The chapter's map is on the page only where THIS verse earns it: a place
  // it names, or a journey leg cited from it (diveMapLoader.ts, verseHasMap).
  const verseMap = map && verseHasMap(map, verse) ? map : null
  const route = verseMap?.route ?? null
  const places = verseMap ? placesForVerse(verseMap, verse).filter(p => p.inVerse) : []
  const count = rows.length
  const loading = found === undefined || map === undefined

  let line: React.ReactNode = null
  if (route) {
    line = (
      <>
        {GLYPH}
        <span className="dive-entry-text">{route.title}</span>
        {count > 0 && <span className="dive-entry-count">+{count}</span>}
      </>
    )
  } else if (rows.length > 0 && rows[0].text !== null) {
    const first = rows[0]
    const text: string = rows[0].text
    const anchor = first.shared ? first.shared[0] : 0
    const win = windowAround(text, anchor)
    line = (
      <>
        <span className="dive-entry-ref">{first.label}</span>
        <span className="dive-entry-text">
          <Marked
            text={win.text}
            run={first.shared}
            names={first.places}
            from={win.offset}
            ellipsis={win.offset > 0}
          />
        </span>
        {count > 1 && <span className="dive-entry-count">+{count - 1}</span>}
      </>
    )
  } else if (rows.length > 0) {
    line = (
      <>
        <span className="dive-entry-ref">{rows[0].label}</span>
        {count > 1 && <span className="dive-entry-count">+{count - 1}</span>}
      </>
    )
  } else if (places.length > 0) {
    line = (
      <>
        {GLYPH}
        <span className="dive-entry-text">{[...new Set(places.map(p => p.name))].join(' · ')}</span>
      </>
    )
  }

  if (!line && !(loading && expected)) return null
  if (inline) {
    if (!line) return null
    const diveAddress = {
      book,
      chapter,
      verse,
      reference,
      verseText,
      translation: shownTranslation
    }
    return (
      <div className="verse-doorways is-inline" onClick={e => e.stopPropagation()}>
        <DiveBody
          address={diveAddress}
          found={found ?? null}
          map={verseMap}
          onRead={setReadRow}
          onOpenMap={onOpenMap}
        />
        {readRow && (
          <DiveIn
            address={diveAddress}
            found={found ?? null}
            map={verseMap}
            initialStacked={readRow}
            onClose={() => setReadRow(null)}
          />
        )}
      </div>
    )
  }
  if (!line) {
    // Promised by the dot, not yet here: hold the line's place so the verse
    // below does not jump when it lands.
    return (
      <div className="verse-doorways" aria-hidden="true">
        <div className="dive-entry is-loading">
          <span className="dive-entry-label">Connections</span>
          <span className="dive-entry-skeleton" />
        </div>
      </div>
    )
  }
  return (
    <div className="verse-doorways" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className="dive-entry"
        aria-label={`Dive into ${reference}`}
        onClick={() => setOpen(true)}
      >
        <span className="dive-entry-label">Connections</span>
        {line}
        {CHEVRON}
      </button>
      {open && (
        <DiveIn
          address={{ book, chapter, verse, reference, verseText, translation: shownTranslation }}
          found={found ?? null}
          map={verseMap}
          onOpenMap={onOpenMap}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
