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
import { useTextSize } from './utils/useTextSize'

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

interface AppProps {
  // Signed-in display name for the "Welcome back" touch. null on the memory stub.
  displayName: string | null
  // Sign-out handler, or null when there is no auth (memory stub / dev).
  onSignOut: (() => Promise<void>) | null
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
}

export default function App({ displayName, onSignOut }: AppProps): React.ReactElement {
  const api = useApi()
  const [isDark, toggleDark] = useDarkMode()
  const [theme, setTheme] = useTheme()
  const [textSize, setTextSize] = useTextSize()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Reading surface state. `hideNotes` is the persisted Settings preference;
  // `focusReading` is the transient distraction-free toggle (notes hidden +
  // scripture widened) that resets when you leave the passage; `chromeVisible`
  // is driven by the reader's own scrolling (see useScrollDirection).
  const [hideNotes, setHideNotes] = useState(readHideNotes)
  const [focusReading, setFocusReading] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)

  useEffect(() => {
    writeHideNotes(hideNotes)
  }, [hideNotes])

  const [state, setState] = useState<AppState>({
    destination: 'bible',
    passages: [],
    selectedBookName: null,
    selectedPassageId: null,
    selectedChapter: null,
    studyReference: '',
    studyPassageId: null
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

  // Search jump (section 1): open the Bible view at a specific book + chapter.
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
    await refresh()
    setState(prev => ({
      ...prev,
      destination: 'bible',
      selectedPassageId: passageId,
      selectedBookName: null,
      studyPassageId: null
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
    studyPassageId
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

  // Focus is deliberately transient (per the spec: the persisted control is the
  // Settings one), so leaving the passage always drops back to normal chrome.
  useEffect(() => {
    if (!readingSurface) {
      setFocusReading(false)
      setChromeVisible(true)
    }
  }, [readingSurface])

  const notesHidden = hideNotes || focusReading
  const shellClass = [
    'app-shell',
    readingSurface ? 'reading-surface' : '',
    readingSurface && !chromeVisible ? 'chrome-hidden' : '',
    focusReading ? 'focus-reading' : '',
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
          key={`${selectedBibleBook.id}-${selectedChapter ?? 1}`}
          bibleBook={selectedBibleBook}
          initialChapter={selectedChapter ?? 1}
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
        showFocusToggle={readingSurface}
        focusReading={focusReading}
        onToggleFocusReading={() => setFocusReading(f => !f)}
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
