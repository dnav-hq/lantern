import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Wordmark from './Wordmark'
import { useApi } from '../api/context'
import { exportAllNotesAsZip } from '../platform/export'

export type Destination = 'bible' | 'journal' | 'study' | 'profile'

// Matches the literal render order of the bottom tab bar below — used to
// position the sliding active-tab indicator via a plain CSS transform
// (translateX(n * 100%)), no layout measurement needed since all four
// columns are equal-width (flex: 1).
const BOTTOMNAV_ORDER: Destination[] = ['bible', 'journal', 'study', 'profile']

interface NavBarProps {
  destination: Destination
  onNavigate: (dest: Destination) => void
  displayName: string | null
  onOpenSettings: () => void
  // Sign-out handler, or null when there is no auth (memory stub / dev).
  onSignOut: (() => Promise<void>) | null
  // The always-present desktop search box (rendered in the top bar between the
  // tabs and the avatar). Hidden on mobile via CSS.
  searchSlot?: React.ReactNode
  // Opens the dedicated mobile search surface (a tap target in the top bar,
  // shown only under the breakpoint).
  onOpenSearch?: () => void
}

/** Closes the dropdown when a click lands outside `ref`. */
function useClickOutside(
  ref: React.RefObject<HTMLElement>,
  onOutside: () => void,
  active: boolean
): void {
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onOutside, active])
}

/**
 * App navigation: a top bar on desktop, a bottom tab bar on mobile.
 * Destinations: Bible · Journal · + Study · Profile.
 *
 * The "Personal ▾" workspace selector is a deliberate stub — it renders the
 * personal workspace only, so the future group switcher drops in without
 * restructuring the bar.
 */
