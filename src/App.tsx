import React, { useState, useEffect, useCallback, useRef } from 'react'
import NavBar, { Destination } from './components/NavBar'
import GlobalSearch from './components/GlobalSearch'
import StudyMode, { StudyModeHandle } from './components/StudyMode'
import ReadingMode from './components/ReadingMode'
import BibleLibrary from './components/BibleLibrary'
import BookDetailPage from './components/BookDetailPage'
import JournalPage from './components/JournalPage'
import ProfilePage from './components/ProfilePage'
import ConfirmDialog from './components/ConfirmDialog'
import SettingsModal from './components/SettingsModal'
import OfflineIndicator from './components/OfflineIndicator'
import { Passage } from './types'
import { BIBLE_BOOKS } from './utils/bibleBooks'
import { useApi } from './api/context'
import { useDarkMode } from './utils/useDarkMode'
import { useTheme } from './utils/useTheme'
import { useTranslation } from './utils/useTranslation'
import { useTextSize } from './utils/useTextSize'
import { resolveSettingsAdoption, type UserSettings } from './api/types'
import type { DeepLinkTarget } from './utils/deepLink'

// Persisted "hide all notes" preference — the standalone reading control, kept
// separate from the transient Focus toggle (which hides notes for the session
// only). Plain localStorage, guarded the same way the verse hint is: a storage
// failure means "not hidden", never a crash.
const HIDE_NOTES_KEY = 'berean.hideAllNotes'
function readHideNotes(): boolean {
  try {
    return localStorage.getItem(HIDE_NOTES_KEY) === '1'
  } catch {
    return false
  }
}
function writeHideNotes(value: boolean): void {
  try {
    localStorage.setItem(HIDE_NOTES_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

// Persisted Reading Mode preference — guarded the same way hideAllNotes is,
// so a storage-denied browser just falls back to "off" and never throws.
const FOCUS_READING_KEY = 'berean.focusReading'
function readFocusReading(): boolean {
  try {
    return localStorage.getItem(FOCUS_READING_KEY) === '1'
  } catch {
    return false
  }
}
function writeFocusReading(value: boolean): void {
  try {
    localStorage.setItem(FOCUS_READING_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

interface AppProps {
  // Signed-in display name for the "Welcome back" touch. null on the memory stub.
  displayName: string | null
  // Sign-out handler, or null when there is no auth (memory stub / dev).
  onSignOut: (() => Promise<void>) | null
  // Account settings fetched once at Root's profile-load point (null for the
  // memory stub, where there is no account to sync — see the sync effect
  // below). Undefined is not a valid state once signed in; Root always
  // resolves this to at least `{}` before rendering App.
  accountSettings?: UserSettings | null
  // A resolved G4a deep link (Root.tsx parses `/read/<book>/<chapter>` once at
  // startup) — where a signed-in visitor's reading surface should open instead
  // of the library. Read once, into the initial state below; v1 is on-load
  // parsing only, so this is never consulted again after mount.
  initialDeepLink?: DeepLinkTarget | null
}

interface AppState {
  destination: Destination
  passages: Passage[]
  // Bible destination drill-down: a book (chapter reading) or a saved passage.
  selectedBookName: string | null
  selectedPassageId: string | null
  // Chapter to open when drilling into a book (e.g. a search jump). null = 1.
  selectedChapter: number | null
  // Study destination prefill (set when jumping in from the Bible view or
  // opening an existing study). studyReference prefills a blank study;
  // studyPassageId opens an existing passage in the one StudyMode surface.
  studyReference: string
  studyPassageId: string | null
  // After "Save & Read", the chapter view highlights + scrolls to the verses
  // just written. Consumed once by BookDetailPage, then irrelevant.
  highlightAfterSave: { chapter: number; verses: number[] } | null
}

export default function App({
  displayName,
  onSignOut,
  accountSettings = null,
  initialDeepLink = null
}: AppProps): React.ReactElement {
  const api = useApi()
  const [isDark, toggleDark, setDark] = useDarkMode()
  const [theme, setTheme] = useTheme()
  const [translation, setTranslation] = useTranslation()
  const [textSize, setTextSize] = useTextSize()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Reading surface state — two DELIBERATELY SEPARATE controls (see
  // ReadingControls): `hideNotes` is a content filter (show/hide your notes),
  // persisted as a Settings preference and the ONLY thing that hides notes;
  // `focusReading` is Reading Mode — an environment-only toggle that
  // recedes/restructures the chrome so scripture owns the screen, and never
  // touches note visibility. Persisted like `hideNotes` so it sticks across
  // chapters, navigation and reload; only applied visually while on a
  // reading surface (see shellClass below). `chromeVisible` is driven by the
  // reader's own scrolling (see useScrollDirection).
  const [hideNotes, setHideNotes] = useState(readHideNotes)
  const [focusReading, setFocusReading] = useState(readFocusReading)
  const [chromeVisible, setChromeVisible] = useState(true)

  useEffect(() => {
    writeHideNotes(hideNotes)
  }, [hideNotes])

  useEffect(() => {
    writeFocusReading(focusReading)
  }, [focusReading])

  // Account-synced preferences (docs/proposals/guest-preview-mode.md §2b).
  // localStorage (via the writes above and each hook's own effect) stays the
  // instant, network-independent read path for every caller; this only adds a
  // background account mirror for a signed-in user. onSignOut is null exactly
  // for the guest/memory-stub case, which is untouched by design — no API
  // calls, no second data model.
  const isSignedIn = onSignOut !== null
  const lastSyncedRef = useRef<UserSettings | null>(null)

  useEffect(() => {
    if (!isSignedIn || accountSettings === null || lastSyncedRef.current) return
    const local: UserSettings = {
      darkMode: isDark,
      visualTheme: theme,
      translation,
      hideAllNotes: hideNotes
    }
    const { action, settings } = resolveSettingsAdoption(local, accountSettings)
    if (action === 'hydrate') {
      if (settings.darkMode !== undefined) setDark(settings.darkMode)
      if (settings.visualTheme !== undefined) setTheme(settings.visualTheme)
      if (settings.translation !== undefined) setTranslation(settings.translation)
      if (settings.hideAllNotes !== undefined) setHideNotes(settings.hideAllNotes)
    } else {
      void api.updateSettings(settings)
    }
    lastSyncedRef.current = settings
    // Only ever run once per sign-in (guarded by lastSyncedRef above) — a
    // live-session preference change is handled by the push effect below, not
    // by re-running adoption.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, accountSettings])

  useEffect(() => {
    if (!isSignedIn || !lastSyncedRef.current) return
    const snapshot: UserSettings = {
      darkMode: isDark,
      visualTheme: theme,
      translation,
      hideAllNotes: hideNotes
    }
    const last = lastSyncedRef.current
    const changed =
      last.darkMode !== snapshot.darkMode ||
      last.visualTheme !== snapshot.visualTheme ||
      last.translation !== snapshot.translation ||
      last.hideAllNotes !== snapshot.hideAllNotes
    if (!changed) return
    const timer = setTimeout(() => {
      lastSyncedRef.current = snapshot
      void api.updateSettings(snapshot)
    }, 500)
    return () => clearTimeout(timer)
  }, [isDark, theme, translation, hideNotes, isSignedIn, api])

  // A deep link resolves to a valid book/chapter by construction (Root.tsx
  // only ever passes what parseDeepLink accepted), but a defensive lookup miss
  // still falls back to the ordinary library start state rather than crash.
  const [state, setState] = useState<AppState>(() => {
    const deepLinkBook = initialDeepLink
      ? BIBLE_BOOKS.find(b => b.number === initialDeepLink.bookNumber)
      : undefined
    return {
      destination: 'bible',
      passages: [],
      selectedBookName: deepLinkBook?.name ?? null,
      selectedPassageId: null,
      selectedChapter: deepLinkBook ? initialDeepLink!.chapter : null,
      studyReference: '',
      studyPassageId: null,
      highlightAfterSave: null
    }
  })
  // Mobile-only: the dedicated search surface (an overlay). Desktop search is
  // the always-present top-bar input, so this stays false there.
  const [searchOpen, setSearchOpen] = useState(false)
  // Navigation guard: destination we're trying to reach while the study
  // surface has unsaved notes.
  const [pendingNav, setPendingNav] = useState<Destination | null>(null)
  const studyModeRef = useRef<StudyModeHandle>(null)

  const refresh = useCallback(async () => {
    const passages = await api.getPassages()
    setState(prev => ({ ...prev, passages }))
  }, [api])

  useEffect(() => {
    refresh()
  }, [refresh])

  const doNavigate = (dest: Destination): void => {
    setState(prev => ({
      ...prev,
      destination: dest,
      // Tapping "Bible" always lands on the library, not a stale drill-down.
      ...(dest === 'bible'
        ? { selectedBookName: null, selectedPassageId: null, selectedChapter: null }
        : {}),
      // "+ Study" from the nav starts a blank study.
      ...(dest === 'study' ? { studyReference: '', studyPassageId: null } : {})
    }))
  }

  const handleNavigate = (dest: Destination): void => {
    if (dest === state.destination && dest !== 'bible' && dest !== 'journal') return
    if (state.destination === 'study' && dest !== 'study' && studyModeRef.current?.isDirty()) {
      setPendingNav(dest)
      return
    }
    doNavigate(dest)
  }

  const handleSelectBook = (bookName: string): void => {
    setState(prev => ({
      ...prev,
      destination: 'bible',
      selectedBookName: bookName,
      selectedPassageId: null,
      selectedChapter: null
    }))
  }

  // Open the Bible view at a specific book + chapter. Three callers land here:
  // a search jump, the chapter strip, and swiping/tapping to the next chapter —
  // so the app's view state is always the chapter actually on screen, even when
  // the reader crosses into a different book without going near the library.
  const handleJumpToChapter = (bookName: string, chapter: number): void => {
    setSearchOpen(false)
    setState(prev => ({
      ...prev,
      destination: 'bible',
      selectedBookName: bookName,
      selectedChapter: chapter,
      selectedPassageId: null
    }))
  }

  const handleSaveRead = async (passageId: string): Promise<void> => {
    // Land back in the FULL chapter reading (not the isolated passage view),
    // scrolled to and highlighting the notes just written, so they're seen in
    // context. Fetch fresh here rather than reading the async-lagged state.
    const passages = await api.getPassages()
    const p = passages.find(x => x.id === passageId)
    const bookName = p ? (BIBLE_BOOKS.find(b => b.number === p.book_number)?.name ?? null) : null
    setState(prev => ({
      ...prev,
      passages,
      destination: 'bible',
      selectedPassageId: null,
      studyPassageId: null,
      selectedBookName: bookName,
      selectedChapter: p?.chapter_start ?? null,
      highlightAfterSave:
        p && bookName
          ? {
              chapter: p.chapter_start,
              verses: Array.from(
                { length: Math.max(0, p.verse_end - p.verse_start + 1) },
                (_, i) => p.verse_start + i
              )
            }
          : null
    }))
  }

  const handleSaveNext = async (nextRef?: string): Promise<void> => {
    await refresh()
    setState(prev => ({
      ...prev,
      destination: 'study',
      selectedBookName: null,
      selectedPassageId: null,
      studyPassageId: null,
      studyReference: nextRef || ''
    }))
  }

  // The one open-study path: a Journal row, the reading-view note bridge, and
  // search results all land here — the single StudyMode surface, opened on the
  // existing passage (studyPassageId). WS2/WS3 should call this to open a study.
  const handleOpenStudy = (passageId: string): void => {
    setSearchOpen(false)
    setState(prev => ({
      ...prev,
      destination: 'study',
      studyReference: '',
      studyPassageId: passageId
    }))
  }

  const handleStudyFromReading = (reference: string, passageId?: string): void => {
    setState(prev => ({
      ...prev,
      destination: 'study',
      studyReference: reference,
      studyPassageId: passageId ?? null
    }))
  }

  const {
    destination,
    passages,
    selectedBookName,
    selectedPassageId,
    selectedChapter,
    studyReference,
    studyPassageId,
    highlightAfterSave
  } = state

  const selectedPassage = passages.find(p => p.id === selectedPassageId) || null
  const selectedBibleBook = selectedBookName
    ? BIBLE_BOOKS.find(b => b.name === selectedBookName) || null
    : null

  // The two surfaces that are "just reading": a chapter and a saved passage.
  // Only these get the auto-hiding chrome and the Focus toggle — hiding the nav
  // on the library or the journal would be hiding it from someone navigating.
  const readingSurface =
    destination === 'bible' && (selectedBibleBook !== null || selectedPassage !== null)

  // Reading Mode is a persisted preference now, so leaving the passage does
  // NOT turn it off — only the chrome-hidden (scroll-away) state resets, so a
  // return to a reading surface never inherits a stale collapsed chrome.
  useEffect(() => {
    if (!readingSurface) {
      setChromeVisible(true)
    }
  }, [readingSurface])

  // Toggling Reading Mode always resets the chrome to visible, so an exit never
  // inherits a stale scrolled-away (chrome-hidden) state and jolts.
  useEffect(() => {
    setChromeVisible(true)
  }, [focusReading])

  // Notes are hidden ONLY by the hide-notes control now — Reading Mode
  // (focus-reading) is chrome-only and deliberately leaves notes alone.
  const notesHidden = hideNotes
  const shellClass = [
    'app-shell',
    readingSurface ? 'reading-surface' : '',
    // Never auto-hide the chrome while in Reading Mode — the top bar is already
    // collapsed into the one bar, and letting the scroll-hide transform fight
    // the mode is what made exiting jolt (the bar snapping back then sliding).
    readingSurface && !chromeVisible && !focusReading ? 'chrome-hidden' : '',
    readingSurface && focusReading ? 'focus-reading' : '',
    notesHidden ? 'notes-hidden' : ''
  ]
    .filter(Boolean)
    .join(' ')

  function renderMain(): React.ReactElement {
    if (destination === 'study') {
      return (
        <StudyMode
          ref={studyModeRef}
          key={studyPassageId ?? studyReference}
          initialReference={studyReference}
          initialPassageId={studyPassageId}
          onSaveRead={handleSaveRead}
          onSaveNext={handleSaveNext}
        />
      )
    }

    if (destination === 'journal') {
      return <JournalPage onOpenStudy={handleOpenStudy} />
    }

    if (destination === 'profile') {
      return (
        <ProfilePage
          displayName={displayName}
          onOpenSettings={() => setSettingsOpen(true)}
          onSignOut={onSignOut}
        />
      )
    }

    // Bible destination: library → book (chapters + inline notes) → passage.
    if (selectedBibleBook) {
      return (
        <BookDetailPage
          // Keyed on the BOOK only: moving between chapters is a state change,
          // not a remount, so the reader keeps a live surface to slide. A new
          // book legitimately starts fresh (different notes, different length).
          key={selectedBibleBook.id}
          bibleBook={selectedBibleBook}
          chapter={selectedChapter ?? 1}
          focusReading={focusReading}
          onToggleFocusReading={() => setFocusReading(f => !f)}
          hideNotes={hideNotes}
          onToggleHideNotes={() => setHideNotes(h => !h)}
          initialHighlightVerses={
            highlightAfterSave && highlightAfterSave.chapter === (selectedChapter ?? 1)
              ? highlightAfterSave.verses
              : undefined
          }
          onNavigateChapter={handleJumpToChapter}
          onBack={() =>
            setState(prev => ({ ...prev, selectedBookName: null, selectedChapter: null }))
          }
          onStudy={(ref, passageId) => {
            handleStudyFromReading(ref, passageId)
            refresh()
          }}
          onOpenStudy={handleOpenStudy}
          onRefresh={refresh}
          onChromeVisibleChange={setChromeVisible}
        />
      )
    }

    if (selectedPassage) {
      return (
        <ReadingMode
          key={selectedPassage.id}
          passage={selectedPassage}
          onStudy={passageId => {
            const p = passages.find(p => p.id === passageId)
            handleStudyFromReading(p?.reference_label || '', passageId)
          }}
          onRefresh={refresh}
          onOpenStudy={() => handleOpenStudy(selectedPassage!.id)}
          onPassageDeleted={async () => {
            await refresh()
            setState(prev => ({ ...prev, selectedPassageId: null }))
          }}
          onChromeVisibleChange={setChromeVisible}
          focusReading={focusReading}
          onToggleFocusReading={() => setFocusReading(f => !f)}
          hideNotes={hideNotes}
          onToggleHideNotes={() => setHideNotes(h => !h)}
        />
      )
    }

    return (
      <BibleLibrary
        passages={passages}
        onSelectBook={handleSelectBook}
        displayName={displayName}
        onOpenSearch={() => setSearchOpen(true)}
      />
    )
  }

  return (
    <div className={shellClass}>
      <NavBar
        destination={destination}
        onNavigate={handleNavigate}
        displayName={displayName}
        onOpenSettings={() => setSettingsOpen(true)}
        onSignOut={onSignOut}
        onOpenSearch={() => setSearchOpen(true)}
        searchSlot={
          <GlobalSearch
            variant="bar"
            onJumpToChapter={handleJumpToChapter}
            onOpenStudy={handleOpenStudy}
          />
        }
      />

      <div className="main-area">{renderMain()}</div>

      {/* Dedicated mobile search surface (overlay). Desktop uses the top-bar box. */}
      {searchOpen && (
        <div className="search-surface" role="dialog" aria-modal="true" aria-label="Search">
          <div className="search-surface-head">
            <GlobalSearch
              variant="surface"
              autoFocus
              onJumpToChapter={handleJumpToChapter}
              onOpenStudy={handleOpenStudy}
              onClose={() => setSearchOpen(false)}
            />
            <button
              className="search-surface-close"
              onClick={() => setSearchOpen(false)}
              aria-label="Close search"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isDark={isDark}
        onToggleDark={toggleDark}
        theme={theme}
        onSetTheme={setTheme}
        textSize={textSize}
        onSetTextSize={setTextSize}
        hideNotes={hideNotes}
        onSetHideNotes={setHideNotes}
        onSignOut={onSignOut}
      />

      {/* Navigation guard: unsaved notes on the study surface */}
      <ConfirmDialog
        isOpen={pendingNav !== null}
        title="Unsaved notes"
        message="You have unsaved notes. Save them before leaving?"
        onClose={() => setPendingNav(null)}
        actions={[
          {
            label: 'Save & continue',
            variant: 'primary',
            autoFocus: false,
            onClick: () => {
              const dest = pendingNav
              void (async () => {
                const passageId = await studyModeRef.current?.save()
                setPendingNav(null)
                await refresh()
                if (dest === 'bible' && passageId) {
                  setState(prev => ({
                    ...prev,
                    destination: 'bible',
                    selectedPassageId: passageId,
                    selectedBookName: null,
                    studyReference: '',
                    studyPassageId: null
                  }))
                } else if (dest) {
                  doNavigate(dest)
                }
              })()
            }
          },
          {
            label: 'Discard',
            variant: 'danger',
            autoFocus: false,
            onClick: () => {
              const dest = pendingNav
              setPendingNav(null)
              setState(prev => ({ ...prev, studyReference: '', studyPassageId: null }))
              if (dest) doNavigate(dest)
            }
          },
          {
            label: 'Cancel',
            variant: 'ghost',
            autoFocus: true,
            onClick: () => setPendingNav(null)
          }
        ]}
      />
      <OfflineIndicator />
    </div>
  )
}
