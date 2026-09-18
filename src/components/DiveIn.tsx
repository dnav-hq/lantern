/**
 * The dive-in — docs/proposals/dive-in-2.md. One sheet, three things, nothing
 * new to read:
 *
 *   1. THE VERSE, HELD, with the words its strongest connection shares lit.
 *   2. WHERE SCRIPTURE PICKS THIS UP: the dataset's own order (OpenBible's,
 *      verbatim; never a score), each row the reference, the BSB heading it
 *      sits under in grey, and two lines of the passage with the shared words
 *      marked. No author line and no relation words: a lit run says "quotes"
 *      and a lit place name says "names Damascus too" without saying either,
 *      and without a claim about direction (the marks are computed from text
 *      we have the rights to — connections.ts). Tap a row and it opens IN
 *      PLACE, the whole passage, growing between measured heights; the open
 *      row offers one more step, "Read it in James 2", which slides the
 *      chapter in as a pane with the passage lit and a Back that returns to
 *      exactly this view. Depth is one.
 *   3. WHERE THIS HAPPENS: the map card (DiveMap.tsx), the chapter's places on
 *      parchment, or the journey with one leg lit. Journey chapters put the
 *      map FIRST, because that is what the verse is about.
 *
 * Then the one fold for the remaining rows, and provenance once. The door
 * exists only where the verse has something behind it: connections that
 * clear the salience line or a parallel account (connectionsLoader.ts), or a
 * chapter with places or a journey (diveMapLoader.ts). Nothing here ranks,
 * groups or editorialises.
 *
 * This replaced ConnectionsDoor.tsx (2026-09-17); the stacked passage and its
 * slide are that file's, kept.
 */
