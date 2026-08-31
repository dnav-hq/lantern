import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import NavBar, { Destination } from './components/NavBar'
import GlobalSearch from './components/GlobalSearch'
import ReadingMode from './components/ReadingMode'
import BibleLibrary from './components/BibleLibrary'
import BookDetailPage from './components/BookDetailPage'
import JournalPage from './components/JournalPage'
import ProfilePage from './components/ProfilePage'
import SettingsModal from './components/SettingsModal'
import OfflineIndicator from './components/OfflineIndicator'
import InstallNudge from './components/InstallNudge'
import { Passage } from './types'
import { BIBLE_BOOKS } from './utils/bibleBooks'
import { useApi } from './api/context'
import { useDarkMode } from './utils/useDarkMode'
import { useTheme, usePureBlack, LOOKS, lookIdFor, type LookId } from './utils/useTheme'
import { useTranslation } from './utils/useTranslation'
import { GuestContext } from './utils/guestContext'
import { useTextSize } from './utils/useTextSize'
import { useInstallPrompt } from './utils/useInstallPrompt'
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

// The width the reading column and the study workbench BOTH need. Mirrors the
// `min-width` guard on `.study-toggle` in main.css — below it the toggle is not
// even shown, and the mode is forced off.
const STUDY_QUERY = '(min-width: 1160px)'

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
  // Set only in guest mode: leaves the ephemeral preview and starts real
  // sign-in. Its presence is what puts the whole App in "guest" framing — a
  // "Sign in" affordance in the nav/profile instead of an account, and the
  // quiet reminder that nothing here is kept.
  guestSignIn?: () => void
}

interface AppState {
  destination: Destination
  passages: Passage[]
  // Bible destination drill-down: a book (chapter reading) or a saved passage.
  selectedBookName: string | null
  selectedPassageId: string | null
  // Chapter to open when drilling into a book (e.g. a search jump). null = 1.
  selectedChapter: number | null
  // Verse to land on when the jump targeted one — a note search result knows
  // the verse its note is anchored to, and "get me back to the place" is the
  // point of searching your own notes. Highlighted and scrolled to by
  // BookDetailPage. null when the jump was chapter-level.
  selectedVerse: number | null
}

