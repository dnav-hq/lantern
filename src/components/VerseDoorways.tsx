/**
 * The entrance to the dive-in — the ONE line under the verse the reader chose.
 *
 * docs/proposals/dive-in-2.md, "The entrance": one line, and it is real
 * content. A journey chapter leads with the route; otherwise the strongest
 * passage that picks the verse up, with the words the two verses share
 * already marked, and how many more there are; otherwise the places the
 * chapter names. A verse with nothing beneath shows nothing at all. No label,
 * no button costume, no menu: the line IS what is behind the verse, and the
 * count is the only promise it makes.
 *
 * Cost discipline is the loaders': selecting a verse asks the connections
 * loader (one cross-reference chapter, cached forever, plus the chapter's
 * texts only once a door is real) and the chapter-map loader (the journeys
 * table and the place bundle, once per app lifetime). Nothing heavier — no
 * artwork, no relief — until the line is tapped. The word door stays inside
 * the translators' note, where a translator's alternative belongs.
 *
 * This replaced the two-pill doorways row (2026-09-17); the file keeps its
 * name because every reading surface mounts it by that name.
 */
import React, { useEffect, useState } from 'react'
import type { TranslationId } from '../bible/provider'
import { windowAround } from '../utils/connections'
import { connectionsLoader, type VerseConnections } from '../utils/connectionsLoader'
import { loadChapterMap, type ChapterMap } from '../utils/diveMapLoader'
import { useReadingTranslation } from '../utils/useTranslation'
import DiveIn from './DiveIn'
import Marked from './Marked'

interface Props {
  book: number
  chapter: number
  verse: number
  /** "Genesis 15:6" — the label this verse already carries on the page. */
  reference: string
  verseText: string
  /** Kept on the props so callers need not change; the map is on the card now. */
  onOpenMap?: () => void
  /** The translation whose text is on screen. Falls back to the reading preference. */
  translation?: TranslationId
}

/** The route glyph: a small rise-and-fall between two stops. */
const GLYPH = (
  <svg className="dive-entry-glyph" viewBox="0 0 18 10" aria-hidden="true">
    <path d="M2 8 C6 8 6 2 9 2 S12 8 16 8" />
    <circle cx="2" cy="8" r="1.6" />
    <circle cx="16" cy="8" r="1.6" />
  </svg>
)

export default function VerseDoorways({
  onOpenMap: _onOpenMap,
  translation,
  ...address
}: Props): React.ReactElement | null {
  const { book, chapter, verse, reference, verseText } = address
  const [preferred] = useReadingTranslation()
  const shownTranslation = translation ?? preferred
  const [found, setFound] = useState<VerseConnections | null | undefined>(undefined)
  const [map, setMap] = useState<ChapterMap | null | undefined>(undefined)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    setFound(undefined)
    setMap(undefined)
    setOpen(false)
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
  const route = map?.route ?? null
  const places = map?.places ?? []
  const count = rows.length

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

  if (!line) return null
  return (
    <div className="verse-doorways" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className="dive-entry"
        aria-label={`Dive into ${reference}`}
        onClick={() => setOpen(true)}
      >
        {line}
      </button>
      {open && (
        <DiveIn
          address={{ book, chapter, verse, reference, verseText, translation: shownTranslation }}
          found={found ?? null}
          map={map ?? null}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
