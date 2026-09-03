import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getBibleVerse } from '../bible/service'
import { findVerbatimMatch, noteAlternative } from '../utils/verbatimMatch'

// The cross-version panel: from an open footnotes door, the SAME verse in
// BSB, KJV and NET, whole, in canonical order, with nothing said comparing
// them. docs/proposals/cross-version-renderings.md is the whole argument;
// §5 is what this builds. The short version:
//
//   - VERSE level only. Phrase-level alignment was measured and declined —
//     the best cheap aligner gets the span exactly right 43.1% of the time
//     on the easiest subset available, and plainly wrong often enough
//     (§2.3-2.4) that drawing it would be a confident, legible, wrong claim
//     about what a translation's words correspond to.
//   - N2, load-bearing and silent if broken: the BSB verse renders as PLAIN
//     TEXT here, never through FootnoteVerseText/its notes markup. If rung
//     1's dotted underline rendered inside this panel, a reader's eye would
//     complete the alignment we refused to compute — nothing would throw,
//     nothing would fail, and the reader would walk away believing Lantern
//     pointed at the KJV's corresponding phrase. See CrossVersionPanel.test.tsx.
//   - N6: a translation missing the verse (the 17 versification exceptions,
//     or a fetch failure) is an OMITTED column — no error, no placeholder.
//   - The one honest extra (§5.1.3): when the note's own alternative wording
//     appears verbatim and exactly once in KJV or NET, mark it — a string the
//     reader can check, never a computed correspondence. Silent otherwise.

const NET_NOTICE = (
  // Mirrors TranslationFooter.tsx's FinePrint NET block. Duplicated rather
  // than imported: TranslationFooter.tsx is out of this feature's
  // files_in_scope, and the licence requires this notice wherever NET text is
  // quoted, including here.
  <p className="cross-version-fine">
    Scripture quoted by permission from the NET Bible® copyright ©1996-2017 by Biblical Studies
    Press, L.L.C. All rights reserved.{' '}
    <a href="https://netbible.com" target="_blank" rel="noopener noreferrer">
      (NET)
    </a>
  </p>
)

function VerseColumn({
  label,
  text,
  alternative,
  fine
}: {
  label: 'BSB' | 'KJV' | 'NET'
  text: string
  alternative: string | null
  fine?: React.ReactNode
}): React.ReactElement {
  const match = alternative ? findVerbatimMatch(alternative, text) : null
  return (
    <div className="cross-version-column">
      <span className="cross-version-label">{label}</span>
      {/* Plain text, deliberately — see N2 in the file header. No
          FootnoteVerseText, no `notes`, no underline of any kind. */}
      <p className="cross-version-verse">
        {match ? (
          <>
            {text.slice(0, match.start)}
            <mark
              className="cross-version-match"
              title="The wording the BSB translators offered, as it stands here"
            >
              {text.slice(match.start, match.end)}
            </mark>
            {text.slice(match.end)}
          </>
        ) : (
          text
        )}
      </p>
      {match && (
        <p className="cross-version-match-caption">↳ the wording BSB offered as an alternative</p>
      )}
      {fine}
    </div>
  )
}

/**
 * @param reference the verse's full reference (e.g. "John 1:5"), used to fetch
 *                   the SAME verse from KJV and NET through the existing
 *                   scripture service — no new data, no new provider.
 * @param bsbText    the BSB verse's plain text, exactly as already on screen.
 * @param note       the translators' note verbatim, for the verbatim-match
 *                   check only — never rendered here (rung 1 owns that panel).
 */
export default function CrossVersionPanel({
  reference,
  bsbText,
  note,
  onClose
}: {
  reference: string
  bsbText: string
  note: string
  onClose: () => void
}): React.ReactElement {
  const [kjvText, setKjvText] = useState<string | null>(null)
  const [netText, setNetText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setKjvText(null)
    setNetText(null)
    // N6: a translation missing this verse (the 17 versification exceptions)
    // or a fetch failure both resolve to `null` here, which VerseColumn simply
    // omits — never an error, never a placeholder.
    getBibleVerse(reference, 'KJV')
      .then(p => {
        if (!cancelled && p && p.verses.length === 1) setKjvText(p.text)
      })
      .catch(() => {})
    getBibleVerse(reference, 'NET')
      .then(p => {
        if (!cancelled && p && p.verses.length === 1) setNetText(p.text)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reference])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const alternative = noteAlternative(note)

  return createPortal(
    <>
      <div className="cross-version-scrim" onClick={onClose} />
      <div
        className="cross-version-sheet"
        role="dialog"
        aria-label="This verse in three translations"
        onClick={e => e.stopPropagation()}
      >
        <p className="cross-version-title">This verse in three translations</p>
        <p className="cross-version-sub">
          BSB · KJV · NET — the three Lantern carries in full. Translators differ; the differences
          are theirs, not ours.
        </p>
        <VerseColumn label="BSB" text={bsbText} alternative={alternative} />
        {kjvText !== null && <VerseColumn label="KJV" text={kjvText} alternative={alternative} />}
        {netText !== null && (
          <VerseColumn label="NET" text={netText} alternative={alternative} fine={NET_NOTICE} />
        )}
        <button type="button" className="cross-version-close" onClick={onClose}>
          Close
        </button>
      </div>
    </>,
    document.body
  )
}
