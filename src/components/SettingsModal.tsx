import React, { useCallback, useState } from 'react'
import { useApi } from '../api/context'
import { exportAllNotesAsZip } from '../platform/export'
import { LOOKS, type LookId } from '../utils/useTheme'
import { TEXT_SIZES, type TextSizeId } from '../utils/useTextSize'
import { TRANSLATIONS, useTranslation } from '../utils/useTranslation'
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

// Translation and vault settings were removed with the Electron layer.
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
  const [translation, setTranslation] = useTranslation()
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
          {/* Appearance — one curated list of complete looks. Theme, light/dark
              and pure-black used to be three separate controls; that matrix hid
              the light option (switching theme never touched dark). Now each row
              is a whole look and one tap sets all three axes (see LOOKS in
              useTheme.ts). Grouped Light / Dark / Pure black so the kind of each
              is obvious at a glance. */}
          <div className="smodal-section">
            <div className="smodal-section-label">Appearance</div>
            <div className="theme-picker" role="radiogroup" aria-label="Appearance">
              {LOOKS.map((look, i) => {
                const active = lookId === look.id
                const startsGroup = i === 0 || LOOKS[i - 1].group !== look.group
                return (
                  <React.Fragment key={look.id}>
                    {startsGroup && <div className="look-group-label">{look.group}</div>}
                    <button
                      className={`theme-swatch${active ? ' active' : ''}`}
                      onClick={() => onSelectLook(look.id)}
                      role="radio"
                      aria-checked={active}
                    >
                      <span
                        className={`theme-swatch-preview look-preview-${look.id}`}
                        aria-hidden="true"
                      >
                        <span className="look-preview-card" />
                        <span className="theme-preview-accent" />
                      </span>
                      <span className="theme-swatch-text">
                        <span className="theme-swatch-label">{look.label}</span>
                        <span className="theme-swatch-blurb">{look.blurb}</span>
                      </span>
                      {active && (
                        <svg
                          className="theme-swatch-check"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          <div className="smodal-divider" />

          {/* Translation — which scripture text is displayed, independent of
              theme/text size. Global preference (see
              docs/proposals/translations-esv-niv.md section 3): applies to
              every reading surface, defaults to BSB. */}
          <div className="smodal-section">
            <div className="smodal-section-label">Translation</div>
            <div className="translation-picker" role="radiogroup" aria-label="Bible translation">
              {TRANSLATIONS.map(t => (
                <button
                  key={t.id}
                  className={`translation-option${translation === t.id ? ' active' : ''}`}
                  onClick={() => setTranslation(t.id)}
                  role="radio"
                  aria-checked={translation === t.id}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="smodal-divider" />

          {/* Text size — scripture reading type only, independent of theme.
              A segmented row rather than the theme swatch treatment: there's
              nothing to preview beyond the label itself. */}
          <div className="smodal-section">
            <div className="smodal-section-label">Scripture text size</div>
            <div className="text-size-picker" role="radiogroup" aria-label="Scripture text size">
              {TEXT_SIZES.map(s => (
                <button
                  key={s.id}
                  className={`text-size-option${textSize === s.id ? ' active' : ''}`}
                  onClick={() => onSetTextSize(s.id)}
                  role="radio"
                  aria-checked={textSize === s.id}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

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
