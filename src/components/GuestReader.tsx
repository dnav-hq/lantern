import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BiblePassage } from '../types'
import { BibleBook, bookByNumber, findBookByAlias } from '../utils/bibleBooks'
import { getBibleVerse } from '../bible/service'
import { useDarkMode } from '../utils/useDarkMode'
import { GUEST_TRANSLATIONS, useGuestTranslation } from '../utils/useTranslation'
import { adjacentChapter, chapterLabel } from '../utils/useChapterNavigation'
import BibleLibrary from './BibleLibrary'
import InlineTagInput from './InlineTagInput'
import ScriptureSkeleton from './ScriptureSkeleton'
import Wordmark from './Wordmark'

/* ─── The guest reading surface ───────────────────────────────────────────────
   The one thing an unauthenticated visitor can reach: scripture, and nothing
   else. Per docs/proposals/guest-preview-mode.md §4 the boundary is STRUCTURAL,
   not a check — Root mounts this tree OUTSIDE ApiProvider, so there is no
   BereanApi to reach even by accident, and `useApi()` would throw loudly if
   anything here ever tried.

   Concretely, that means this file (and everything it imports) must never touch
   `../api/*`. It reads scripture through the BibleProvider seam only
   (`getBibleVerse`), which needs no account, no Supabase and no RLS. Notes,
   passages, sessions, the journal, settings and the profile all stay inside the
   signed-in `ready` tree and are unreachable from here by construction rather
   than by a guard someone could forget to add.

   Reading is never nagged (§2a): a guest who only ever reads is a legitimate,
   satisfied end state, so the only account affordance is one quiet, always-
   available "Sign in" in the corner. Tapping a verse opens the ephemeral note
   sandbox (§3 option B, G2) — the one place a guest is invited to sign in.
   It is pure `useState` inside GuestChapter: no BereanApi, no localStorage, no
   IndexedDB, nothing that outlives this render. The landing CTA (G3) and
   deep-link routing (G4a) remain separate tasks; this file is the seam they
   extend.
   ──────────────────────────────────────────────────────────────────────────── */

interface GuestReaderProps {
  /** Leave guest mode and return to the signed-out landing surface to sign in. */
  onSignIn: () => void
  /**
   * Where to open on first mount — a resolved G4a deep link (App.tsx passes
   * the same shape to the signed-in reading surface). null opens the library,
   * same as before deep-linking existed. Read once; this is not kept in sync
   * with in-app navigation (v1 is on-load parsing only).
   */
  initialLocation?: GuestLocation | null
}

/** Where the guest is reading. Book-relative so prev/next can cross books. */
interface GuestLocation {
  bookNumber: number
  chapter: number
}

