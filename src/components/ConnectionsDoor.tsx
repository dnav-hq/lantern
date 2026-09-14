/**
 * The connections door — where Scripture echoes this verse.
 *
 * docs/proposals/connections-door.md is the argument; design/deep-dive-doorways.html
 * artboard 3 is the look. What this file keeps, in the order it bites:
 *
 *   - ONE QUESTION, ONE SCREEN. The glance is the held verse, then the three
 *     strongest places Scripture picks it up — the first with its whole
 *     sentence, the next two as one line each — and one quiet fold for the
 *     rest. That is the whole door (deep-dive-doorways.md rules 3 and 4).
 *   - THE ORDER IS OPENBIBLE'S, VERBATIM (brief §1.1). Relevance is order and
 *     prominence — full text, then one line — never a score, a meter or a bar
 *     (§6.1). Nothing here ranks, groups or editorialises.
 *   - THE REASON IS COMPUTED, NOT SOURCED (§4). "Quotes it" is said only where
 *     four or more non-trivial words run through both verses in the translation
 *     on screen, and the shared words are lit; "echoes it" is everything else
 *     and lights nothing. The quotation database the prototype assumed is
 *     unlicensed and is not used in any form (§3.2).
 *   - THE DOOR EXISTS ONLY WHERE THE VERSE HAS IT (§5): the entrance renders
 *     nothing at all — no hint, no disabled line — below the salience line.
 *   - JUMP AND COME BACK (§6.3): a row opens its passage stacked OVER the held
 *     verse, inside this same sheet, with a one-line breadcrumb that climbs
 *     out. The page underneath never changes, so closing lands on the same
 *     verse with the same selection. Depth is ONE: the stacked passage offers
 *     no door onward. That is this slice, said plainly.
 *   - PROVENANCE IS ON THE DOOR (§3.1): OpenBible.info, CC BY 4.0.
 *   - WHERE EACH ROW LANDS (docs/proposals/setting-line.md): one quiet line
 *     under the reference — the BSB's own section heading for the destination
 *     verse, framed as a heading ("Under “Faith and Works”") rather than as a
 *     sentence, because printed bare it would read as Lantern telling the
 *     reader what the passage means (§6.2). It appears only where the shipped
 *     bundle has a line for that verse — the heading has to be within ten
 *     verses (§4, R6) — and a row without one is exactly the row we shipped
 *     before. The source is named ONCE, in the door's provenance, rather than
 *     repeated under every reference.
 *
 * Nothing is fetched until the reader selects a verse. See connectionsLoader.ts.
 */
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BibleVerseLine, TranslationId } from '../bible/provider'
import { getBibleVerse } from '../bible/service'
import { bookByNumber } from '../utils/bibleBooks'
import {
  connectionsLoader,
  type ConnectionRow,
  type VerseConnections
} from '../utils/connectionsLoader'
import type { SettingLine } from '../utils/settingLine'
import { chapterPlaceCount, loadMapJourneys } from '../utils/mapData'
import { findJourneyForChapter, journeyDoorLabel } from '../utils/mapDataLoader'
import { DeepDiveSheet, Fold } from './DeepDiveSheet'
import MapView from './MapView'

/** The glance: one full row, two one-line rows, and the fold. */
const GLANCE_ROWS = 3

const PROVENANCE = 'Cross-references: OpenBible.info, CC BY 4.0.'

/** §4, R5: what the line under each reference is, said once, on the door. */
function settingProvenance(rows: readonly ConnectionRow[]): string | null {
  const headings = rows.some(row => row.setting?.source === 'h')
  const titles = rows.some(row => row.setting?.source === 's')
  if (!headings && !titles) return null
  const what =
    headings && titles
      ? 'Section headings and psalm titles'
      : headings
        ? 'Section headings'
        : 'Psalm titles'
  return `${what} under each reference: Berean Standard Bible (public domain).`
}