export default function App({
  displayName,
  onSignOut,
  accountSettings = null,
  initialDeepLink = null,
  guestSignIn
}: AppProps): React.ReactElement {
  const api = useApi()
  const [isDark, , setDark] = useDarkMode()
  const [theme, setTheme] = useTheme()
  // Pure-black is applied here (App is mounted for the whole session) so the
  // stored choice re-applies on boot, and so selecting a look can set all three
  // appearance axes together. It stays localStorage-only (device-level), not
  // account-synced — an OLED preference is per-screen, not per-account.
  const [pureBlack, setPureBlack] = usePureBlack()
  // The single "look" the Settings list highlights, derived from the three
  // axes; selecting one applies theme + dark + pure-black at once.
  const lookId = lookIdFor(theme, isDark, pureBlack)
  const selectLook = useCallback(
    (id: LookId) => {
      const look = LOOKS.find(l => l.id === id)
      if (!look) return
      setTheme(look.theme)
      setDark(look.dark)
      setPureBlack(look.pureBlack)
    },
    [setTheme, setDark, setPureBlack]
  )
  const [translation, setTranslation] = useTranslation()
  const [textSize, setTextSize] = useTextSize()
  // The reading preferences the display popover and the Settings modal both
  // edit. Bundled so each reading surface drills ONE prop rather than four.
  const displayPrefs = useMemo(
    () => ({ lookId, onSelectLook: selectLook, textSize, onSetTextSize: setTextSize }),
    [lookId, selectLook, textSize, setTextSize]
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Home-screen install: a permanent, quiet menu entry plus at most one
  // contextual nudge, both gated by utils/installNudge.ts. `capability` is
  // 'none' for an already-installed user and for any browser with no install
  // path, and the menu entry simply isn't rendered then.
  const install = useInstallPrompt()
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
      // Deep links are chapter-level today (/read/<book>/<chapter>), so nothing
      // to land on. If they ever carry a verse, this is where it arrives.
      selectedVerse: null
    }
  })
  // Mobile-only: the dedicated search surface (an overlay). Desktop search is
  // the always-present top-bar input, so this stays false there.
  const [searchOpen, setSearchOpen] = useState(false)
  // Study is a MODE on the reading page now, not a destination: the workbench
  // opens beside the chapter you are already reading. It lives here (rather
  // than inside BookDetailPage) because the Study nav tab reflects it and the
  // "open this study" entry points switch it on.
  const [studyOpen, setStudyOpen] = useState(false)
  // Whether this window is wide enough for the workbench at all. Mobile keeps
  // the inline composer and is deliberately untouched by any of this, so on a
  // phone the Study tab simply takes you to the chapter — it never turns a mode
  // on that has nowhere to render.
  const [canStudy, setCanStudy] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(STUDY_QUERY).matches
  )

  const refresh = useCallback(async () => {
    const passages = await api.getPassages()
    setState(prev => ({ ...prev, passages }))
  }, [api])

  useEffect(() => {
    refresh()
  }, [refresh])

  const doNavigate = (dest: Destination): void => {
    setStudyOpen(false)
    setState(prev => ({
      ...prev,
      destination: dest,
      // Tapping "Bible" always lands on the library, not a stale drill-down.
      ...(dest === 'bible'
        ? {
            selectedBookName: null,
            selectedPassageId: null,
            selectedChapter: null,
            selectedVerse: null
          }
        : {})
    }))
  }

  // The Study tab no longer goes anywhere — it turns Study on over whatever
  // chapter you were last reading (or the most recent one you have notes on),
  // which is where studying now happens. With nothing to open it simply lands
  // in the library, rather than on a blank editor for a passage you never chose.
  const openStudyHere = (): void => {
    if (state.destination === 'bible' && state.selectedBookName) {
      setStudyOpen(canStudy)
      return
    }
    const recent = [...state.passages].sort((a, b) =>
      (b.last_studied ?? b.created_at).localeCompare(a.last_studied ?? a.created_at)
    )[0]
    const book = recent ? BIBLE_BOOKS.find(b => b.number === recent.book_number) : undefined
    if (!book || !recent) {
      doNavigate('bible')
      return
    }
    setStudyOpen(canStudy)
    setState(prev => ({
      ...prev,
      destination: 'bible',
      selectedBookName: book.name,
      selectedChapter: recent.chapter_start,
      selectedVerse: null,
      selectedPassageId: null
    }))
  }

  const handleNavigate = (dest: Destination): void => {
    if (dest === 'study') {
      openStudyHere()
      return
    }
    if (dest === state.destination && !studyOpen && dest !== 'bible' && dest !== 'journal') return
    doNavigate(dest)
  }

  const handleSelectBook = (bookName: string): void => {
    setStudyOpen(false)
    setState(prev => ({
      ...prev,
      destination: 'bible',
      selectedBookName: bookName,
      selectedPassageId: null,
      selectedChapter: null,
      selectedVerse: null
    }))
  }

  // Open the Bible view at a specific book + chapter. Three callers land here:
  // a search jump, the chapter strip, and swiping/tapping to the next chapter —
  // so the app's view state is always the chapter actually on screen, even when
  // the reader crosses into a different book without going near the library.
  const handleJumpToChapter = (
    bookName: string,
    chapter: number,
    verse: number | null = null
  ): void => {
    setSearchOpen(false)
    setState(prev => ({
      ...prev,
      destination: 'bible',
      selectedBookName: bookName,
      selectedChapter: chapter,
      selectedVerse: verse,
      selectedPassageId: null
    }))
  }

  // The one open-study path: a Journal row, the reading-view note bridge, and
  // search results all land here. A study is just the notes left on a
  // chapter, so opening one drops you back into reading that chapter (with
  // its notes shown) rather than a separate editor surface — fetch fresh
  // rather than the async-lagged state, same as handleSaveRead.
  const handleOpenStudy = async (passageId: string): Promise<void> => {
    setSearchOpen(false)
    const passages = await api.getPassages()
    const p = passages.find(x => x.id === passageId)
    const bookName = p ? (BIBLE_BOOKS.find(b => b.number === p.book_number)?.name ?? null) : null
    // ...with the workbench open on it, which is what "open the study" means
    // now that studying is a mode on the reading page.
    setStudyOpen(canStudy && bookName !== null)
    setState(prev => ({
      ...prev,
      passages,
      destination: 'bible',
      selectedBookName: bookName,
      selectedChapter: p?.chapter_start ?? null,
      selectedPassageId: null
    }))
  }

  const {
    destination,
    passages,
    selectedBookName,
    selectedPassageId,
    selectedChapter,
    selectedVerse
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

  // The workbench needs room the phone/tablet layout does not have (the toggle
  // itself is hidden below the same width — see .study-toggle). Resizing under
  // it drops the mode rather than leaving a panel half over the text.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(STUDY_QUERY)
    const sync = (): void => {
      setCanStudy(mq.matches)
      if (!mq.matches) setStudyOpen(false)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Leaving the reading surface leaves Study with it — there is nothing beside
  // the library or the journal for a chapter workbench to sit next to.
  useEffect(() => {
    if (!readingSurface) setStudyOpen(false)
  }, [readingSurface])

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

  // Notes are hidden by the hide-notes control — and by Study, where they have
  // MOVED rather than gone: the workbench beside the scripture is now where the
  // chapter's notes live, so the reading column is left clean. Reusing the same
  // flag reuses the proven collapse (the rail eases shut without the fixed
  // scripture measure ever re-wrapping).
  const notesHidden = hideNotes || studyOpen
  const shellClass = [
    'app-shell',
    readingSurface ? 'reading-surface' : '',
    // Never auto-hide the chrome while in Reading Mode — the top bar is already
    // collapsed into the one bar, and letting the scroll-hide transform fight
    // the mode is what made exiting jolt (the bar snapping back then sliding).
    readingSurface && !chromeVisible && !focusReading ? 'chrome-hidden' : '',
    readingSurface && focusReading ? 'focus-reading' : '',
    studyOpen ? 'study-open' : '',
    notesHidden ? 'notes-hidden' : ''
  ]
    .filter(Boolean)
    .join(' ')

  function renderMain(): React.ReactElement {
    if (destination === 'journal') {
      // The Journal is a history of NOTES now, not of saved study containers,
      // so an entry is a chapter — opening one is the same jump-to-chapter the
      // search results and the chapter strip already use.
      return (
        <JournalPage
          onOpenChapter={(bookNumber, chapter) => {
            const book = BIBLE_BOOKS.find(b => b.number === bookNumber)
            if (book) handleJumpToChapter(book.name, chapter)
          }}
        />
      )
    }

    if (destination === 'profile') {
      return (
        <ProfilePage
          displayName={displayName}
          onOpenSettings={() => setSettingsOpen(true)}
          onSignOut={onSignOut}
          guestSignIn={guestSignIn}
          canInstall={install.capability !== 'none'}
          onInstall={install.openInstall}
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
          displayPrefs={displayPrefs}
          onNavigateChapter={handleJumpToChapter}
          // A search result knows the verse, so land on it rather than at the
          // top of the chapter. BookDetailPage highlights and scrolls to it.
          initialHighlightVerses={selectedVerse !== null ? [selectedVerse] : undefined}
          onBack={() => {
            setStudyOpen(false)
            setState(prev => ({ ...prev, selectedBookName: null, selectedChapter: null }))
          }}
          studyOpen={studyOpen}
          onToggleStudy={setStudyOpen}
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
          onStudy={passageId => void handleOpenStudy(passageId)}
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
          displayPrefs={displayPrefs}
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
    <GuestContext.Provider value={Boolean(guestSignIn)}>
      <div className={shellClass}>
        <NavBar
          // Study is a mode, not a place — the tab lights up when the reading
          // page's workbench is open.
          destination={studyOpen ? 'study' : destination}
          onNavigate={handleNavigate}
          displayName={displayName}
          onOpenSettings={() => setSettingsOpen(true)}
          onSignOut={onSignOut}
          guestSignIn={guestSignIn}
          onOpenSearch={() => setSearchOpen(true)}
          canInstall={install.capability !== 'none'}
          onInstall={install.openInstall}
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
          lookId={lookId}
          onSelectLook={selectLook}
          textSize={textSize}
          onSetTextSize={setTextSize}
          hideNotes={hideNotes}
          onSetHideNotes={setHideNotes}
          onSignOut={onSignOut}
        />

        <OfflineIndicator />

        {/* At most one of these is ever on screen: the once-ever nudge, or the
          iOS instructions opened from it or from the menu. */}
        {install.hintVisible ? (
          <InstallNudge variant="hint" onDismiss={install.closeHint} />
        ) : (
          install.nudgeVisible && (
            <InstallNudge
              variant="nudge"
              onAccept={install.acceptNudge}
              onDismiss={install.dismissNudge}
            />
          )
        )}
      </div>
    </GuestContext.Provider>
  )
}