import React, { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { BibleVerseLine, TranslationId } from '../bible/provider'
import { getBibleVerse } from '../bible/service'
import { bookByNumber } from '../utils/bibleBooks'
import { windowAround } from '../utils/connections'
import type { ConnectionRow, VerseConnections } from '../utils/connectionsLoader'
import type { ChapterMap } from '../utils/diveMapLoader'
import { growClosed, growOpen } from '../utils/measuredHeight'
import type { SettingLine } from '../utils/settingLine'
import { DeepDiveSheet, Fold } from './DeepDiveSheet'
import DiveMap from './DiveMap'
import Marked from './Marked'

/** The glance: three rows, then the fold. */
const GLANCE_ROWS = 3

/** Matches --dur-3 — the stacked passage's own slide, independent of the sheet's. */
const STACK_EXIT_MS = 260

export interface DiveAddress {
  book: number
  chapter: number
  verse: number
  /** "Genesis 15:6" — the label this verse already carries on the page. */
  reference: string
  verseText: string
  /** The translation on screen; the marks are measured against its text. */
  translation: TranslationId
}

interface Props {
  address: DiveAddress
  /** The verse's connections, or null where it has none worth a door. */
  found: VerseConnections | null
  /** The chapter's map, or null where it has neither places nor a journey. */
  map: ChapterMap | null
  onClose: () => void
  /** Open straight onto this row's chapter (the inline body's "Read it in"). */
  initialStacked?: ConnectionRow | null
  onOpenMap?: () => void
}

/** Where the row's marks start: the shared run, else the first shared place. */
function anchorOf(row: ConnectionRow): number {
  if (row.shared) return row.shared[0]
  if (row.text && row.places.length > 0) {
    const first = row.places
      .map(name =>
        row.text!.search(new RegExp(`(^|[^\\p{L}])${escapeRegExp(name)}(?![\\p{L}])`, 'u'))
      )
      .filter(i => i >= 0)
    if (first.length > 0) return Math.min(...first)
  }
  return 0
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** "James 2" from "James 2:23", for "Read it in James 2". */
function chapterOf(label: string): string {
  return label.replace(/:.*$/, '')
}

/** One row. Closed: two lines, windowed on the marks. Open: the whole passage. */
function Row({
  row,
  open,
  onToggle,
  onRead
}: {
  row: ConnectionRow
  open: boolean
  onToggle: (el: HTMLParagraphElement) => void
  onRead: () => void
}): React.ReactElement {
  const textRef = useRef<HTMLParagraphElement>(null)
  const anchor = row.text ? anchorOf(row) : 0
  const win = row.text ? windowAround(row.text, anchor) : null
  const marked = row.shared !== null || row.places.length > 0
  return (
    <div className={`dive-row${open ? ' is-open' : ''}`}>
      <div className="dive-row-head">
        <button
          type="button"
          className="dive-row-ref"
          onClick={() => textRef.current && onToggle(textRef.current)}
        >
          {row.label}
        </button>
        {row.setting && <HeadingLine setting={row.setting} />}
      </div>
      {row.text !== null && win !== null && (
        <p
          ref={textRef}
          className={`dive-row-text${open ? ' is-open' : ' clamp'}${marked ? '' : ' is-muted'}`}
          onClick={() => textRef.current && onToggle(textRef.current)}
        >
          {open ? (
            <Marked text={row.text} run={row.shared} names={row.places} />
          ) : (
            <Marked
              text={win.text}
              run={row.shared}
              names={row.places}
              from={win.offset}
              ellipsis={win.offset > 0}
            />
          )}
        </p>
      )}
      <button type="button" className="dive-row-open" onClick={onRead} tabIndex={open ? 0 : -1}>
        Read it in {chapterOf(row.label)} →
      </button>
    </div>
  )
}

/** The BSB's own heading, shown as a heading (setting-line.md §4 R5); a psalm title as it stands. */
function HeadingLine({ setting }: { setting: SettingLine }): React.ReactElement {
  return <span className="dive-row-heading">{setting.text}</span>
}

/**
 * The stacked pane: the connected passage in its own chapter, scrolled to the
 * verse itself with the shared words and places marked on the target verses.
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
  // `row.shared` is measured on the range's joined text; map it back onto
  // each verse line by its start offset in that join.
  const starts = new Map<number, number>()
  let at = 0
  for (const line of lines) {
    if (line.verse >= row.verse && line.verse <= last) {
      starts.set(line.verse, at)
      at += line.text.length + 1
    }
  }
  return (
    <div className={`conn-passage${row.setting ? ' has-setting' : ''}`}>
      {lines.map(line => {
        const here = line.verse >= row.verse && line.verse <= last
        const start = starts.get(line.verse) ?? 0
        const run: [number, number] | null =
          here && row.shared ? [row.shared[0] - start, row.shared[1] - start] : null
        const inLine = run !== null && run[1] > 0 && run[0] < line.text.length
        return (
          <div
            key={line.verse}
            ref={line.verse === row.verse ? target : undefined}
            className={`conn-passage-verse${here ? ' is-target' : ''}`}
          >
            <span className="conn-passage-num">{line.verse}</span>
            <span className="conn-passage-text">
              {here ? (
                <Marked text={line.text} run={inLine ? run : null} names={row.places} />
              ) : (
                line.text
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function provenance(found: VerseConnections | null, map: ChapterMap | null): string {
  const parts: string[] = []
  if (found) {
    parts.push('Cross-references: OpenBible.info, CC BY 4.0')
    if (found.rows.some(r => r.setting?.source === 'h')) {
      parts.push('section headings: Berean Standard Bible')
    }
    if (found.rows.some(r => r.setting?.source === 's')) parts.push('psalm titles as they stand')
  }
  if (map) parts.push('map: Natural Earth, OpenBible geocoding')
  return parts.join(' · ') + '.'
}

/**
 * The dive-in's body — the verse held, the rows, the map, provenance. On its
 * own it is what Study renders inline beside the note (the grammar in
 * docs/ARCHITECTURE.md: choosing a verse always shows what is beneath it, in
 * every mode); inside `DiveIn` it is the sheet's content.
 */
export function DiveBody({
  address,
  found,
  map,
  onRead,
  onOpenMap
}: {
  address: DiveAddress
  found: VerseConnections | null
  map: ChapterMap | null
  onRead: (row: ConnectionRow) => void
  onOpenMap?: () => void
}): React.ReactElement {
  const [more, setMore] = useState(false)
  const [openRow, setOpenRow] = useState<number | null>(null)
  const rows = found?.rows ?? []
  const rest = rows.length - GLANCE_ROWS
  const lead = rows[0]?.shared ? rows[0].sharedInSource : null
  const journeyFirst = map?.route !== null && map?.route !== undefined

  const toggleRow = (i: number, el: HTMLParagraphElement): void => {
    if (openRow === i) {
      growClosed(el, () => flushSync(() => setOpenRow(null)))
      return
    }
    // One row open at a time: the previous one simply re-clamps (it is off
    // the reader's attention; the motion belongs to the row they touched).
    growOpen(el, () => flushSync(() => setOpenRow(i)))
  }

  const rowsBlock = rows.length > 0 && (
    <div className="dive-rows">
      <p className="dive-eyebrow">Where Scripture picks this up</p>
      {rows.slice(0, more ? rows.length : GLANCE_ROWS).map((row, i) => (
        <Row
          key={`${row.book}/${row.chapter}/${row.verse}`}
          row={row}
          open={openRow === i}
          onToggle={el => toggleRow(i, el)}
          onRead={() => onRead(row)}
        />
      ))}
      {rest > 0 && (
        <Fold
          expanded={more}
          onToggle={() => setMore(m => !m)}
          open="Fewer"
          closed={`${rest} more`}
        />
      )}
    </div>
  )
  const mapBlock = map && (
    <DiveMap
      map={map}
      verse={address.verse}
      translation={address.translation}
      onOpenWhole={onOpenMap}
    />
  )

  return (
    <>
      <p className="word-door-verse">
        <Marked text={address.verseText} run={lead} />
      </p>
      {journeyFirst ? (
        <>
          {mapBlock}
          {rowsBlock}
        </>
      ) : (
        <>
          {rowsBlock}
          {mapBlock}
        </>
      )}
      <p className="dive-prov">{provenance(found, map)}</p>
    </>
  )
}

export default function DiveIn({
  address,
  found,
  map,
  onClose,
  initialStacked = null,
  onOpenMap
}: Props): React.ReactElement {
  const [stacked, setStacked] = useState<ConnectionRow | null>(initialStacked)
  const [stackLeaving, setStackLeaving] = useState(false)
  const lastStacked = useRef<ConnectionRow | null>(null)
  if (stacked) lastStacked.current = stacked

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
        <div className={`conn-stack${stackLeaving ? ' is-leaving' : ''}`}>
          <div className="conn-stack-head">
            <button type="button" className="conn-crumb" onClick={closeStack}>
              <strong>{row.label}</strong> · back to {address.reference}
            </button>
            {row.setting && (
              <p className="conn-setting">
                <span className="conn-setting-name">{row.setting.text}</span>
                <span className="conn-setting-source"> · Berean Standard Bible</span>
              </p>
            )}
          </div>
          <Stacked row={row} translation={address.translation} />
        </div>
      </DeepDiveSheet>
    )
  }

  return (
    <DeepDiveSheet
      reference={address.reference}
      label={`Dive into ${address.reference}`}
      onClose={onClose}
    >
      <DiveBody
        address={address}
        found={found}
        map={map}
        onRead={setStacked}
        onOpenMap={onOpenMap}
      />
    </DeepDiveSheet>
  )
}
