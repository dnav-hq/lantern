import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { TranslationId } from '../bible/provider'
import { useReadingTranslation, useTranslationOptions } from '../utils/useTranslation'
import { useBibleLanguage } from '../utils/useBibleLanguage'

/** Closes the picker on an outside click OR any scroll (the menu is anchored to
 * a position that scrolls away, so it should dismiss rather than float). Mirrors
 * TranslationChip's own helper. */
function useDismissMenu(
  ref: React.RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active: boolean
): void {
  useEffect(() => {
    if (!active) return
    const onPointer = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    const onScroll = (): void => onDismiss()
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [ref, onDismiss, active])
}

/**
 * The chapter's translation line: a deliberately faint, thin footer under the
 * prev/next nav that names the translation you're reading and doubles as the
 * switcher — so changing translation never needs Settings, and the reading
 * header stays free of a control almost nobody touches after the first read.
 * Kept as minimal as possible on purpose: just the name for the public-domain
 * texts (BSB/KJV); ESV, NET and the two Tamil translations
 * additionally carry the copyright/attribution line their licence requires,
 * which we are not free to drop (see FinePrint).
 *
 * The menu is SCOPED TO THE READER'S BIBLE LANGUAGE — it offers that language's
 * translations and nothing else, so an English reader sees exactly BSB/KJV/ESV/NET
 * and never meets a Tamil option here. Language itself is
 * changed in reading preferences (ReadingPrefs), not in this footer: it is a
 * once-ever choice and would be clutter on every passage.
 */
/**
 * `servedTranslation` is set only when scripture was substituted because the
 * chosen translation failed (see getBibleVerse's fallbackTo). When it is, this
 * footer must name and attribute the translation ACTUALLY ON SCREEN — showing
 * Crossway's ESV copyright notice over BSB text would be a false attribution,
 * which is worse than the outage it papers over.
 */
export default function TranslationFooter({
  servedTranslation
}: {
  servedTranslation?: TranslationId
} = {}): React.ReactElement {
  const [translation, setTranslation] = useReadingTranslation()
  // What the reader CHOSE still drives the switcher; what was SERVED drives the
  // label and the licence line.
  const shown = servedTranslation ?? translation
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

  useDismissMenu(
    hostRef,
    useCallback(() => setOpen(false), []),
    open
  )

  const [language] = useBibleLanguage()
  const options = useTranslationOptions(language)
  const current = options.find(t => t.id === translation)

  return (
    <div className="translation-footer" ref={hostRef}>
      <div className="translation-footer-switch">
        <button
          type="button"
          className="translation-footer-btn"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          title={current ? `Switch translation (now ${current.label})` : 'Switch translation'}
        >
          {shown}
          <svg
            className="translation-footer-caret"
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {/* Opens UPWARD and left-anchored — the footer sits at the bottom of the
            scroll. Shared menu-motion classes (translation-chip-menu). */}
        <div
          className={`nav-menu translation-chip-menu translation-footer-menu${open ? ' open' : ''}`}
          role="menu"
          aria-hidden={!open}
        >
          {options.map(t => (
            <button
              key={t.id}
              className={`nav-menu-item${t.id === translation ? ' active' : ''}`}
              role="menuitem"
              onClick={() => {
                setTranslation(t.id)
                setOpen(false)
              }}
            >
              <span className="translation-chip-menu-abbr">{t.id}</span>
              {t.label}
              {t.id === translation && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginLeft: 'auto', flexShrink: 0 }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      <FinePrint translation={shown} />
    </div>
  )
}

const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/'

/**
 * The licence line, where the licence requires one. BSB and KJV need nothing;
 * ESV carries Crossway's copyright notice; NET carries Biblical Studies Press's
 * notice plus the "(NET)" link its free-app terms ask for; both Tamil texts are
 * CC BY-SA 4.0,
 * which requires naming the licensor and linking the licence wherever the text
 * is shown — so it renders on the same faint footer line, in the same place,
 * as ESV's. Same pattern, one component, no per-surface duplication.
 */
function FinePrint({ translation }: { translation: TranslationId }): React.ReactElement | null {
  if (translation === 'ESV') {
    return (
      <p className="translation-footer-fine">
        Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®),
        copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by
        permission. All rights reserved. ESV Text Edition: 2016.{' '}
        <a href="https://www.esv.org" target="_blank" rel="noopener noreferrer">
          esv.org
        </a>
      </p>
    )
  }
  if (translation === 'NET') {
    // The NET licence permits quotation in electronic media without written
    // permission; for a free app the requirement is that the quotation carry
    // "(NET)" linked to netbible.com, alongside the standard notice. The
    // licence covers the TEXT ONLY — the NET translator notes are excluded and
    // are not shipped (see src/bible/net-self-hosted.ts).
    return (
      <p className="translation-footer-fine">
        Scripture quoted by permission from the NET Bible® copyright ©1996-2017 by Biblical Studies
        Press, L.L.C. All rights reserved.{' '}
        <a href="https://netbible.com" target="_blank" rel="noopener noreferrer">
          (NET)
        </a>
      </p>
    )
  }
  if (translation === 'IRV') {
    return (
      <p className="translation-footer-fine">
        Tamil Indian Revised Version (IRV), © Bridge Connectivity Solutions Pvt. Ltd. Licensed under{' '}
        <a href={CC_BY_SA} target="_blank" rel="noopener noreferrer">
          CC BY-SA 4.0
        </a>
        .
      </p>
    )
  }
  if (translation === 'TCV') {
    return (
      <p className="translation-footer-fine">
        Biblica® Open Tamil Contemporary Version™, © Biblica, Inc. Licensed under{' '}
        <a href={CC_BY_SA} target="_blank" rel="noopener noreferrer">
          CC BY-SA 4.0
        </a>
        .
      </p>
    )
  }
  return null
}
