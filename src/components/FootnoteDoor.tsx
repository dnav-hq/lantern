import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BibleVerse } from '../types'
import { verseSegments, type HighlightRange, type TextPiece } from '../utils/footnoteSpan'
import { isMobileViewport } from '../platform/install'
import { findBookByAlias } from '../utils/bibleBooks'
import CrossVersionPanel from './CrossVersionPanel'
import { Door as WordDoor, type VerseAddress } from './WordDoor'

/**
 * "John 1:14" -> the address the word door needs, or null when the reference
 * cannot be read. The word door is BSB-aligned, so the caller only offers it
 * when the text on screen is the BSB (see the `bsbVerseText` prop).
 */
function wordDoorAddress(reference: string, verseText: string): VerseAddress | null {
  const m = /^(.*?)\s+(\d+):(\d+)$/.exec(reference.trim())
  if (!m) return null
  const book = findBookByAlias(m[1])
  if (!book) return null
  return {
    book: book.number,
    chapter: Number(m[2]),
    verse: Number(m[3]),
    reference,
    verseText
  }
}

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
      <span className="footnote-note-who">Translators’ note</span>
      <span className="footnote-note-text">
        <NoteBody text={text} />
      </span>
    </>
  )
}

function Door({
  phrase,
  display,
  note,
  canOpen,
  verseReference,
  bsbVerseText
}: {
  phrase: string
  // What to actually render inside the door — defaults to `phrase` plain, but
  // a verse also carrying a word-level mark passes the same text split into
  // marked/unmarked pieces (see FootnoteVerseText), so the door's tappable
  // area is still the whole phrase even where part of it is tinted.
  display?: React.ReactNode
  note: string
  canOpen?: () => boolean
  // Present only when the caller threads a chapter reference through (see
  // FootnoteVerseText's `chapterReference` prop) — the cross-version panel's
  // second door renders only then, since without it there is no reference to
  // fetch KJV/NET by.
  verseReference?: string
  bsbVerseText?: string
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  // Read at OPEN time rather than subscribed to: the sheet-vs-popover choice
  // only matters for a popover that is about to exist.
  const [sheet, setSheet] = useState(false)
  // A second, independent door (docs/proposals/cross-version-renderings.md
  // §7.1) — NOT a third state of `open`/`sheet` above, which belong to rung 1
  // and stay exactly as they shipped.
  const [compareOpen, setCompareOpen] = useState(false)
  // The word door's ONLY entrance (2026-09-13, with Dennis): inside the note
  // a translator already left. Rare detail belongs where a reader is already
  // wondering about a word, and nowhere else on the page.
  const [wordOpen, setWordOpen] = useState(false)
  const wordAddress =
    verseReference && bsbVerseText ? wordDoorAddress(verseReference, bsbVerseText) : null
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
    // Scrolling away is how a reader dismisses a sheet without thinking about
    // it — the note has been read, the thumb moves on. The scrim deliberately
    // swallows that gesture (see above), so the page would not move and nothing
    // would happen, which reads as the app being stuck. Closing ON the gesture
    // gives the sheet back to the scroll: the note goes, and the next swipe
    // scrolls normally.
    const onGesture = (): void => setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('touchmove', onGesture, { passive: true })
    window.addEventListener('wheel', onGesture, { passive: true })
    window.addEventListener('scroll', onGesture, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('touchmove', onGesture)
      window.removeEventListener('wheel', onGesture)
      window.removeEventListener('scroll', onGesture)
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
      {display ?? phrase}
      {open && !sheet && (
        <span
          className="footnote-note"
          ref={el => {
            cardRef.current = el
          }}
        >
          <NoteCard text={note} />
          {verseReference && <CompareTrigger onOpen={() => setCompareOpen(true)} />}
          {wordAddress && <WordTrigger onOpen={() => setWordOpen(true)} />}
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
              {verseReference && <CompareTrigger onOpen={() => setCompareOpen(true)} />}
              {wordAddress && <WordTrigger onOpen={() => setWordOpen(true)} />}
            </div>
          </>,
          document.body
        )}
      {wordOpen && wordAddress && (
        <WordDoor address={wordAddress} openOnPhrase={phrase} onClose={() => setWordOpen(false)} />
      )}
      {compareOpen && verseReference && (
        <CrossVersionPanel
          reference={verseReference}
          bsbText={bsbVerseText ?? phrase}
          note={note}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </span>
  )
}

// The second door itself — a plain button, deliberately distinct from the
// dotted-underline mark rung 1 owns (N1/N2:
// docs/proposals/cross-version-renderings.md §5.2). It only ever appears
// inside rung 1's ALREADY-OPEN popover/sheet (§5.1's placement decision), never
// on the resting verse.
// The word door's trigger, same costume as the compare button: a plain line
// inside the already-open note, never on the resting verse.
function WordTrigger({ onOpen }: { onOpen: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      className="footnote-compare-btn"
      onClick={e => {
        e.stopPropagation()
        onOpen()
      }}
    >
      More about this word
    </button>
  )
}

function CompareTrigger({ onOpen }: { onOpen: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      className="footnote-compare-btn"
      onClick={e => {
        e.stopPropagation()
        onOpen()
      }}
    >
      This verse in three translations
    </button>
  )
}

/** One `<mark>` over a piece of text, or the plain text when it isn't marked —
 * shared between the plain-text segments and the pieces inside a door. */
function renderPiece(piece: TextPiece, category: string, key: React.Key): React.ReactNode {
  if (!piece.marked) return piece.text
  return (
    <mark key={key} className={`verse-word-mark cat-${category}`}>
      {piece.text}
    </mark>
  )
}

/**
 * A verse's text, with a door under every phrase the translators flagged AND
 * (optionally) the reader's own word-level mark tinted in place — the same
 * `verseSegments` pass produces both, so the two features can't knock each
 * other out again (see the overlap note on that function).
 *
 * Renders the same `<span className="verse-text">` every reading surface
 * already renders, so a chapter with no notes and no mark — and a chapter
 * served by the self-hosted fallback, which carries no notes — is
 * character-for-character what it was before.
 *
 * @param doors false while a verse selection is live. The underline is REMOVED
 *              for the duration, not left inert (§10a.3). The mark, if any,
 *              is unaffected — it's the reader's own note, not this selection.
 * @param canOpen the page's tap guard, so a drag never opens a note.
 * @param chapterReference the chapter's reference (e.g. "John 1"), so a door
 *              can build this verse's full reference for the cross-version
 *              panel (docs/proposals/cross-version-renderings.md). Optional:
 *              a caller that doesn't pass it simply gets no second door — the
 *              underline and note are unaffected either way.
 * @param highlight the resolved span of a word-level mark on this verse (see
 *              highlightSpan.ts), or omitted/null when there is none — the
 *              whole-verse-tint fallback is a caller concern (it never calls
 *              in here with a span at all) and is unaffected either way.
 */
export default function FootnoteVerseText({
  verse,
  doors = true,
  canOpen,
  chapterReference,
  highlight
}: {
  verse: BibleVerse
  doors?: boolean
  canOpen?: () => boolean
  chapterReference?: string
  highlight?: (HighlightRange & { category: string }) | null
}): React.ReactElement {
  const text = verse.text
  const notes = verse.notes
  const highlightStart = highlight?.start
  const highlightEnd = highlight?.end
  const segments = useMemo(() => {
    const range: HighlightRange | null =
      highlightStart !== undefined && highlightEnd !== undefined
        ? { start: highlightStart, end: highlightEnd }
        : null
    return verseSegments(text, notes, range)
  }, [text, notes, highlightStart, highlightEnd])

  const hasNotes = !!notes?.length
  if ((!doors || !hasNotes) && !highlight) return <span className="verse-text">{text}</span>

  const verseReference = chapterReference ? `${chapterReference}:${verse.verse}` : undefined
  const category = highlight?.category ?? ''
  const parts: React.ReactNode[] = segments.map(seg => {
    if (seg.kind === 'text') return renderPiece(seg, category, `${seg.start}-${seg.end}`)

    const display = seg.pieces.map((p, i) => renderPiece(p, category, i))
    if (!doors) return <React.Fragment key={`${seg.start}-${seg.end}`}>{display}</React.Fragment>
    return (
      <Door
        key={`${seg.start}-${seg.end}`}
        phrase={seg.pieces.map(p => p.text).join('')}
        display={display}
        note={seg.note.text}
        canOpen={canOpen}
        verseReference={verseReference}
        bsbVerseText={text}
      />
    )
  })
  return <span className="verse-text">{parts}</span>
}
