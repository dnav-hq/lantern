import React from 'react'
import { useNotesExport } from '../utils/useNotesExport'

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
    </div>
  )
}