export default function NavBar({
  destination,
  onNavigate,
  displayName,
  onOpenSettings,
  onSignOut,
  searchSlot,
  onOpenSearch
}: NavBarProps): React.ReactElement {
  const api = useApi()
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [exportState, setExportState] = useState<'idle' | 'exporting'>('idle')
  const workspaceRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  // Desktop tab indicator: a measured sliding pill, matching the mobile
  // bottom bar's jump-between-tabs feel instead of each tab just recoloring
  // in place independently. Measured (not the mobile bar's plain 25%-per-
  // column transform) because desktop tabs are text-sized, not equal-width
  // columns. Only tracks Bible/Journal — Study already has its own distinct
  // permanent look (an accent-outlined pill at rest, solid-filled when
  // active), so sliding a second, differently-styled highlight underneath it
  // would double up/clash. The indicator instead fades out when Study
  // becomes active (staying parked at wherever it last was) and fades back
  // in at the right spot when the user returns to Bible or Journal.
  const topnavTabsRef = useRef<HTMLElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number
    width: number
    visible: boolean
  }>({
    left: 0,
    width: 0,
    visible: false
  })

  useClickOutside(
    workspaceRef,
    useCallback(() => setWorkspaceOpen(false), []),
    workspaceOpen
  )
  useClickOutside(
    profileRef,
    useCallback(() => setProfileOpen(false), []),
    profileOpen
  )

  const handleExport = useCallback(async () => {
    setExportState('exporting')
    try {
      await exportAllNotesAsZip(api)
    } catch (err) {
      console.error('[export] failed:', err)
    }
    setExportState('idle')
  }, [api])

  const initial = (displayName || '?').trim().charAt(0).toUpperCase() || '?'

  // Measure the active tab (Bible/Journal only) and position the sliding
  // indicator to match — before paint, so it never visibly snaps into its
  // initial spot. Re-measures on resize (tab widths depend on font
  // rendering/container width).
  useLayoutEffect(() => {
    const measure = (): void => {
      const container = topnavTabsRef.current
      if (!container) return
      if (destination !== 'bible' && destination !== 'journal') {
        setIndicatorStyle(s => ({ ...s, visible: false }))
        return
      }
      const tab = container.querySelector<HTMLElement>(`[data-dest="${destination}"]`)
      if (!tab) return
      const containerRect = container.getBoundingClientRect()
      const tabRect = tab.getBoundingClientRect()
      setIndicatorStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
        visible: true
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [destination])

  const navTab = (
    dest: Destination,
    label: string,
    icon: React.ReactElement
  ): React.ReactElement => (
    <button
      className={`nav-tab${dest === 'study' ? ' nav-tab-action' : ''}${destination === dest ? ' active' : ''}`}
      onClick={() => onNavigate(dest)}
      aria-current={destination === dest ? 'page' : undefined}
      data-dest={dest}
    >
      {icon}
      <span className="nav-tab-label">{label}</span>
    </button>
  )

  const bibleIcon = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
  const journalIcon = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="9" y1="8" x2="16" y2="8" />
      <line x1="9" y1="12" x2="14" y2="12" />
    </svg>
  )
  // Desktop hides this (.topnav-tabs .nav-tab svg { display:none }; that tab
  // is text-first, "+ Study"). Two prior attempts at a special mobile
  // treatment (accent color, then a filled shape badge) both read as
  // "strange" — an odd-one-out among three consistent line icons draws the
  // eye for the wrong reason. Reverted to the same plain-line style as
  // Bible/Journal/Profile; Study is differentiated by label and function,
  // not by icon decoration. See BACKLOG for the mobile nav priority
  // discussion this is part of.
  const studyIcon = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
  const profileIcon = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )

  return (
    <>
      {/* ── Top bar (desktop full nav; mobile shows only the leading slot) ── */}
      <header className="topnav">
        <div className="topnav-lead">
          <Wordmark size={19} />
          <div className="workspace-selector" ref={workspaceRef}>
            <button
              className="workspace-btn"
              onClick={() => setWorkspaceOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={workspaceOpen}
            >
              Personal
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {workspaceOpen && (
              <div className="nav-menu workspace-menu" role="menu">
                <button
                  className="nav-menu-item active"
                  role="menuitem"
                  onClick={() => setWorkspaceOpen(false)}
                >
                  <span className="workspace-dot" />
                  Personal
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ marginLeft: 'auto' }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
                <div className="nav-menu-divider" />
                <div className="nav-menu-hint">Shared group spaces — coming later</div>
              </div>
            )}
          </div>
        </div>

        <nav
          className="topnav-tabs"
          aria-label="Primary"
          ref={topnavTabsRef as React.RefObject<HTMLElement>}
        >
          <span
            className="topnav-tab-indicator"
            aria-hidden="true"
            style={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              opacity: indicatorStyle.visible ? 1 : 0
            }}
          />
          {navTab('bible', 'Bible', bibleIcon)}
          {navTab('journal', 'Journal', journalIcon)}
          {navTab('study', '+ Study', studyIcon)}
        </nav>

        {/* Grouped so the grid's outer two columns (lead / right) are forced to
            equal width — see .topnav's grid-template-columns — which is what
            makes the center tabs land on the true viewport center regardless
            of the logo vs. search+avatar's own (unequal) natural widths. */}
        <div className="topnav-right">
          {searchSlot && <div className="topnav-search">{searchSlot}</div>}

          {/* Mobile-only search trigger — opens the dedicated search surface. */}
          {onOpenSearch && (
            <button className="topnav-search-btn" onClick={onOpenSearch} aria-label="Search">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}

          <div className="topnav-trail">
            <div className="profile-menu-host" ref={profileRef}>
              <button
                className="avatar-btn"
                onClick={() => setProfileOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                aria-label="Account menu"
              >
                {initial}
              </button>
              {profileOpen && (
                <div className="nav-menu profile-menu" role="menu">
                  <div className="nav-menu-name">{displayName || 'Studying locally'}</div>
                  <div className="nav-menu-divider" />
                  <button
                    className="nav-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false)
                      onOpenSettings()
                    }}
                  >
                    Settings
                  </button>
                  <button
                    className="nav-menu-item"
                    role="menuitem"
                    disabled={exportState === 'exporting'}
                    onClick={() => void handleExport()}
                  >
                    {exportState === 'exporting' ? 'Exporting…' : 'Export notes'}
                  </button>
                  {onSignOut && (
                    <>
                      <div className="nav-menu-divider" />
                      <button
                        className="nav-menu-item"
                        role="menuitem"
                        onClick={() => void onSignOut()}
                      >
                        Sign out
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Bottom tab bar (mobile only) ── */}
      <nav
        className="bottomnav"
        aria-label="Primary"
        style={
          {
            '--bottomnav-active-index': BOTTOMNAV_ORDER.indexOf(destination)
          } as React.CSSProperties
        }
      >
        <span className="bottomnav-indicator" aria-hidden="true" />
        {navTab('bible', 'Bible', bibleIcon)}
        {navTab('journal', 'Journal', journalIcon)}
        {/* Plain "Study" here, not "+ Study" — the badge icon already carries
            the "+"; the desktop text-only tab keeps the prefix since it has
            no icon to carry that signal instead. */}
        {navTab('study', 'Study', studyIcon)}
        {navTab('profile', 'Profile', profileIcon)}
      </nav>
    </>
  )
}
