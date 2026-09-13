import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CategoryMenu from './CategoryMenu'

// The mobile verse-selection bar: the small floating toolbar that rises when you
// select verses, offering TWO choices: "Note" (opens the composer and the
// keyboard) and "Highlight" (opens four colours and opens neither). Two actions
// that look like two actions — a single button that changed meaning depending
// on whether you had typed was a hidden mode. It lives here (rather than inline in
// BookDetailPage) so it can own its own enter/exit animation — it stays mounted
// through a reverse slide-out on dismiss instead of vanishing.
//
// Portaled to <body> on purpose: it is position:fixed, and the chapter deck it
// would otherwise sit inside carries a transform (for the swipe), which would
// trap a fixed element in that containing block and pin it off-screen.

// Matches --dur-3 (the entrance/exit duration in main.css).
const EXIT_MS = 260

interface MobileSelectionBarProps {
  shown: boolean
  reference: string
  onClear: () => void
  onNote: () => void
  /**
   * Applies a highlight in the chosen category. Never opens the keyboard.
   *
   * `words` is set only when the reader chose the "Highlight these words" scope
   * — the exact phrase to store alongside the verse anchor. Undefined means the
   * whole verse, which is what every call meant before word-level marks.
   */
  onHighlight: (category: string, words?: string) => void
  /**
   * The words the reader has selected INSIDE the selected verse, trimmed to
   * word boundaries, or null when they have selected none.
   *
   * Present only on a single-verse selection whose text selection resolves
   * inside that verse. While it is null the picker is character-for-character
   * what it was before — no new row, no new wording.
   */
  selectedWords?: string | null
  /**
   * Discoverability only: a single verse is selected, no words are selected
   * in it yet, and the reader has never used the words-scope row before. Shows
   * the same row greyed out with a one-line hint instead of hiding it — see
   * CategoryMenu's `scopePending`. False (or the reader having used it once)
   * means the bar looks exactly as it did before word-level marks existed.
   */
  wordHintPending?: boolean
  /**
   * The category the selection is ALREADY highlighted in, if any. With one set
   * the picker shows it checked and offers "Remove highlight" — the only way
   * to un-mark a verse on a phone, since a highlight has no card to open.
   */
  highlightedAs?: string | null
  onRemoveHighlight?: () => void
  /**
   * True when the text on screen is not the BSB, so the deep dive (the
   * footnote door) would be silently missing for this selection. Renders one
   * quiet line above the bar offering the same verse in BSB — the study text.
   */
  offerBsb?: boolean
  /** Switches the reading translation to BSB, keeping chapter and selection. */
  onViewInBsb?: () => void
}

export default function MobileSelectionBar({
  shown,
  reference,
  onClear,
  onNote,
  onHighlight,
  selectedWords = null,
  wordHintPending = false,
  highlightedAs = null,
  onRemoveHighlight,
  offerBsb = false,
  onViewInBsb
}: MobileSelectionBarProps): React.ReactElement | null {
  const [mounted, setMounted] = useState(shown)
  const [leaving, setLeaving] = useState(false)
  const [picking, setPicking] = useState(false)
  // Does the next colour pick mark the WORDS or the verse? Off by default, so
  // the picker means what it has always meant, and reset whenever the picker
  // closes or the word selection goes — a scope that outlived the selection it
  // described would be a mode, which is the one thing this bar refuses to be.
  const [wordScope, setWordScope] = useState(false)
  // The selection (and so the reference) clears the instant `shown` goes false,
  // but the bar is still sliding out — freeze the last content so it reads right
  // for the length of that exit.
  const last = useRef({ reference, offerBsb })
  if (shown) last.current = { reference, offerBsb }

  useEffect(() => {
    if (shown) {
      setMounted(true)
      setLeaving(false)
      return
    }
    if (!mounted) return
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setMounted(false)
      return
    }
    setLeaving(true)
    const t = window.setTimeout(() => {
      setMounted(false)
      setLeaving(false)
    }, EXIT_MS)
    return () => window.clearTimeout(t)
  }, [shown, mounted])

  if (!shown && picking) setPicking(false)
  if (wordScope && (!picking || !selectedWords)) setWordScope(false)
  if (!mounted) return null
  const content = shown ? { reference, offerBsb } : last.current

  return createPortal(
    <div
      className={`mobile-selbar${leaving ? ' is-leaving' : ''}`}
      role="toolbar"
      aria-label="Selection actions"
    >
      {/* The deep dive lives on the BSB only. Said once, quietly, with the way
          there — never on BSB, and never as a modal or a disabled button. */}
      {content.offerBsb && onViewInBsb && (
        <p className="mobile-selbar-notice" role="status">
          The deep dive works on the BSB.{' '}
          <button type="button" className="mobile-selbar-notice-link" onClick={onViewInBsb}>
            View this verse in BSB
          </button>
        </p>
      )}
      <span className="mobile-selbar-ref">{content.reference}</span>
      <span className="mobile-selbar-spacer" />
      <button
        type="button"
        className="mobile-selbar-clear"
        onClick={onClear}
        aria-label="Clear selection"
      >
        ✕
      </button>
      {/* Two visible choices, not one that changes meaning. "Note" opens the
          composer and the keyboard; "Highlight" opens four colours and never
          does either. */}
      <div className="mobile-selbar-highlight">
        <button
          type="button"
          className="mobile-selbar-hl"
          onClick={() => setPicking(p => !p)}
          aria-expanded={picking}
        >
          Highlight
        </button>
        {picking && (
          <div className="mobile-selbar-menu">
            <CategoryMenu
              title={
                wordScope
                  ? 'Highlight these words as…'
                  : highlightedAs
                    ? 'Highlighted as…'
                    : 'Highlight as…'
              }
              selected={highlightedAs}
              // One row, and only once there are words to offer. Nothing about
              // this bar changes for a reader who never selects any.
              scopeLabel={selectedWords ? 'Highlight these words' : undefined}
              scopeQuote={selectedWords ?? undefined}
              scopeActive={wordScope}
              onToggleScope={selectedWords ? () => setWordScope(w => !w) : undefined}
              scopePending={!selectedWords && wordHintPending}
              noneLabel={highlightedAs && onRemoveHighlight ? 'Remove highlight' : undefined}
              onPickNone={
                highlightedAs && onRemoveHighlight
                  ? () => {
                      setPicking(false)
                      onRemoveHighlight()
                    }
                  : undefined
              }
              onPick={key => {
                setPicking(false)
                onHighlight(key, wordScope && selectedWords ? selectedWords : undefined)
              }}
            />
          </div>
        )}
      </div>
      <button type="button" className="mobile-selbar-note" onClick={onNote}>
        Note
      </button>
    </div>,
    document.body
  )
}