interface VerseAddress {
  book: number
  chapter: number
  verse: number
  /** "Genesis 15:6" — the label this verse already carries on the page. */
  reference: string
  verseText: string
  /** The translation on screen; quote-or-echo is typed against its text. */
  translation: TranslationId
}

/** A verse with one run of its words lit. Where there is no run, the verse untouched. */
function Lit({ text, run }: { text: string; run: [number, number] | null }): React.ReactElement {
  if (!run) return <>{text}</>
  const [start, end] = run
  return (
    <>
      {text.slice(0, start)}
      <em className="conn-shared">{text.slice(start, end)}</em>
      {text.slice(end)}
    </>
  )
}

const why = (row: ConnectionRow): string => (row.kind === 'quotes' ? 'quotes it' : 'echoes it')

/**
 * Where the row lands, in one line. A section heading is shown AS a heading —
 * "Under “Faith and Works”" — which is what makes it a true statement about the
 * BSB's own layout rather than a claim about the verse (setting-line.md §4, R5
 * and §6.2). A psalm title is scripture's own words, so it is shown as it
 * stands. `source` names the translation it came from, for the stacked passage,
 * where the door's provenance line is off screen.
 */
function SettingLineRow({
  setting,
  source = false
}: {
  setting: SettingLine | null
  source?: boolean
}): React.ReactElement | null {
  if (!setting) return null
  return (
    <p className="conn-setting">
      {setting.source === 'h' ? (
        <>
          Under <span className="conn-setting-name">“{setting.text}”</span>
        </>
      ) : (
        <span className="conn-setting-name">{setting.text}</span>
      )}
      {source && <span className="conn-setting-source"> · Berean Standard Bible</span>}
    </p>
  )
}

/** One row: the reference, the reason, and the sentence — whole or one line. */
function Row({
  row,
  full,
  onOpen,
  revealed = false
}: {
  row: ConnectionRow
  full: boolean
  onOpen: () => void
  /** True for a row the fold just uncovered — eases it open rather than
   *  snapping (mounts fresh, so the entrance replays exactly once). */
  revealed?: boolean
}): React.ReactElement {
  return (
    <div className={`conn${revealed ? ' deep-reveal' : ''}`}>
      <div className="conn-head">
        <button type="button" className="conn-ref" onClick={onOpen}>
          {row.label}
        </button>
        <span className="conn-why">{why(row)}</span>
      </div>
      <SettingLineRow setting={row.setting} />
      {row.text !== null && (
        <p className={`conn-text${full ? '' : ' one-line'}`} onClick={onOpen}>
          <Lit text={row.text} run={full ? row.shared : null} />
        </p>
      )}
    </div>
  )
}

/**
 * The stacked layer: the connected passage, opened over the held verse. The
 * whole chapter, so the verse is read in its own surroundings, scrolled to
 * the verse itself with the connected verses marked.
 */
