import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NoteSearchResult } from '../types'
import { parseScriptureQuery, parseNoteLine } from '../utils/noteParser'
import { formatRelativeTime } from '../utils/relativeTime'
import { useApi } from '../api/context'
import { bookByNumber } from '../utils/bibleBooks'

export interface SearchJumpTargets {
  // Jump into the Bible view at a book/chapter, landing on `verse` when one is
  // given: BookDetailPage highlights it and scrolls it into view.
  onJumpToChapter: (bookName: string, chapter: number, verse: number | null) => void
  // Open the full study containing a matched note.
  onOpenStudy: (passageId: string) => void
}

interface GlobalSearchProps extends SearchJumpTargets {
  // 'bar' = the always-present desktop top-bar input.
  // 'surface' = the dedicated mobile search page (full-width, own results panel).
  variant: 'bar' | 'surface'
  // Called after any result is chosen, so the host can close the popover/surface.
  onClose?: () => void
  autoFocus?: boolean
}

/**
 * Where a note result should actually take you.
 *
 * Under the note-centric model a passage is invisible interim storage, so
 * "open the study" is not an honest destination — the honest one is the
 * chapter, at the verse the note is anchored to, with the note in context.
 * The note carries its own anchor (with per-note overrides winning), and the
 * result row carries the book, so no extra fetch is needed.
 */
export function noteLanding(r: NoteSearchResult): {
  bookName: string
  chapter: number
  verse: number | null
} | null {
  const book = bookByNumber(r.book_number)
  if (!book) return null
  // reference_label is "Romans 8" or "Romans 8:28-30"; the chapter is the
  // number right after the book name. An anchor override wins when present.
  const labelChapter = /\s(\d+)(?::|$|\s)/.exec(r.reference_label.trim())
  const chapter =
    r.note.anchor_chapter_override ?? (labelChapter ? parseInt(labelChapter[1], 10) : null)
  if (!chapter) return null
  return { bookName: book.name, chapter, verse: r.note.anchor_start_verse ?? null }
}

const DEBOUNCE_MS = 120

// How many note matches the list shows. We ask for one MORE than this: if the
// extra one comes back, there are more matches than we are showing, and the
// reader is told so. Silently cutting the list off is how someone concludes a
// note is lost — which is the exact failure this whole retrieval arc exists to
// prevent.
const NOTE_RESULT_LIMIT = 50

// First-line preview of a note with tag tokens stripped, for the result row.
function notePreview(content: string): string {
  const firstLine = content.split('\n')[0]
  const { segments } = parseNoteLine(firstLine)
  return segments
    .filter(s => s.type !== 'tag')
    .map(s => (s.type === 'text' ? s.raw : s.display))
    .join('')
    .trim()
}

/**
 * One search box, two independently-populating result sections:
 *   (1) scripture-reference matches — pure client-side parse of the query
 *       (parseScriptureQuery); click jumps into the Bible view.
 *   (2) matching notes — BereanApi.searchNotes over note content; click opens
 *       the study in context.
 *
 * The two sections are decoupled by design: (1) is derived synchronously from
 * the query via useMemo, (2) resolves asynchronously and lands whenever it's
 * ready. Neither blocks the other, so a future staggered "populate" animation
 * can key off each section mounting on its own.
 */
