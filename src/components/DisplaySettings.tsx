import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReadingPrefs, { type DisplayPrefs } from './ReadingPrefs'
import { anchoredPopoverPosition, type Position } from './displayPopover'

// Matches the breakpoint main.css uses to turn modals into bottom sheets.
const SHEET_QUERY = '(max-width: 768px)'

interface DisplaySettingsProps {
  prefs: DisplayPrefs
}

/**
 * The reading view's display-options control — the Kindle / Apple Books "aA"
 * pattern. It is a UTILITY, not a destination: tapping it lays the reading
 * preferences over the passage you are reading (a bottom sheet on mobile, a
 * popover anchored to the icon on desktop) so changing your look, text size or
 * translation never costs you your place. Nothing navigates.
 *
 * The full Settings modal keeps the rare things — account, export, privacy,
 * hide-all-notes — and shows the very same preference controls via ReadingPrefs.
 */
export default function DisplaySettings({ prefs }: DisplaySettingsProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [isSheet, setIsSheet] = useState(() => window.matchMedia(SHEET_QUERY).matches)
  const [position, setPosition] = useState<Position | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const mq = window.matchMedia(SHEET_QUERY)
    const onChange = (): void => setIsSheet(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Anchored (desktop) placement. position: fixed + a measured rect rather than
  // an absolutely-positioned child, so no scrolling/overflow ancestor in the
  // three different reading headers can clip it. Re-measured on scroll and
  // resize so it stays pinned to the icon instead of dismissing (the sheet
  // needs none of this — CSS owns it).
  useLayoutEffect(() => {
    if (!open || isSheet) return
    const place = (): void => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) return
      setPosition(
        anchoredPopoverPosition(
          trigger.getBoundingClientRect(),
          { width: panel.offsetWidth, height: panel.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight }
        )
      )
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, isSheet])

  // Focus moves into the dialog on open and back to the icon on close, and
  // Escape closes from anywhere inside it.
  useEffect(() => {
    if (!open) return
    // Captured for the cleanup: by the time it runs the ref may already point
    // somewhere else, and the whole point is to hand focus back to the icon
    // that was there when the popover opened.
    const trigger = triggerRef.current
    panelRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [open, close])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`reading-ctl-btn display-settings-trigger${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Display settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Display settings — appearance, text size, translation"
      >
        {/* The universal "aA" glyph rather than a gear: this is type and look,
            not configuration, and a gear would read as a second Settings. */}
        <span className="display-settings-glyph" aria-hidden="true">
          <span className="display-settings-glyph-sm">a</span>A
        </span>
      </button>

      {open && (
        <>
          {/* Catches the outside tap. Visible as a scrim only in sheet form —
              on desktop the passage behind must stay plainly readable while you
              try a look, so it is transparent there. */}
          <div className="display-scrim" onClick={close} aria-hidden="true" />
          <div
            ref={panelRef}
            className={`display-popover${isSheet ? ' display-popover--sheet' : ''}`}
            style={!isSheet && position ? { top: position.top, left: position.left } : undefined}
            role="dialog"
            aria-modal="true"
            aria-label="Display settings"
            tabIndex={-1}
          >
            <div className="display-popover-head">
              <span className="display-popover-title">Display</span>
              <button
                type="button"
                className="display-popover-close"
                onClick={close}
                aria-label="Close display settings"
              >
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
            <div className="display-popover-body">
              <ReadingPrefs {...prefs} />
            </div>
          </div>
        </>
      )}
    </>
  )
}