function GuestTopBar({
  onSignIn,
  isDark,
  onToggleDark
}: {
  onSignIn: () => void
  isDark: boolean
  onToggleDark: () => void
}): React.ReactElement {
  const [translation, setTranslation] = useGuestTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent): void => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  return (
    <header className="guest-topbar">
      <div className="guest-topbar-lead">
        <Wordmark size={17} />
      </div>
      <div className="guest-topbar-trail">
        {/* Deliberately its own picker rather than TranslationChip: the chip
            renders the full TRANSLATIONS list, and ESV must not be offered to a
            guest at all (not merely disabled). Same store, narrower menu. */}
        <div className="translation-chip-host" ref={pickerRef}>
          <button
            type="button"
            className="translation-chip-btn"
            onClick={() => setPickerOpen(o => !o)}
            aria-haspopup="menu"
            aria-expanded={pickerOpen}
            title={`Switch translation (now ${translation})`}
          >
            {translation}
          </button>
          {pickerOpen && (
            <div className="nav-menu translation-chip-menu" role="menu">
              {GUEST_TRANSLATIONS.map(t => (
                <button
                  key={t.id}
                  className={`nav-menu-item${t.id === translation ? ' active' : ''}`}
                  role="menuitem"
                  onClick={() => {
                    setTranslation(t.id)
                    setPickerOpen(false)
                  }}
                >
                  <span className="translation-chip-menu-abbr">{t.id}</span>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="guest-icon-btn"
          onClick={onToggleDark}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
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
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
        </button>
        <button type="button" className="guest-signin-btn" onClick={onSignIn}>
          Sign in
        </button>
      </div>
    </header>
  )
}

function GuestChapter({
  book,
  chapter,
  onSelectChapter,
  onGo,
  onBack,
  onSignIn
}: {
  book: BibleBook
  chapter: number
  onSelectChapter: (chapter: number) => void
  onGo: (delta: number) => void
  onBack: () => void
  onSignIn: () => void
}): React.ReactElement {
  const [translation] = useGuestTranslation()
  const [passage, setPassage] = useState<BiblePassage | null>(null)
  const [loading, setLoading] = useState(true)
  const [sandboxVerse, setSandboxVerse] = useState<number | null>(null)
  const [sandboxText, setSandboxText] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const selectorRef = useRef<HTMLDivElement>(null)

  // The sandbox is scoped to the chapter it was opened on: verse numbers are
  // only meaningful within the current chapter, so a note "open" for v4 of the
  // old chapter must not silently reappear over v4 of the new one.
  useEffect(() => {
    setSandboxVerse(null)
    setSandboxText('')
  }, [book.number, chapter])

  const handleVerseSelect = useCallback((verseNum: number) => {
    setSandboxVerse(prev => (prev === verseNum ? null : verseNum))
    setSandboxText('')
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    getBibleVerse(`${book.name} ${chapter}`, translation)
      .then(result => {
        if (!active) return
        setPassage(result)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setPassage(null)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [book.name, chapter, translation])

  // A new chapter starts at its first verse, and its pill scrolls into the
  // strip — same reading affordances the signed-in reader has.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
    selectorRef.current
      ?.querySelector('.chapter-pill.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [chapter, book.number])

  const prev = adjacentChapter(book.number, chapter, -1)
  const next = adjacentChapter(book.number, chapter, 1)

  return (
    <div className="book-detail-layout">
      <div className="book-detail-chrome">
        <div className="book-detail-header">
          <div className="book-detail-header-inner">
            <button className="book-detail-back" onClick={onBack}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Library
            </button>
            <h1 className="book-detail-title">{book.name}</h1>
            <div className="book-detail-meta">{book.chapters} chapters</div>
          </div>
        </div>

        <div className="chapter-selector-wrap">
          <div className="chapter-selector-wrap-inner">
            <div className="chapter-selector" ref={selectorRef}>
              {Array.from({ length: book.chapters }, (_, i) => i + 1).map(ch => (
                <button
                  key={ch}
                  className={`chapter-pill${ch === chapter ? ' active' : ''}`}
                  onClick={() => onSelectChapter(ch)}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="book-detail-content" ref={contentRef}>
        <div className="book-chapter-content fade-in guest-scripture">
          <div className="guest-chapter-label">CHAPTER {chapter}</div>

          {loading ? (
            <ScriptureSkeleton />
          ) : passage ? (
            <div className="scripture-grid no-rail">
              {passage.verses.map((v, i) => (
                <div
                  key={v.verse}
                  className="reading-verse-block"
                  style={{ gridRow: i + 1, '--stagger-i': i } as React.CSSProperties}
                >
                  <div
                    className={`reading-verse-row${sandboxVerse === v.verse ? ' selected' : ''}`}
                    onClick={() => handleVerseSelect(v.verse)}
                  >
                    <span className="verse-number">{v.verse}</span>
                    <span className="verse-text">{v.text}</span>
                  </div>

                  {sandboxVerse === v.verse && (
                    <div className="inline-note-row">
                      <div className="quick-edit-card guest-sandbox-card">
                        {/* Permanent, ambient state label — present the instant the
                            editor opens, before any keystroke. Never a toast, never
                            "unsaved": this is the ONE place a guest is invited to
                            sign in (§2a), scoped to this note-taking moment only. */}
                        <div className="guest-sandbox-label" role="status">
                          You&apos;re trying this out. Nothing you type here is saved.{' '}
                          <button
                            type="button"
                            className="guest-sandbox-signin-link"
                            onClick={() => onSignIn()}
                          >
                            Sign in to keep it
                          </button>
                        </div>
                        <div className="quick-edit-body">
                          <InlineTagInput
                            value={sandboxText}
                            onChange={setSandboxText}
                            onEscape={() => handleVerseSelect(v.verse)}
                            className="inline-note-input"
                            placeholder={`v${v.verse} type a note…`}
                            autoFocus
                            multiline
                          />
                        </div>
                        <div className="quick-edit-footer">
                          <span className="quick-edit-hint">
                            <kbd>@</kbd> category · <kbd>v4</kbd> verse · <kbd>esc</kbd> close
                          </span>
                          <button
                            type="button"
                            className="quick-edit-btn quick-edit-btn-cancel"
                            onClick={() => handleVerseSelect(v.verse)}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="guest-scripture-error">
              Could not load this chapter. Check your connection and try again.
            </p>
          )}

          <nav className="chapter-flow-nav" aria-label="Continue reading">
            {prev ? (
              <button
                className="chapter-flow-btn is-prev"
                onClick={() => onGo(-1)}
                aria-label={`Previous: ${chapterLabel(prev)}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span className="chapter-flow-labels">
                  <span className="chapter-flow-dir">Previous</span>
                  <span className="chapter-flow-ref">{chapterLabel(prev)}</span>
                </span>
              </button>
            ) : (
              <span className="chapter-flow-end">The beginning</span>
            )}
            {next ? (
              <button
                className="chapter-flow-btn is-next"
                onClick={() => onGo(1)}
                aria-label={`Next: ${chapterLabel(next)}`}
              >
                <span className="chapter-flow-labels">
                  <span className="chapter-flow-dir">Next</span>
                  <span className="chapter-flow-ref">{chapterLabel(next)}</span>
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <span className="chapter-flow-end">The end</span>
            )}
          </nav>
        </div>
      </div>
    </div>
  )
}

export default function GuestReader({
  onSignIn,
  initialLocation = null
}: GuestReaderProps): React.ReactElement {
  const [isDark, toggleDark] = useDarkMode()
  const [location, setLocation] = useState<GuestLocation | null>(initialLocation)

  const book = location ? bookByNumber(location.bookNumber) : undefined

  const handleGo = useCallback(
    (delta: number) => {
      setLocation(prev => {
        if (!prev) return prev
        const target = adjacentChapter(prev.bookNumber, prev.chapter, delta)
        return target ? { bookNumber: target.bookNumber, chapter: target.chapter } : prev
      })
    },
    [setLocation]
  )

  return (
    <div className="app-shell guest-shell">
      <GuestTopBar onSignIn={onSignIn} isDark={isDark} onToggleDark={toggleDark} />
      <div className="main-area">
        {book && location ? (
          <GuestChapter
            key={book.id}
            book={book}
            chapter={location.chapter}
            onSelectChapter={ch => setLocation({ bookNumber: book.number, chapter: ch })}
            onGo={handleGo}
            onBack={() => setLocation(null)}
            onSignIn={onSignIn}
          />
        ) : (
          // `passages` is the empty array on purpose, not a fetch that returns
          // nothing: a guest has no notes and no way to reach the API that
          // would hold them, so the library renders as pure book navigation.
          <BibleLibrary
            passages={[]}
            onSelectBook={name => {
              const target = findBookByAlias(name)
              if (target) setLocation({ bookNumber: target.number, chapter: 1 })
            }}
          />
        )}
      </div>
    </div>
  )
}