function Stacked({
  row,
  translation
}: {
  row: ConnectionRow
  translation: TranslationId
}): React.ReactElement {
  const [lines, setLines] = useState<BibleVerseLine[] | null | undefined>(undefined)
  const target = useRef<HTMLDivElement>(null)
  const last = row.endVerse ?? row.verse

  useEffect(() => {
    let live = true
    setLines(undefined)
    const name = bookByNumber(row.book)?.name
    if (!name) {
      setLines(null)
      return
    }
    getBibleVerse(`${name} ${row.chapter}`, translation)
      .then(passage => live && setLines(passage?.verses ?? null))
      .catch(() => live && setLines(null))
    return () => {
      live = false
    }
  }, [row.book, row.chapter, translation])

  useEffect(() => {
    if (lines) target.current?.scrollIntoView({ block: 'start' })
  }, [lines])

  if (lines === undefined) return <p className="word-door-state">Loading…</p>
  if (lines === null) {
    return <p className="word-door-state">This passage could not be loaded just now.</p>
  }
  return (
    <div className={`conn-passage${row.setting ? ' has-setting' : ''}`}>
      {lines.map(line => {
        const here = line.verse >= row.verse && line.verse <= last
        return (
          <div
            key={line.verse}
            ref={line.verse === row.verse ? target : undefined}
            className={`conn-passage-verse${here ? ' is-target' : ''}`}
          >
            <span className="conn-passage-num">{line.verse}</span>
            <span className="conn-passage-text">
              <Lit text={line.text} run={line.verse === row.verse ? row.shared : null} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The map's entrance (docs/proposals/map-in-the-story.md, slice 5). The door
 * already knows the chapter, so it is the one surface that can offer the map
 * without a reader asking for it — one quiet line at the foot, and ONLY where
 * the chapter has something to show: a hand-authored journey ("Follow Paul's
 * route") or, failing that, geocoded places ("See where this happens"). A
 * chapter with neither renders nothing at all, exactly as the door itself does
 * below the salience line.
 *
 * The journeys table is asked FIRST because it is 18 KB against the place
 * bundle's 145 KB, so the common no-journey answer is cheap; the places are
 * only counted when there is no journey, and they are needed anyway the moment
 * the reader taps.
 */
export function MapLine({
  book,
  chapter,
  className = 'conn-map'
}: {
  book: number
  chapter: number
  /** Where it sits decides its costume: the door foot, or the line under a verse. */
  className?: string
}): React.ReactElement | null {
  const [label, setLabel] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    setLabel(null)
    setOpen(false)
    loadMapJourneys()
      .then(async bundle => {
        if (!live) return
        const journey = findJourneyForChapter(bundle, book, chapter)
        if (journey) {
          setLabel(journeyDoorLabel(journey))
          return
        }
        const places = await chapterPlaceCount(book, chapter)
        if (live && places > 0) setLabel('See where this happens')
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [book, chapter])

  if (!label) return null
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {/* The map is a whole surface, not a card inside a sheet, so it opens
          over the door rather than inside it — and closing it lands back on
          the same door, on the same verse, untouched. */}
      {open &&
        createPortal(
          <div className="map-overlay">
            <MapView chapter={{ book, chapter }} onClose={() => setOpen(false)} />
          </div>,
          document.body
        )}
    </>
  )
}

/** Matches --dur-3 — the stacked passage's own slide, independent of the
 *  sheet's (DeepDiveSheet owns that one). */
const STACK_EXIT_MS = 260

function Door({
  address,
  found,
  onClose
}: {
  address: VerseAddress
  found: VerseConnections
  onClose: () => void
}): React.ReactElement {
  const [more, setMore] = useState(false)
  const [stacked, setStacked] = useState<ConnectionRow | null>(null)
  // The stacked passage slides OUT on Back rather than vanishing, so it stays
  // mounted (rendering the last row it held) for the length of that exit —
  // same shape as MobileSelectionBar's own leaving state.
  const [stackLeaving, setStackLeaving] = useState(false)
  const lastStacked = useRef<ConnectionRow | null>(null)
  if (stacked) lastStacked.current = stacked
  const rows = found.rows
  const rest = rows.length - GLANCE_ROWS
  const lead = rows[0]?.kind === 'quotes' ? rows[0].sharedInSource : null

  const closeStack = (): void => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setStacked(null)
      return
    }
    setStackLeaving(true)
    window.setTimeout(() => {
      setStacked(null)
      setStackLeaving(false)
    }, STACK_EXIT_MS)
  }

  if (stacked || stackLeaving) {
    const row = stacked ?? lastStacked.current!
    return (
      <DeepDiveSheet
        reference={address.reference}
        label={`${row.label}, from ${address.reference}`}
        onClose={onClose}
        onBack={closeStack}
      >
        {/* Slides in over the glance on open, and back out on Back — the
            breadcrumb rides along inside the same block, so it settles into
            place with the passage rather than popping in ahead of it. */}
        <div className={`conn-stack${stackLeaving ? ' is-leaving' : ''}`}>
          {/* The head, sticky as one block: the breadcrumb — one tappable
              line that says why you are here and takes you back, "Romans 4:3
              quotes Genesis 15:6" — and under it where this passage sits, so a
              verse scrolled into view keeps both above it and the reader lands
              knowing where they are. */}
          <div className="conn-stack-head">
            <button type="button" className="conn-crumb" onClick={closeStack}>
              <strong>{row.label}</strong> {row.kind} {address.reference}
            </button>
            <SettingLineRow setting={row.setting} source />
          </div>
          <Stacked row={row} translation={address.translation} />
        </div>
      </DeepDiveSheet>
    )
  }

  return (
    <DeepDiveSheet
      reference={address.reference}
      label={`Where Scripture echoes ${address.reference}`}
      onClose={onClose}
    >
      {/* 1. The verse the reader is holding — the door's heading. */}
      <p className="word-door-verse">
        <Lit text={address.verseText} run={lead} />
      </p>

      {/* 2. Where Scripture picks it up, in OpenBible's order: the first with
          its whole sentence, the next two as one line each. */}
      {rows.slice(0, more ? rows.length : GLANCE_ROWS).map((row, i) => (
        <Row
          key={`${row.book}/${row.chapter}/${row.verse}`}
          row={row}
          full={i === 0}
          onOpen={() => setStacked(row)}
          revealed={i >= GLANCE_ROWS}
        />
      ))}

      {/* 3. The one fold. */}
      {rest > 0 && (
        <Fold
          expanded={more}
          onToggle={() => setMore(m => !m)}
          open="Fewer"
          closed={`${rest} more`}
        />
      )}

      {/* 4. The foot: where this happens, when the chapter has a map to show. */}
      <MapLine book={address.book} chapter={address.chapter} />

      <p className="word-prov">
        {PROVENANCE}
        {settingProvenance(rows) !== null && <> {settingProvenance(rows)}</>}
      </p>
    </DeepDiveSheet>
  )
}

/**
 * The door, opened on demand by the doorways row (VerseDoorways.tsx). The row
 * has already asked the loader whether this verse has a door, so the chapter
 * is cached and this resolves at once; until it does, nothing renders.
 */
export function ConnectionsDoorFor({
  onClose,
  ...address
}: VerseAddress & { onClose: () => void }): React.ReactElement | null {
  const { book, chapter, verse, translation } = address
  const [found, setFound] = useState<VerseConnections | null>(null)
  useEffect(() => {
    let live = true
    connectionsLoader
      .verse(book, chapter, verse, translation)
      .then(result => live && setFound(result))
      .catch(() => live && setFound(null))
    return () => {
      live = false
    }
  }, [book, chapter, verse, translation])
  if (!found) return null
  return <Door address={address} found={found} onClose={onClose} />
}

/**
 * The original single-line entrance. Superseded by the doorways row the same
 * day it was written; kept only until the row has been reviewed on a phone.
 */
export default function ConnectionsDoorEntrance(props: VerseAddress): React.ReactElement | null {
  const { book, chapter, verse, translation } = props
  const [found, setFound] = useState<VerseConnections | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    setFound(null)
    setOpen(false)
    connectionsLoader
      .verse(book, chapter, verse, translation)
      .then(result => live && setFound(result))
      .catch(() => live && setFound(null))
    return () => {
      live = false
    }
  }, [book, chapter, verse, translation])

  if (!found) return null
  return (
    <div className="word-door-entrance" onClick={e => e.stopPropagation()}>
      <button type="button" className="word-door-open" onClick={() => setOpen(true)}>
        Where Scripture echoes this
      </button>
      {open && <Door address={props} found={found} onClose={() => setOpen(false)} />}
    </div>
  )
}