export default function GlobalSearch({
  variant,
  onJumpToChapter,
  onOpenStudy,
  onClose,
  autoFocus
}: GlobalSearchProps): React.ReactElement {
  const api = useApi()
  const [query, setQuery] = useState('')
  const [noteResults, setNoteResults] = useState<NoteSearchResult[]>([])
  const [noteResultsTruncated, setNoteResultsTruncated] = useState(false)
  const [notesLoading, setNotesLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // The desktop 'bar' instance's box travels from its resting top-bar slot to
  // a centered command-palette position on focus. Rather than switch the box
  // between absolute (docked) and fixed (centered) — which can't animate
  // smoothly across a containing-block change — it's fixed-positioned at ALL
  // times, and its resting coordinates are measured from its own (always
  // in-flow) parent, `.topnav-search`. This gives CSS a single continuous
  // transform/position transition instead of a jump.
  const [restRect, setRestRect] = useState<{ top: number; left: number; width: number } | null>(
    null
  )
  // Keyboard nav through the combined result list (scripture results first,
  // then notes — same order as rendered). -1 = nothing highlighted yet, so a
  // bare Enter with no arrow-key use doesn't fire a surprise action.
  const [activeIndex, setActiveIndex] = useState(-1)

  // Section 1: scripture reference(s) — synchronous, from the query alone.
  // May be zero, one, or (for an ambiguous book prefix) up to a handful of
  // ranked results; see parseScriptureQuery for the ordering/cap rule.
  const scriptureResults = useMemo(() => parseScriptureQuery(query), [query])

  // Section 2: notes — async, debounced; lands independently of section 1.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setNoteResults([])
      setNotesLoading(false)
      return
    }
    setNotesLoading(true)
    let cancelled = false
    const handle = window.setTimeout(() => {
      api
        .searchNotes(q, NOTE_RESULT_LIMIT + 1)
        .then(rows => {
          if (cancelled) return
          setNoteResultsTruncated(rows.length > NOTE_RESULT_LIMIT)
          setNoteResults(rows.slice(0, NOTE_RESULT_LIMIT))
        })
        .catch(() => {
          if (cancelled) return
          setNoteResultsTruncated(false)
          setNoteResults([])
        })
        .finally(() => {
          if (!cancelled) setNotesLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [api, query])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  // Measure the resting slot (.topnav-search, the always-in-flow parent) so
  // the fixed-positioned box knows where to sit when not focused. Re-measures
  // on resize; skipped while focused/expanded so the expanded rect never gets
  // mistaken for "rest." Deliberately useLayoutEffect, not useEffect: this
  // runs before the browser's first paint, so the CSS fallback (`--rest-left,
  // 0` → left edge) is never actually painted — with useEffect (fires AFTER
  // paint) that fallback frame WAS visible for one frame, then the position
  // transition (meant only for focus/blur) animated it from the left edge to
  // its real spot, reading as the whole search box "flying in from the left"
  // on every page load.
  useLayoutEffect(() => {
    if (variant !== 'bar') return
    const measure = (): void => {
      if (document.activeElement === inputRef.current) return
      const parent = wrapRef.current?.parentElement
      if (!parent) return
      const r = parent.getBoundingClientRect()
      setRestRect({ top: r.top, left: r.left, width: r.width })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [variant])

  // Desktop-only "/" shortcut (the always-present top-bar instance): jumps
  // straight into search, like GitHub/Notion/Linear, without requiring a
  // mouse trip to a small top-right box. Pressing "/" again while already
  // focused closes it instead of typing a literal "/" — a Bible reference or
  // note-search query never legitimately contains one. Ignored while the user
  // is typing anywhere else (an input/textarea/contenteditable, or a modifier
  // is held, e.g. Cmd+/ for something else) so it never hijacks a keystroke
  // mid note-edit. The mobile 'surface' variant has its own dedicated
  // full-screen entry point and doesn't need this.
  useEffect(() => {
    if (variant !== 'bar') return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.activeElement === inputRef.current) {
        e.preventDefault()
        inputRef.current?.blur()
        setQuery('')
        setNoteResults([])
        return
      }
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable
      if (isEditable) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [variant])

  const choose = useCallback(
    (fn: () => void) => {
      fn()
      setQuery('')
      setNoteResults([])
      onClose?.()
    },
    [onClose]
  )

  const hasQuery = query.trim().length > 0
  const showResults = hasQuery
  const nothing =
    hasQuery && scriptureResults.length === 0 && !notesLoading && noteResults.length === 0

  // A note result lands you at the VERSE it is anchored to, not at the passage
  // container. Falls back to opening the study only when the anchor cannot be
  // resolved (an unrecognised book, or a label we cannot parse), so a result is
  // never a dead end.
  const openNote = useCallback(
    (r: NoteSearchResult) => {
      const landing = noteLanding(r)
      if (landing) onJumpToChapter(landing.bookName, landing.chapter, landing.verse)
      else onOpenStudy(r.passage_id)
    },
    [onJumpToChapter, onOpenStudy]
  )

  // Flat, render-order list of every selectable row (scripture first, then
  // notes) so arrow keys/Enter can walk it without caring which section a
  // row lives in. Rebuilt whenever either section's data changes; the reset
  // effect below keeps `activeIndex` from pointing at a row that just moved.
  const flatResults = useMemo(
    () => [
      ...scriptureResults.map(scripture => ({
        onSelect: () =>
          choose(() => onJumpToChapter(scripture.bookName, scripture.chapter, scripture.verse))
      })),
      ...noteResults.map(r => ({
        onSelect: () => choose(() => openNote(r))
      }))
    ],
    [scriptureResults, noteResults, choose, onJumpToChapter, openNote]
  )

  // A fresh query (or the results it produced) invalidates whatever was
  // previously highlighted.
  useEffect(() => {
    setActiveIndex(-1)
  }, [query, scriptureResults, noteResults])

  const restStyle =
    variant === 'bar' && restRect
      ? ({
          '--rest-top': `${restRect.top}px`,
          '--rest-left': `${restRect.left}px`,
          '--rest-width': `${restRect.width}px`
        } as React.CSSProperties)
      : undefined

  const results = (
    <div className="search-results" role="listbox" aria-label="Search results" style={restStyle}>
      {/* Section 1 — scripture reference(s); may be zero, one, or several
          (ambiguous book prefix) ranked results. */}
      {scriptureResults.length > 0 && (
        <div className="search-section" data-section="scripture">
          <div className="search-section-label">Jump to scripture</div>
          {scriptureResults.map((scripture, i) => {
            const ref =
              scripture.verse != null
                ? `${scripture.bookName} ${scripture.chapter}:${scripture.verse}`
                : scripture.kind === 'book'
                  ? scripture.bookName
                  : `${scripture.bookName} ${scripture.chapter}`
            const kindLabel = scripture.kind === 'book' ? 'Open book' : 'Open chapter'
            return (
              <button
                key={`${scripture.bookNumber}-${scripture.chapter}-${scripture.verse ?? ''}`}
                className={`search-result search-result--scripture${i === activeIndex ? ' active' : ''}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() =>
                  choose(() =>
                    onJumpToChapter(scripture.bookName, scripture.chapter, scripture.verse)
                  )
                }
              >
                <span className="search-result-ref">{ref}</span>
                <span className="search-result-kind">{kindLabel}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Section 2 — matching notes */}
      {(notesLoading || noteResults.length > 0) && (
        <div className="search-section" data-section="notes">
          <div className="search-section-label">
            Notes
            {!notesLoading && noteResults.length > 0
              ? ` · ${noteResults.length}${noteResultsTruncated ? '+' : ''}`
              : ''}
          </div>
          {notesLoading && noteResults.length === 0 ? (
            <div className="search-note-loading">Searching notes…</div>
          ) : (
            noteResults.map((r, i) => {
              const preview = notePreview(r.note.content)
              const flatIndex = scriptureResults.length + i
              return (
                <button
                  key={r.note.id}
                  className={`search-result search-result--note${flatIndex === activeIndex ? ' active' : ''}`}
                  role="option"
                  aria-selected={flatIndex === activeIndex}
                  onMouseEnter={() => setActiveIndex(flatIndex)}
                  onClick={() => choose(() => openNote(r))}
                >
                  <div className="search-result-note-top">
                    <span className="search-result-ref">{r.reference_label}</span>
                    <span className="search-result-time note-timestamp">
                      {formatRelativeTime(r.note.updated_at ?? r.note.created_at)}
                    </span>
                  </div>
                  <div className="search-result-note-preview">{preview || '(empty note)'}</div>
                </button>
              )
            })
          )}
          {/* Say it, rather than cutting the list off in silence. A reader who
              cannot see their note and is told nothing concludes it is gone. */}
          {noteResultsTruncated && !notesLoading && (
            <p className="search-truncated">
              Showing the first {noteResults.length} matches. Narrow the search to see more.
            </p>
          )}
        </div>
      )}

      {nothing && (
        <div className="search-empty">No scripture reference or notes match “{query.trim()}”.</div>
      )}
    </div>
  )

  return (
    <div className={`global-search global-search--${variant}`}>
      {/* Full-page dim while the command-palette-style expansion is active —
          a sibling inside the same :focus-within scope so no JS state is
          needed to drive it. Only the 'bar' variant expands like this; the
          mobile 'surface' variant is already its own full-screen page. */}
      {variant === 'bar' && (
        <div
          className="search-backdrop"
          aria-hidden="true"
          onMouseDown={() => inputRef.current?.blur()}
        />
      )}
      <div className="search-input-wrap" ref={wrapRef} style={restStyle}>
        <svg
          className="search-input-icon"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          className="search-input"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              if (query) setQuery('')
              else onClose?.()
              return
            }
            if (!flatResults.length) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIndex(i => (i + 1) % flatResults.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIndex(i => (i - 1 + flatResults.length) % flatResults.length)
            } else if (e.key === 'Enter' && activeIndex >= 0) {
              e.preventDefault()
              flatResults[activeIndex]?.onSelect()
            }
          }}
          onBlur={() => {
            const parent = wrapRef.current?.parentElement
            if (parent) {
              const r = parent.getBoundingClientRect()
              setRestRect({ top: r.top, left: r.left, width: r.width })
            }
          }}
          placeholder="Search references or notes…"
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="search"
          aria-label="Search references or notes"
        />
        {/* Signals the "/" shortcut is available, the way Notion/Linear/GitHub
            do — visible only at rest so it doesn't crowd the query while
            typing. Purely a hint; the input itself works with or without it. */}
        {variant === 'bar' && !query && (
          <kbd className="search-input-kbd" aria-hidden="true">
            /
          </kbd>
        )}
      </div>
      {showResults && results}
    </div>
  )
}
