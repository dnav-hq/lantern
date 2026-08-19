import React, { useCallback, useState } from 'react'
import { useApi } from '../api/context'
import { exportAllNotesAsZip } from '../platform/export'

interface ProfilePageProps {
  displayName: string | null
  onOpenSettings: () => void
  // Sign-out handler, or null when there is no auth (memory stub / dev).
  onSignOut: (() => Promise<void>) | null
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
  canInstall = false,
  onInstall
}: ProfilePageProps): React.ReactElement {
  const api = useApi()
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'error'>('idle')

  const handleExport = useCallback(async () => {
    setExportState('exporting')
    try {
      await exportAllNotesAsZip(api)
      setExportState('idle')
    } catch (err) {
      console.error('[export] failed:', err)
      setExportState('error')
    }
  }, [api])

  const initial = (displayName || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="profile-page">
      <div className="profile-page-header">
        <div className="profile-page-avatar">{initial}</div>
        <div className="profile-page-name">{displayName || 'Studying locally'}</div>
        <div className="profile-page-workspace">Personal workspace</div>
      </div>

      <div className="profile-page-actions">
        <button className="profile-page-btn" onClick={onOpenSettings}>
          Settings
        </button>
        <button
          className="profile-page-btn"
          disabled={exportState === 'exporting'}
          onClick={() => void handleExport()}
        >
          {exportState === 'exporting' ? 'Exporting…' : 'Export notes'}
        </button>
        {canInstall && onInstall && (
          <button className="profile-page-btn" onClick={onInstall}>
            Add to home screen
          </button>
        )}
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
    </div>
  )
}
