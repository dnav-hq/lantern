import React, { useCallback, useState } from 'react'
import { useNotesExport } from '../utils/useNotesExport'
import { CHANGELOG } from '../content/changelog'
import { getSeenChangelogVersion, hasUnreadChangelog, markChangelogSeen } from '../utils/changelog'

interface ProfilePageProps {
  displayName: string | null
  onOpenSettings: () => void
  // Sign-out handler, or null when there is no auth (memory stub / dev).
  onSignOut: (() => Promise<void>) | null
  // Set only in guest mode — the sign-in call-to-action for the profile page.
  guestSignIn?: () => void
  // Home-screen install — mirrors the desktop avatar menu's entry. Hidden when
  // already installed or unsupported (see platform/install.ts).
  canInstall?: boolean
  onInstall?: () => void
}

/**
 * The mobile "Profile" destination — the same actions as the desktop avatar
 * menu (Settings, Export, Sign out), laid out as a page.
 */
export default function ProfilePage({
  displayName,
  onOpenSettings,
  onSignOut,
  guestSignIn,
  canInstall = false,
  onInstall
}: ProfilePageProps): React.ReactElement {
  const { state: exportState, run: runExport } = useNotesExport()
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(() => hasUnreadChangelog(getSeenChangelogVersion()))

  const openWhatsNew = useCallback(() => {
    setWhatsNewOpen(true)
    setHasUnread(false)
    markChangelogSeen()
  }, [])
  const closeWhatsNew = useCallback(() => setWhatsNewOpen(false), [])
  const handleWhatsNewKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setWhatsNewOpen(false)
  }, [])

  const initial = (displayName || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="profile-page">
      <div className="profile-page-header">
        <div className="profile-page-avatar">{initial}</div>
        <div className="profile-page-name">
          {displayName || (guestSignIn ? 'Trying Lantern' : 'Studying locally')}
        </div>
        <div className="profile-page-workspace">
          {guestSignIn ? 'Nothing here is saved yet' : 'Personal workspace'}
        </div>
      </div>

      {guestSignIn && (
        <div className="profile-page-actions">
          <button className="profile-page-btn profile-page-btn-primary" onClick={guestSignIn}>
            Sign in to keep your notes
          </button>
        </div>
      )}

      <div className="profile-page-actions">
        <button className="profile-page-btn" onClick={onOpenSettings}>
          Settings
        </button>
        <button
          className="profile-page-btn"
          disabled={exportState === 'exporting'}
          onClick={runExport}
        >
          {exportState === 'exporting' ? 'Exporting…' : 'Export notes'}
        </button>
        {canInstall && onInstall && (
          <button className="profile-page-btn" onClick={onInstall}>
            Add to home screen
          </button>
        )}
        {/* Said once, calmly, and BEFORE anyone needs it. Export only builds
            trust if people know it exists — the durable anger in this category
            is from readers who discovered their notes were trapped at the
            moment they wanted to leave. See journal-retrieval.md section 4. */}
        <p className="profile-page-note">
          Your notes are yours. Export them any time, as plain files.
        </p>
        {exportState === 'error' && (
          <p className="profile-page-error">Export failed. Check your connection and try again.</p>
        )}
        {onSignOut && (
          <button
            className="profile-page-btn profile-page-btn-signout"
            onClick={() => void onSignOut()}
          >
            Sign out
          </button>
        )}
      </div>

      {/* A quiet build marker — so a user (or Dennis, on his phone) can tell at a
          glance which version they are on. Deliberately faint and unobtrusive.

          The COMMIT is what actually identifies a build: the version has read
          2.0.0-dev for every deploy, so on its own it cannot answer "has the fix
          reached my phone yet?" — a question an installed PWA makes genuinely
          hard, since it holds its old shell until a full relaunch. That cost two
          rounds of guessing on 2026-09-02. The sha is already in the bundle for
          telemetry; this just stops hiding it. Absent in dev, where it would be
          a lie rather than a blank. */}
      <div className="profile-page-version">
        Lantern v{import.meta.env.VITE_APP_VERSION}
        {import.meta.env.VITE_COMMIT_SHA ? (
          <> · {import.meta.env.VITE_COMMIT_SHA.slice(0, 7)}</>
        ) : null}
      </div>
      <button type="button" className="profile-page-whatsnew" onClick={openWhatsNew}>
        What's new
        {hasUnread && <span className="wn-dot" aria-hidden="true" />}
      </button>

      {whatsNewOpen && (
        <div className="wn-backdrop" onClick={closeWhatsNew} onKeyDown={handleWhatsNewKeyDown}>
          <div
            className="wn-modal"
            role="dialog"
            aria-modal="true"
            aria-label="What's new"
            onClick={e => e.stopPropagation()}
          >
            <div className="wn-header">
              <span className="wn-title">What's new</span>
              <button type="button" className="wn-close" onClick={closeWhatsNew} aria-label="Close">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="wn-body">
              {CHANGELOG.map(entry => (
                <div key={entry.version} className="wn-entry">
                  <div className="wn-entry-header">
                    <span className="wn-date">{entry.date}</span>
                  </div>
                  <ul className="wn-notes">
                    {entry.lines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
