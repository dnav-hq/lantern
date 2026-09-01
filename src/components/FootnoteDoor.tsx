import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { VerseNote } from '../bible/provider'
import type { BibleVerse } from '../types'
import { footnoteSpans } from '../utils/footnoteSpan'
import { isMobileViewport } from '../platform/install'

// The footnotes door: the translators' own "Or…" under the words they flagged.
//
// docs/proposals/footnotes-door.md is the whole argument; §10a is what Dennis
// approved and what this builds. The short version:
//
//   - The resting mark is a 1px dotted underline at 34% of the text colour and
//     NOTHING else — no superscript numeral, no dot, no icon, no colour. Colour
//     already means "*I* said something" on this page (the reader's four note
//     categories), and the reader's own marks must win that competition.
//   - It opens on CLICK, on desktop too. CrossRefPill previews a reference on
//     hover because that is cheap; a footnote is a consultation, and hover-to-
//     open means a reader who drags the pointer across a paragraph has consulted
//     five notes without deciding to.
//   - The popover carries the note VERBATIM plus one attribution line. Nothing
//     is paraphrased, explained or summarised, ever. The line exists because an
//     unlabelled "Or…" floating over scripture reads as *Lantern's* opinion,
//     which is the one thing the stance forbids.
//   - On mobile a tap already means "select this verse". So while a selection is
//     live the doors are REMOVED, not disabled: showing a door you have turned
//     off is worse than showing none.

// The notes the seam anchored to this verse.
//
// `BibleVerseLine` (src/bible/provider.ts) carries `notes`; `BiblePassage`'s
// `BibleVerse` (src/types) does not declare them yet, and service.ts passes the
// provider's own objects straight through, so they are there at runtime on
// every read. Widening the shared type is a one-line change in a file this
// slice does not own — until then this is the ONE place that knows it, rather
// than a cast sprinkled through two reading surfaces.
function verseNotes(verse: BibleVerse): VerseNote[] | undefined {
  return (verse as BibleVerse & { notes?: VerseNote[] }).notes
}

// The mockup's own rule (design/footnotes-door.html): the lead word stays
// upright and the alternative it introduces is italic, the way the BSB prints
// it. Presentation only — not one character of the note is changed, added or
// dropped.
const NOTE_LEAD = /^(Or|Literally|Greek|Hebrew|Aramaic)\s+/

function NoteBody({ text }: { text: string }): React.ReactElement {
  const lead = NOTE_LEAD.exec(text)
  if (!lead) return <>{text}</>
  return (
    <>
      {lead[1]} <em>{text.slice(lead[0].length)}</em>
    </>
  )
}

// Spans, not divs: the desktop popover hangs inside the verse's own inline
// text, where a block element would be invalid markup. CSS gives them their
// block layout.
function NoteCard({ text }: { text: string }): React.ReactElement {
  return (
    <>
      <span className="footnote-note-who">Translators’ note · BSB</span>
      <span className="footnote-note-text">
        <NoteBody text={text} />
      </span>
    </>
  )
}

function Door({
  phrase,
  note,
  canOpen
}: {
  phrase: string
  note: string
  canOpen?: () => boolean
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  // Read at OPEN time rather than subscribed to: the sheet-vs-popover choice
  // only matters for a popover that is about to exist.
  const [sheet, setSheet] = useState(false)
  const doorRef = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLElement | null>(null)

  // Outside-tap-to-close, CrossRefPill's model. The SHEET does not use it: its
  // scrim swallows the dismissing tap so that closing a note can't also start a
  // verse selection underneath it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent | MouseEvent): void => {
      if (sheet) return
      const target = e.target as Node
      if (doorRef.current?.contains(target) || cardRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, sheet])

  // Keep an anchored popover on screen. A door near the right edge would
  // otherwise open half off it.
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!open || sheet || !el) return
    el.style.marginLeft = '0px'
    const r = el.getBoundingClientRect()
    const overRight = r.right - (window.innerWidth - 12)
    if (overRight > 0) el.style.marginLeft = `${-overRight}px`
    else if (r.left < 12) el.style.marginLeft = `${12 - r.left}px`
  }, [open, sheet])

  const toggle = (e: React.MouseEvent | React.KeyboardEvent): void => {
    // The door lives inside the verse row, whose click starts a selection. This
    // tap is about the note, so it never reaches it.
    e.stopPropagation()
    if (open) {
      setOpen(false)
      return
    }
    // A drag that just ended, or a press that turned into a scroll, is not a
    // tap on the door — the same guard handleVerseClick uses.
    if (canOpen && !canOpen()) return
    setSheet(isMobileViewport())
    setOpen(true)
  }

  return (
    <span
      ref={doorRef}
      className={`footnote-door${open ? ' is-open' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle(e)
        }
      }}
    >
      {phrase}
      {open && !sheet && (
        <span
          className="footnote-note"
          ref={el => {
            cardRef.current = el
          }}
        >
          <NoteCard text={note} />
        </span>
      )}
      {open &&
        sheet &&
        createPortal(
          <>
            <div
              className="footnote-scrim"
              onClick={e => {
                e.stopPropagation()
                setOpen(false)
              }}
            />
            <div
              className="footnote-sheet"
              ref={el => {
                cardRef.current = el
              }}
              onClick={e => e.stopPropagation()}
            >
              <NoteCard text={note} />
            </div>
          </>,
          document.body
        )}
    </span>
  )
}

/**
 * A verse's text, with a door under every phrase the translators flagged.
 *
 * Renders the same `<span className="verse-text">` every reading surface
 * already renders, so a chapter with no notes — and a chapter served by the
 * self-hosted fallback, which carries none — is character-for-character what it
 * was before.
 *
 * @param doors false while a verse selection is live. The underline is REMOVED
 *              for the duration, not left inert (§10a.3).
 * @param canOpen the page's tap guard, so a drag never opens a note.
 */
export default function FootnoteVerseText({
  verse,
  doors = true,
  canOpen
}: {
  verse: BibleVerse
  doors?: boolean
  canOpen?: () => boolean
}): React.ReactElement {
  const text = verse.text
  const notes = verseNotes(verse)
  const spans = useMemo(() => (notes?.length ? footnoteSpans(text, notes) : []), [text, notes])

  if (!doors || spans.length === 0) return <span className="verse-text">{text}</span>

  const parts: React.ReactNode[] = []
  let at = 0
  for (const span of spans) {
    if (span.start > at) parts.push(text.slice(at, span.start))
    parts.push(
      <Door
        key={`${span.start}-${span.end}`}
        phrase={text.slice(span.start, span.end)}
        note={span.note.text}
        canOpen={canOpen}
      />
    )
    at = span.end
  }
  if (at < text.length) parts.push(text.slice(at))
  return <span className="verse-text">{parts}</span>
}
