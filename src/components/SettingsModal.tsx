import React, { useCallback, useState } from 'react'
import { useApi } from '../api/context'
import { exportAllNotesAsZip } from '../platform/export'
import { type LookId } from '../utils/useTheme'
import { type TextSizeId } from '../utils/useTextSize'
import ReadingPrefs from './ReadingPrefs'
import { isTelemetryOptedOut, setTelemetryOptedOut } from '../telemetry/client'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  // The active look (theme + light/dark + pure-black bundled), and a setter that
  // applies all three axes at once. See LOOKS / lookIdFor in useTheme.ts.
  lookId: LookId
  onSelectLook: (id: LookId) => void
  textSize: TextSizeId
  onSetTextSize: (size: TextSizeId) => void
  // Persisted "hide all notes" preference. Deliberately separate from the top
  // bar's transient Focus toggle: this one is a standing choice about how you
  // read, and it survives a reload.
  hideNotes: boolean
  onSetHideNotes: (hidden: boolean) => void
  // Sign-out handler, or null when there is no auth (memory stub / dev).
  onSignOut: (() => Promise<void>) | null
}

// Vault settings were removed with the Electron layer. The reading preferences
// live in ReadingPrefs, shared with the reading view's quick display popover;
// what is left here is the rare stuff you visit Settings for.
export default function SettingsModal({
  isOpen,
  onClose,
  lookId,
  onSelectLook,
  textSize,
  onSetTextSize,
  hideNotes,
  onSetHideNotes,
  onSignOut
}: SettingsModalProps): React.ReactElement | null {
  const api = useApi()
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'error'>('idle')
  const [diagnosticsEnabled, setDiagnosticsEnabled] = useState(() => !isTelemetryOptedOut())

  const handleDiagnosticsToggle = useCallback((checked: boolean) => {
    setDiagnosticsEnabled(checked)
    setTelemetryOptedOut(!checked)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

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

  if (!isOpen) return null

  return (
    <div className="smodal-backdrop" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="smodal-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="smodal-header">
          <span className="smodal-title">Settings</span>
          <button className="smodal-close" onClick={onClose} aria-label="Close">
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

        <div className="smodal-body">
          {/* Reading preferences — appearance, scripture text size, translation.
              The SAME components the quick display popover uses (ReadingPrefs),
              not a copy: this page and the popover cannot drift, and a change
              made in either applies live everywhere. */}
          <ReadingPrefs
            lookId={lookId}
            onSelectLook={onSelectLook}
            textSize={textSize}
            onSetTextSize={onSetTextSize}
          />

          <div className="smodal-divider" />

          {/* Reading — how much of your own work shows up alongside scripture.
              The top bar's Focus button does this too, but only for the moment;
              this is the standing preference. */}
          <div className="smodal-section">
            <div className="smodal-section-label">Reading</div>
            <label className="smodal-checkbox-row">
              <input
                type="checkbox"
                className="smodal-checkbox"
                checked={hideNotes}
                onChange={e => onSetHideNotes(e.target.checked)}
              />
              <span className="smodal-checkbox-label">Hide all notes while reading</span>
            </label>
            <p className="smodal-vault-desc">
              Leaves only scripture on the reading screens. Your notes stay untouched; open a study
              to see and edit them.
            </p>
          </div>

          <div className="smodal-divider" />

          {/* Export */}
          <div className="smodal-section">
            <div className="smodal-section-label">Export</div>
            <p className="smodal-vault-desc">
              Download all your notes as a zip of Markdown files, one per passage.
            </p>
            <div className="smodal-vault-actions">
              <button
                className="smodal-vault-btn"
                onClick={() => void handleExport()}
                disabled={exportState === 'exporting'}
              >
                {exportState === 'exporting' ? 'Exporting…' : 'Export all notes'}
              </button>
            </div>
            {exportState === 'error' && (
              <p className="smodal-vault-desc" style={{ color: '#C0392B' }}>
                Export failed. Check your connection and try again.
              </p>
            )}
          </div>

          <div className="smodal-divider" />

          {/* Privacy */}
          <div className="smodal-section">
            <div className="smodal-section-label">Privacy</div>
            <label className="smodal-checkbox-row">
              <input
                type="checkbox"
                className="smodal-checkbox"
                checked={diagnosticsEnabled}
                onChange={e => handleDiagnosticsToggle(e.target.checked)}
              />
              <span className="smodal-checkbox-label">Send diagnostic reports</span>
            </label>
            <p className="smodal-vault-desc">
              When something breaks, Lantern sends a short report so it can be fixed. Reports never
              include your notes or the passages you read.
            </p>
            <a
              className="smodal-privacy-link"
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read what&apos;s in one
            </a>
          </div>

          <div className="smodal-divider" />

          {/* Account */}
          {onSignOut && (
            <div className="smodal-section">
              <div className="smodal-section-label">Account</div>
              <div className="smodal-vault-actions">
                <button className="smodal-vault-btn" onClick={() => void onSignOut()}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="smodal-footer">
          <button className="smodal-btn-save" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
