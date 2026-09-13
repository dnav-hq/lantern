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
 *
 * Nothing is fetched until the reader selects a verse. See connectionsLoader.ts.
 */
import React, { useEffect, useRef, useState } from 'react'
import type { BibleVerseLine, TranslationId } from '../bible/provider'
import { getBibleVerse } from '../bible/service'
import { bookByNumber } from '../utils/bibleBooks'
import {
  connectionsLoader,
  type ConnectionRow,
  type VerseConnections
} from '../utils/connectionsLoader'
import { DeepDiveSheet, Fold } from './DeepDiveSheet'

/** The glance: one full row, two one-line rows, and the fold. */
const GLANCE_ROWS = 3

const PROVENANCE = 'Cross-references: OpenBible.info, CC BY 4.0.'

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

/** One row: the reference, the reason, and the sentence — whole or one line. */
function Row({
  row,
  full,
  onOpen
}: {
  row: ConnectionRow
  full: boolean
  onOpen: () => void
}): React.ReactElement {
  return (
    <div className="conn">
      <div className="conn-head">
        <button type="button" className="conn-ref" onClick={onOpen}>
          {row.label}
        </button>
        <span className="conn-why">{why(row)}</span>
      </div>
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
    <div className="conn-passage">
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
  const rows = found.rows
  const rest = rows.length - GLANCE_ROWS
  const lead = rows[0]?.kind === 'quotes' ? rows[0].sharedInSource : null

  if (stacked) {
    return (
      <DeepDiveSheet
        reference={address.reference}
        label={`${stacked.label}, from ${address.reference}`}
        onClose={onClose}
        onBack={() => setStacked(null)}
      >
        {/* The breadcrumb: one tappable line that says why you are here and
            takes you back. "Romans 4:3 quotes Genesis 15:6". */}
        <button type="button" className="conn-crumb" onClick={() => setStacked(null)}>
          <strong>{stacked.label}</strong> {stacked.kind} {address.reference}
        </button>
        <Stacked row={stacked} translation={address.translation} />
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

      <p className="word-prov">{PROVENANCE}</p>
    </DeepDiveSheet>
  )
}

/**
 * The entrance: one quiet line under a verse the reader has already chosen,
 * and ONLY where the verse has a door. Selecting a verse costs one chapter
 * fetch (cached forever); a verse below the line renders nothing at all.
 * Temporary and minimal — the doorways row replaces this line.
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
