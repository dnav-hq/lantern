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
  /** The picker is opening: the caller keeps the selected verse clear of it. */
  onPickerOpen?: () => void
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
  /** Shares a link to the selection (the share sheet, or the clipboard). */
  onShare?: () => Promise<void> | void
  /** 'copied' for a moment after a clipboard share, so the bar can say so. */
  shareState?: 'copied' | null
}

/** Said once under the picker's title, until the reader has marked something. */
export const MARK_HINT =
  'Each colour is a lens: what you observe, the history behind it, how it applies, and what it means to you.'

export default function MobileSelectionBar({
  shown,
  reference,
  onClear,
  onNote,
  onHighlight,
  onPickerOpen,
  selectedWords = null,
  wordHintPending = false,
  highlightedAs = null,
  onRemoveHighlight,
  onShare,
  shareState = null
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
  const last = useRef({ reference })
  if (shown) last.current = { reference }

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
  const content = shown ? { reference } : last.current

  return createPortal(
    <div
      className={`mobile-selbar${leaving ? ' is-leaving' : ''}`}
      role="toolbar"
      aria-label="Selection actions"
    >
      <span className="mobile-selbar-ref">
        {shareState === 'copied' ? 'Link copied' : content.reference}
      </span>
      <span className="mobile-selbar-spacer" />
      {onShare && (
        <button
          type="button"
          className="mobile-selbar-share"
          onClick={() => void onShare()}
          aria-label="Share these verses"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <polyline points="7 8 12 3 17 8" />
            <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
          </svg>
        </button>
      )}
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
          onClick={() => {
            // The words are already latched into `selectedWords` by this point
            // (BookDetailPage's selectionchange capture) — the live native
            // selection has nothing left to do. Left alone it lingers behind
            // the picker (confirmed: tapping this button does NOT collapse it
            // on its own), OS callout and all, fighting the very menu that is
            // about to open on top of it.
            window.getSelection()?.removeAllRanges()
            // Words selected means the colours mark the WORDS, straight away:
            // one tap on a colour applies and closes, exactly like a whole-verse
            // mark. The scope row stays as the way back to the whole verse.
            // (Dennis, 2026-09-14: the row ticked and nothing happened.)
            setWordScope(!!selectedWords)
            if (!picking) onPickerOpen?.()
            setPicking(p => !p)
          }}
          aria-expanded={picking}
        >
          Highlight
        </button>
        {picking && (
          <div className="mobile-selbar-menu">
            <CategoryMenu
              title={wordScope ? 'Mark these words as…' : highlightedAs ? 'Marked as…' : 'Mark as…'}
              hint={MARK_HINT}
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
